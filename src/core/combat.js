// Combat engine. Pure logic, no DOM: the UI and the simulation bot drive it
// through the same API and read `events` to animate what happened.
//
// Turn structure
//   player turn:  startPlayerTurn() -> playCard()/useCell()* -> endTurn()
//   enemy phase:  enemyStep() once per enemy (the UI animates in between)
//   end of round: duration statuses tick down, next player turn starts
//
// Cards whose effect needs a decision (e.g. "pick a card from your discard
// pile") are generators that `yield g.choose(...)`. The engine pauses in
// `pending` until resolveChoice() is called.

import { CARDS, cardFlag, baseCost, cardVals } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { STATUSES, DURATION_STATUSES, CLEANSABLE } from '../data/statuses.js';
import { RELICS } from '../data/relics.js';
import { CELLS } from '../data/cells.js';

export const HAND_LIMIT = 10;
export const BASE_ENERGY = 3;
export const BASE_DRAW = 5;
export const MAX_ENEMIES = 5;

const freshTurnInfo = () => ({ cards: 0, attacks: 0, skills: 0 });

function makeUnit(props) {
  return { shield: 0, statuses: {}, fresh: new Set(), alive: true, vars: {}, ...props };
}

const isIterator = (x) => x && typeof x.next === 'function';

export class Combat {
  /**
   * @param run        run state (deck, relics, hp, cells are read/written)
   * @param encounter  array of enemy ids
   * @param opts       { kind: 'normal'|'elite'|'boss', rng, aiRng }
   */
  constructor(run, encounter, { kind = 'normal', rng, aiRng } = {}) {
    this.run = run;
    this.kind = kind;
    this.rng = rng;
    this.aiRng = aiRng;
    this.encounter = encounter;
    this.events = [];
    this.turn = 0;
    this.phase = 'setup';
    this.outcome = null;
    this.pending = null;
    this.active = null;
    this.limbo = null;
    this.curPlay = null;
    this.autoChoose = null;
    this.enemySeq = 1;
    this.cardSeq = 1;
    this.player = makeUnit({ ref: 'P', isPlayer: true, name: 'Runner', hp: run.hp, maxHp: run.maxHp });
    this.enemies = [];
    this.enemyQueue = [];
    this.energy = 0;
    this.turnInfo = freshTurnInfo();
    this.combatInfo = { firstAttackDone: false, failsafe: false };
    this.stats = { dealt: 0, taken: 0, played: 0, kills: 0 };
    this.draw = [];
    this.hand = [];
    this.discard = [];
    this.faded = [];
  }

  // ------------------------------------------------------------- setup ----

  start() {
    const cards = this.run.deck.map((c) => this.makeCard(c.id, c.up, c.uid));
    this.draw = this.rng.shuffle(cards);

    this.encounter.forEach((id, index) => this.spawnEnemy(id, { index }));
    for (const e of [...this.enemies]) e.def.onCombatStart?.(this, e);
    this.callRelics('onCombatStart');
    // Opening cards go on top last, so cards shuffled in at combat start
    // (e.g. Static Heart's Static) can't push them out of the first draw.
    const opening = this.draw.filter((c) => this.flag(c, 'opening'));
    this.draw = [...this.draw.filter((c) => !this.flag(c, 'opening')), ...opening];
    this.openingCount = opening.length;
    this.startPlayerTurn();
    return this;
  }

  makeCard(id, up = false, uid = null) {
    return { uid: uid ?? `g${this.cardSeq++}`, id, up: !!up, def: CARDS[id], bonus: 0 };
  }

  spawnEnemy(id, { index, minionOf = null } = {}) {
    const def = ENEMIES[id];
    const hp = this.aiRng.int(def.hp[0], def.hp[1]);
    const e = makeUnit({
      ref: `E${this.enemySeq++}`, id, def, name: def.name, hp, maxHp: hp,
      isPlayer: false, history: [], move: null, minionOf: minionOf ? minionOf.ref : null,
    });
    Object.assign(e.statuses, def.statuses || {});
    if (minionOf) e.statuses.minion = 1;
    const slot = minionOf ? this.enemies.findIndex((x) => !x.alive) : -1;
    if (slot >= 0) this.enemies[slot] = e;
    else this.enemies.push(e);
    def.onSpawn?.(this, e, index ?? this.enemies.indexOf(e));
    this.chooseMove(e);
    this.events.push({ t: 'spawn', tgt: e.ref });
    return e;
  }

  /** Summon a minion for `owner`, respecting the global enemy cap. */
  summon(id, owner) {
    if (this.aliveEnemies().length >= MAX_ENEMIES) return null;
    return this.spawnEnemy(id, { minionOf: owner });
  }

  // ----------------------------------------------------------- queries ----

  aliveEnemies() { return this.enemies.filter((e) => e.alive); }
  enemyByRef(ref) { return this.enemies.find((e) => e.ref === ref) || null; }
  unitByRef(ref) { return ref === 'P' ? this.player : this.enemyByRef(ref); }
  minionsOf(owner) { return this.enemies.filter((e) => e.alive && e.minionOf === owner.ref); }
  status(u, id) { return (u && u.statuses[id]) || 0; }
  hasRelic(id) { return this.run.relics.some((r) => r.id === id); }
  flag(card, name) { return cardFlag(card.id, card.up, name); }

  maxEnergy() {
    return BASE_ENERGY + this.run.relics.reduce((s, r) => s + (RELICS[r.id].energy || 0), 0);
  }

  callRelics(hook, ...args) {
    for (const r of this.run.relics) {
      const fn = RELICS[r.id][hook];
      if (fn) fn(this, r, ...args);
      if (this.outcome) return;
    }
  }

  flashRelic(id) { this.events.push({ t: 'relic', id }); }

  /** Pull and clear queued events (used by the UI). */
  drain() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  // ------------------------------------------------------------- damage ---

  calcAttack(src, tgt, base) {
    let d = base;
    if (src) d += this.status(src, 'amp');
    if (src === this.player && this.curPlay?.double) d *= 2;
    if (src && this.status(src, 'jammed') > 0) d *= 0.75;
    if (tgt && this.status(tgt, 'exposed') > 0) d *= 1.5;
    d = Math.max(0, Math.floor(d));
    if (tgt && this.status(tgt, 'phased') > 0) d = Math.min(d, 1);
    return d;
  }

  previewAttack(base, tgt = null) { return this.calcAttack(this.player, tgt, base); }

  previewShield(base) {
    let n = base + this.status(this.player, 'plating');
    if (this.status(this.player, 'fragile') > 0) n = Math.floor(n * 0.75);
    return Math.max(0, n);
  }

  /** Player attacks a single enemy. */
  attack(tgt, base, opts = {}) { return this.attackUnit(this.player, tgt, base, opts); }

  attackAll(base) {
    let total = 0;
    for (const e of this.aliveEnemies()) total += this.attackUnit(this.player, e, base).hpLoss;
    return total;
  }

  attackRandom(base) {
    const t = this.rng.pick(this.aliveEnemies());
    return t ? this.attackUnit(this.player, t, base) : null;
  }

  attackUnit(src, tgt, base, { pierce = false } = {}) {
    if (!tgt || !tgt.alive) return { dmg: 0, blocked: 0, hpLoss: 0, killed: false };
    const dmg = this.calcAttack(src, tgt, base);
    let blocked = 0;
    if (!pierce) {
      blocked = Math.min(tgt.shield, dmg);
      tgt.shield -= blocked;
    }
    this.events.push({ t: 'attack', src: src ? src.ref : null, tgt: tgt.ref, dmg, blocked });
    const hpLoss = this.hpDamage(tgt, dmg - blocked, 'attack');
    const spikes = this.status(tgt, 'spikes');
    if (spikes > 0 && src && src.alive && src !== tgt) this.dealDamage(src, spikes, 'spikes');
    return { dmg, blocked, hpLoss, killed: !tgt.alive };
  }

  /** Non-attack damage (spikes, cells, relics): blocked by Shield, not modified by Amp. */
  dealDamage(u, n, cause) {
    if (!u || !u.alive || n <= 0) return 0;
    if (this.status(u, 'phased') > 0) n = Math.min(n, 1);
    const blocked = Math.min(u.shield, n);
    u.shield -= blocked;
    if (blocked) this.events.push({ t: 'blocked', tgt: u.ref, n: blocked });
    return this.hpDamage(u, n - blocked, cause);
  }

  /** Direct HP loss that ignores Shield (Burn, self-damage). */
  loseHp(u, n, cause) { return this.hpDamage(u, n, cause); }

  hpDamage(u, n, cause) {
    if (!u || !u.alive || n <= 0) return 0;
    if (this.status(u, 'phased') > 0) n = Math.min(n, 1);
    const barrier = this.status(u, 'rift_barrier');
    if (barrier > 0) {
      const room = Math.max(0, barrier - (u.vars.roundLoss || 0));
      n = Math.min(n, room);
      u.vars.roundLoss = (u.vars.roundLoss || 0) + n;
      if (n <= 0) { this.events.push({ t: 'barrier', tgt: u.ref }); return 0; }
    }
    const actual = Math.min(n, u.hp);
    u.hp -= actual;
    this.events.push({ t: 'damage', tgt: u.ref, n: actual, cause });
    if (u.isPlayer) {
      this.stats.taken += actual;
      this.callRelics('onPlayerHpLoss');
    } else {
      this.stats.dealt += actual;
      u.def.onHit?.(this, u, actual);
    }
    this.checkDeath(u);
    return actual;
  }

  heal(u, n) {
    if (!u || !u.alive || n <= 0) return 0;
    const actual = Math.min(n, u.maxHp - u.hp);
    if (actual <= 0) return 0;
    u.hp += actual;
    this.events.push({ t: 'heal', tgt: u.ref, n: actual });
    return actual;
  }

  /** Remove an enemy without it counting as a kill (e.g. a mine detonating). */
  destroy(e, cause) {
    if (!e.alive) return;
    e.hp = 0;
    e.vars.noKill = true;
    this.events.push({ t: 'damage', tgt: e.ref, n: 0, cause });
    this.checkDeath(e);
  }

  checkDeath(u) {
    if (!u.alive || u.hp > 0) return;
    if (u.isPlayer) {
      const sigil = this.run.relics.find((r) => r.id === 'phoenix_sigil' && r.counter > 0);
      if (sigil) {
        sigil.counter = 0;
        this.heal(u, Math.floor(u.maxHp * 0.5));
        this.flashRelic('phoenix_sigil');
        return;
      }
      u.alive = false;
      this.outcome = 'lose';
      this.phase = 'over';
      this.events.push({ t: 'death', tgt: 'P' });
      return;
    }
    u.alive = false;
    u.shield = 0;
    if (!u.vars.noKill) this.stats.kills++;
    this.events.push({ t: 'death', tgt: u.ref });
    u.def.onDeath?.(this, u);
    for (const m of this.enemies) {
      if (m.alive && m.minionOf === u.ref) {
        m.alive = false;
        m.hp = 0;
        this.events.push({ t: 'flee', tgt: m.ref });
      }
    }
    for (const a of this.aliveEnemies()) a.def.onAllyDeath?.(this, a, u);
    if (!this.aliveEnemies().length && !this.outcome) {
      this.outcome = 'win';
      this.phase = 'over';
      this.events.push({ t: 'win' });
    }
  }

  // ------------------------------------------------------ shield/status ---

  gainShield(u, n, fromCard) {
    if (!u || !u.alive) return 0;
    if (fromCard) {
      n += this.status(u, 'plating');
      if (this.status(u, 'fragile') > 0) n *= 0.75;
    }
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    u.shield += n;
    this.events.push({ t: 'shield', tgt: u.ref, n });
    return n;
  }

  /** Shield gained from a card effect (applies Plating and Fragile). */
  shield(n) { return this.gainShield(this.player, n, true); }

  applyStatus(u, id, n, src = this.player) {
    if (!u || !u.alive || !n) return;
    if (id === 'burn' && n > 0 && !u.isPlayer && src === this.player && this.hasRelic('ember_core')) n += 1;
    this.setStatus(u, id, (u.statuses[id] || 0) + n);
    // Durations applied during the enemy phase survive the upcoming round end.
    if (DURATION_STATUSES.has(id) && n > 0 && this.phase === 'enemy') u.fresh.add(id);
    this.events.push({ t: 'status', tgt: u.ref, id, n });
  }

  setStatus(u, id, n) {
    const def = STATUSES[id];
    if (n === 0 || (!def.negative && n < 0)) delete u.statuses[id];
    else u.statuses[id] = n;
  }

  cleanse(u) {
    for (const id of CLEANSABLE) delete u.statuses[id];
    this.events.push({ t: 'cleanse', tgt: u.ref });
  }

  gainEnergy(n) {
    this.energy += n;
    this.events.push({ t: 'energy', n });
  }

  gainCharge(n) {
    if (n <= 0) return;
    this.applyStatus(this.player, 'charge', n);
    const shell = this.status(this.player, 'static_shell');
    if (shell > 0) this.gainShield(this.player, shell * n, false);
  }

  tickTurnStart(u) {
    for (const id of Object.keys(u.statuses)) {
      const n = u.statuses[id];
      const fn = STATUSES[id]?.onTurnStart;
      if (fn && n) fn(this, u, n);
      if (!u.alive || this.outcome) return;
    }
  }

  tickTurnEnd(u) {
    for (const id of Object.keys(u.statuses)) {
      const n = u.statuses[id];
      const fn = STATUSES[id]?.onTurnEnd;
      if (fn && n) fn(this, u, n);
      if (!u.alive || this.outcome) return;
    }
  }

  // -------------------------------------------------------------- cards ---

  drawCards(n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= HAND_LIMIT) break;
      if (!this.draw.length) {
        if (!this.discard.length) break;
        this.draw = this.rng.shuffle(this.discard);
        this.discard = [];
        this.events.push({ t: 'shuffle', n: this.draw.length });
      }
      const c = this.draw.pop();
      this.hand.push(c);
      drawn++;
      this.events.push({ t: 'draw', uid: c.uid });
    }
    return drawn;
  }

  removeFromPiles(card) {
    for (const pile of [this.hand, this.draw, this.discard, this.faded]) {
      const i = pile.indexOf(card);
      if (i >= 0) { pile.splice(i, 1); return; }
    }
    if (this.limbo === card) this.limbo = null;
  }

  moveCard(card, to) {
    this.removeFromPiles(card);
    if (to === 'hand' && this.hand.length >= HAND_LIMIT) to = 'discard';
    this[to].push(card);
    this.events.push({ t: 'move', uid: card.uid, to });
  }

  discardCard(card) {
    this.removeFromPiles(card);
    this.discard.push(card);
    this.events.push({ t: 'discard', uid: card.uid });
  }

  fadeCard(card) {
    this.removeFromPiles(card);
    this.faded.push(card);
    this.events.push({ t: 'fade', uid: card.uid });
    this.callRelics('onFade', card);
  }

  /** Create new cards mid-combat (Static, Scorch, ...). */
  addCard(id, pile, { up = false, n = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const c = this.makeCard(id, up);
      let to = pile;
      if (to === 'hand' && this.hand.length >= HAND_LIMIT) to = 'discard';
      if (to === 'draw') this.draw.splice(this.rng.int(0, this.draw.length), 0, c);
      else this[to].push(c);
      this.events.push({ t: 'addCard', uid: c.uid, id, pile: to });
    }
  }

  costOf(card) {
    const def = card.def;
    if (def.cost === null || def.cost === undefined) return null;
    if (def.cost === 'X') return 'X';
    let c = baseCost(card.id, card.up);
    if (def.costFn) c = def.costFn(this, c, card);
    return Math.max(0, c);
  }

  valsOf(card, x = 0) {
    let v = { ...cardVals(card.id, card.up), x };
    if (card.def.dyn) v = card.def.dyn(this, v, card);
    return v;
  }

  isPlayable(card) {
    if (this.flag(card, 'unplayable')) return false;
    const cost = this.costOf(card);
    if (cost === null) return false;
    return cost === 'X' || cost <= this.energy;
  }

  canPlay(card) {
    return this.phase === 'player' && !this.pending && !this.outcome
      && this.hand.includes(card) && this.isPlayable(card);
  }

  needsTarget(card) { return card.def.target === 'enemy'; }

  playCard(uid, targetRef = null) {
    const card = this.hand.find((c) => c.uid === uid);
    if (!card || !this.canPlay(card)) return false;
    let target = null;
    if (this.needsTarget(card)) {
      target = this.enemyByRef(targetRef);
      if (!target || !target.alive) {
        const alive = this.aliveEnemies();
        if (alive.length !== 1) return false;
        target = alive[0];
      }
    }
    this.run_(this.playGen(card, target));
    return true;
  }

  *playGen(card, target) {
    const def = card.def;
    const cost = this.costOf(card);
    this.removeFromPiles(card);
    this.limbo = card;
    let x = 0;
    if (cost === 'X') { x = this.energy; this.energy = 0; } else this.energy -= cost;

    this.turnInfo.cards++;
    if (def.type === 'attack') this.turnInfo.attacks++;
    if (def.type === 'skill') this.turnInfo.skills++;
    this.stats.played++;
    this.curPlay = { card, double: false };
    this.callRelics('beforePlay', card);

    let times = 1;
    // Echo doubles only the first card(s) of the turn, counted by cards played this turn.
    if (this.turnInfo.cards <= this.status(this.player, 'echo')) times++;
    if (def.type === 'attack' && !this.combatInfo.firstAttackDone) {
      this.combatInfo.firstAttackDone = true;
      if (this.hasRelic('mirror_core')) { times++; this.flashRelic('mirror_core'); }
    }
    this.events.push({ t: 'play', uid: card.uid, id: card.id, type: def.type, target: target ? target.ref : null, times });

    for (let i = 0; i < times && !this.outcome; i++) {
      let t = target;
      if (this.needsTarget(card) && (!t || !t.alive)) t = this.rng.pick(this.aliveEnemies());
      if (this.needsTarget(card) && !t) break;
      const r = def.play(this, this.valsOf(card, x), t, card);
      if (isIterator(r)) yield* r;
    }
    this.curPlay = null;

    if (!this.outcome) {
      const ghost = this.status(this.player, 'ghost');
      if (ghost > 0) this.gainShield(this.player, ghost, false);
      this.callRelics('onCardPlayed', card);
      for (const e of this.aliveEnemies()) e.def.onPlayerCard?.(this, e, card);
    }

    this.limbo = null;
    if (def.type === 'power') this.events.push({ t: 'power', uid: card.uid });
    else if (this.flag(card, 'fade')) this.fadeCard(card);
    else { this.discard.push(card); this.events.push({ t: 'discard', uid: card.uid }); }
  }

  /** Ask the player to pick cards. Use as `const picked = yield g.choose(...)`. */
  choose({ options, min = 1, max = 1, prompt = 'Choose a card' }) {
    return { options, min: Math.min(min, options.length), max, prompt };
  }

  run_(gen) {
    this.active = gen;
    this.step_(undefined);
  }

  step_(input) {
    for (;;) {
      const r = this.active.next(input);
      if (r.done) { this.active = null; return; }
      const req = r.value;
      if (!req.options.length) { input = []; continue; }
      if (this.autoChoose) { input = this.autoChoose(req, this); continue; }
      this.pending = req;
      return;
    }
  }

  resolveChoice(uids) {
    const req = this.pending;
    if (!req) return false;
    let picked = req.options.filter((c) => uids.includes(c.uid)).slice(0, req.max);
    if (picked.length < req.min) return false;
    this.pending = null;
    this.step_(picked);
    return true;
  }

  useCell(slot, targetRef = null) {
    const id = this.run.cells[slot];
    if (!id || this.phase !== 'player' || this.pending || this.outcome) return false;
    const def = CELLS[id];
    let t = null;
    if (def.target === 'enemy') {
      t = this.enemyByRef(targetRef);
      if (!t || !t.alive) {
        const alive = this.aliveEnemies();
        if (alive.length !== 1) return false;
        t = alive[0];
      }
    }
    this.run.cells[slot] = null;
    this.events.push({ t: 'cell', id, target: t ? t.ref : null });
    def.use(this, t);
    return true;
  }

  // -------------------------------------------------------------- turns ---

  startPlayerTurn() {
    if (this.outcome) return;
    this.turn++;
    this.phase = 'player';
    this.turnInfo = freshTurnInfo();
    for (const u of [this.player, ...this.enemies]) u.vars.roundLoss = 0;
    const p = this.player;
    // Turn 1 keeps Shield granted at combat start (e.g. Kinetic Plate).
    if (this.turn > 1 && !this.status(p, 'bulwark') && p.shield) {
      p.shield = 0;
      this.events.push({ t: 'shieldReset', tgt: 'P' });
    }
    const carry = this.run.relics.some((r) => RELICS[r.id].keepEnergy) ? this.energy : 0;
    this.energy = this.maxEnergy() + carry;
    this.events.push({ t: 'turn', turn: this.turn });

    this.tickTurnStart(p);
    if (this.outcome) return;
    this.callRelics('onTurnStart');
    if (this.outcome) return;

    let n = BASE_DRAW + this.status(p, 'uplink');
    for (const r of this.run.relics) n += RELICS[r.id].drawBonus?.(this) || 0;
    if (this.turn === 1) n = Math.max(n, this.openingCount);
    this.drawCards(n);
  }

  endTurn() {
    if (this.phase !== 'player' || this.pending || this.outcome) return false;
    const p = this.player;
    this.tickTurnEnd(p);
    if (!this.outcome) this.callRelics('onTurnEnd');
    for (const c of [...this.hand]) {
      if (this.outcome) break;
      if (c.id === 'scorch') this.dealDamage(p, c.def.vals.hp, 'scorch');
    }
    if (this.outcome) return true;
    for (const c of [...this.hand]) {
      if (this.flag(c, 'volatile')) this.fadeCard(c);
      else if (!this.flag(c, 'hold')) this.discardCard(c);
    }
    this.phase = 'enemy';
    this.enemyQueue = this.aliveEnemies().map((e) => e.ref);
    this.events.push({ t: 'enemyPhase' });
    return true;
  }

  /** Run the next enemy's turn. Returns true while the enemy phase continues. */
  enemyStep() {
    if (this.phase !== 'enemy') return false;
    while (this.enemyQueue.length) {
      const e = this.enemyByRef(this.enemyQueue.shift());
      if (!e || !e.alive) continue;
      this.enemyTurn(e);
      if (this.outcome) return false;
      if (this.enemyQueue.some((ref) => this.enemyByRef(ref)?.alive)) return true;
      break;
    }
    this.endRound();
    return false;
  }

  enemyTurn(e) {
    if (!this.status(e, 'bulwark') && e.shield) {
      e.shield = 0;
      this.events.push({ t: 'shieldReset', tgt: e.ref });
    }
    this.events.push({ t: 'enemyTurn', src: e.ref });
    this.tickTurnStart(e);
    if (!e.alive || this.outcome) return;
    const move = e.def.moves[e.move];
    this.events.push({ t: 'act', src: e.ref, move: e.move, name: move.name });
    this.execMove(e, move);
    e.history.push(e.move);
    if (this.outcome || !e.alive) return;
    this.tickTurnEnd(e);
    if (e.alive && !this.outcome) this.chooseMove(e);
  }

  execMove(e, m) {
    const val = (x) => (typeof x === 'function' ? x(this, e) : x);
    const p = this.player;
    if (m.dmg !== undefined) {
      const hits = val(m.hits) || 1;
      for (let i = 0; i < hits; i++) {
        if (!p.alive || !e.alive || this.outcome) return;
        this.attackUnit(e, p, val(m.dmg));
      }
    }
    if (!e.alive || this.outcome) return;
    if (m.shield) this.gainShield(e, val(m.shield), false);
    if (m.shieldAll) for (const a of this.aliveEnemies()) this.gainShield(a, val(m.shieldAll), false);
    if (m.buff) for (const [id, n] of Object.entries(m.buff)) this.applyStatus(e, id, n, e);
    if (m.buffAll) for (const a of this.aliveEnemies()) for (const [id, n] of Object.entries(m.buffAll)) this.applyStatus(a, id, n, e);
    if (m.debuff) for (const [id, n] of Object.entries(m.debuff)) this.applyStatus(p, id, n, e);
    if (m.addCards) for (const spec of m.addCards) this.addCard(spec.id, spec.to, { n: spec.n });
    if (m.heal) this.heal(e, val(m.heal));
    if (m.summon) {
      for (let i = 0; i < m.summon.n; i++) {
        if (this.minionsOf(e).length >= m.summon.max) break;
        this.summon(m.summon.id, e);
      }
    }
    if (m.special) m.special(this, e);
  }

  chooseMove(e) {
    e.move = e.def.ai(e, this, this.aiRng);
    this.events.push({ t: 'intent', tgt: e.ref });
  }

  endRound() {
    for (const u of [this.player, ...this.enemies]) {
      if (!u.alive) continue;
      for (const id of DURATION_STATUSES) {
        if (!u.statuses[id] || u.fresh.has(id)) continue;
        this.setStatus(u, id, u.statuses[id] - 1);
      }
      u.fresh.clear();
    }
    this.startPlayerTurn();
  }

  // ------------------------------------------------------------ display ---

  /** What an enemy is about to do, with damage already modified by statuses. */
  intentOf(e) {
    const m = e.def.moves[e.move];
    if (!m || !e.alive) return null;
    const val = (x) => (typeof x === 'function' ? x(this, e) : x);
    const types = [];
    let dmg = null;
    let hits = 1;
    if (m.dmg !== undefined) {
      dmg = this.calcAttack(e, this.player, val(m.dmg));
      hits = val(m.hits) || 1;
      types.push('attack');
    }
    if (m.shield || m.shieldAll) types.push('defend');
    if (m.buff || m.buffAll || m.heal) types.push('buff');
    if (m.debuff || m.addCards) types.push('debuff');
    if (m.summon) types.push('summon');
    if (m.intent) types.unshift(m.intent);
    if (!types.length) types.push('unknown');
    return { type: types[0], types, dmg, hits, name: m.name, move: m };
  }

  /** Sync results back into the run. Returns true on victory. */
  finish() {
    const won = this.outcome === 'win';
    this.run.hp = Math.max(0, this.player.hp);
    if (won) {
      for (const r of this.run.relics) {
        const heal = RELICS[r.id].combatEndHeal;
        if (heal) this.run.hp = Math.min(this.run.maxHp, this.run.hp + heal);
      }
    }
    return won;
  }
}
