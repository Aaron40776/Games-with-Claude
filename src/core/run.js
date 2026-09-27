// Run state: everything between combats. The run object is plain JSON so it
// can be saved to localStorage and resumed at any room boundary.

import { RNG, hashString } from './rng.js';
import { Combat } from './combat.js';
import { generateMap, MAP_ROWS } from './map.js';
import { CARDS, REWARD_POOL, STARTER_DECK, canUpgrade } from '../data/cards.js';
import { ENCOUNTERS } from '../data/enemies.js';
import { RELICS, RELIC_POOLS } from '../data/relics.js';
import { CELLS, CELL_WEIGHTS } from '../data/cells.js';
import { EVENTS } from '../data/events.js';

export const SAVE_VERSION = 1;
export const START_HP = 72;
export const FINAL_ACT = 3;

// ------------------------------------------------------------------ RNG ----

/** RNG stream whose state lives inside the run, so saving/loading continues it. */
class BoundRNG extends RNG {
  constructor(run, name) {
    super(run.rngState[name] ?? hashString(`${run.seed}|${name}`));
    this.run = run;
    this.name = name;
  }
  next() {
    const v = super.next();
    this.run.rngState[this.name] = this.s;
    return v;
  }
}
export const rngOf = (run, name) => new BoundRNG(run, name);

// ---------------------------------------------------------------- setup ----

export function newRun(seed) {
  const run = {
    v: SAVE_VERSION,
    seed,
    act: 1,
    floor: 0,
    hp: START_HP,
    maxHp: START_HP,
    shards: 99,
    deck: [],
    uidSeq: 1,
    relics: [{ id: 'rift_anchor' }],
    cells: [null, null, null],
    map: null,
    pos: null,
    path: [],
    room: null,
    rngState: {},
    rarePity: -5,
    cellChance: 40,
    seenEvents: [],
    recentEncounters: [],
    easyLeft: 3,
    removeCost: 75,
    stats: { kills: 0, elites: 0, bosses: 0, played: 0, taken: 0, shardsEarned: 0, turns: 0, startedAt: Date.now() },
    over: null,
  };
  for (const id of STARTER_DECK) addToDeck(run, id);
  startAct(run, 1);
  enterEvent(run, 'rift_gate');
  return run;
}

function startAct(run, act) {
  run.act = act;
  run.map = generateMap(rngOf(run, `map-${act}`), act);
  run.pos = null;
  run.path = [];
  run.easyLeft = 3;
  run.recentEncounters = [];
}

export function addToDeck(run, id, up = false) {
  const card = { uid: `c${run.uidSeq++}`, id, up: !!up };
  run.deck.push(card);
  return card;
}

export function hasRelic(run, id) { return run.relics.some((r) => r.id === id); }

export function addRelic(run, id) {
  if (!id || hasRelic(run, id)) return false;
  const def = RELICS[id];
  run.relics.push(def.counter !== undefined ? { id, counter: def.counter } : { id });
  def.onPickup?.(run);
  return true;
}

export function addCell(run, id) {
  const slot = run.cells.indexOf(null);
  if (slot < 0) return false;
  run.cells[slot] = id;
  return true;
}

export function gainShards(run, n) {
  run.shards = Math.max(0, run.shards + n);
  if (n > 0) run.stats.shardsEarned += n;
}

export function healRun(run, n) {
  run.hp = Math.min(run.maxHp, run.hp + Math.max(0, n));
}

// ------------------------------------------------------------------ map ----

export function reachableNodes(run) {
  const { nodes } = run.map;
  if (!run.pos) return Object.values(nodes).filter((n) => n.row === 0).map((n) => n.id);
  return nodes[run.pos].next;
}

export function travel(run, nodeId) {
  if (run.room || !reachableNodes(run).includes(nodeId)) return false;
  const node = run.map.nodes[nodeId];
  run.pos = nodeId;
  run.path.push(nodeId);
  run.floor++;
  enterRoom(run, node.type);
  return true;
}

function enterRoom(run, type) {
  switch (type) {
    case 'combat': {
      const tier = run.easyLeft > 0 ? 'easy' : 'normal';
      run.easyLeft--;
      run.room = { type, stage: 'fight', encounter: pickEncounter(run, tier) };
      break;
    }
    case 'elite':
      run.room = { type, stage: 'fight', encounter: pickEncounter(run, 'elite') };
      break;
    case 'boss':
      run.room = { type, stage: 'fight', encounter: ENCOUNTERS[run.act].boss[0] };
      break;
    case 'event':
      enterEvent(run, pickEvent(run));
      break;
    case 'shop':
      run.room = { type, stock: generateShop(run), removed: false };
      break;
    case 'rest':
      run.room = { type, done: false };
      break;
    case 'treasure': {
      const r = rngOf(run, 'treasure');
      run.room = { type, opened: false, relic: rollRelic(run, rollTier(r)), shards: r.int(20, 35) };
      break;
    }
    default:
      throw new Error(`Unknown room type ${type}`);
  }
}

function pickEncounter(run, tier) {
  const r = rngOf(run, 'encounters');
  const pool = ENCOUNTERS[run.act][tier];
  const fresh = pool.filter((enc) => !run.recentEncounters.includes(enc.join('+')));
  const enc = r.pick(fresh.length ? fresh : pool);
  run.recentEncounters = [enc.join('+'), ...run.recentEncounters].slice(0, 2);
  return enc;
}

// --------------------------------------------------------------- combat ----

export function combatKind(room) {
  if (room.type === 'event') return room.fightKind || 'normal';
  if (room.type === 'elite') return 'elite';
  if (room.type === 'boss') return 'boss';
  return 'normal';
}

/** Build the Combat for the current room. Seeded per floor, so a reload replays it identically. */
export function makeCombat(run) {
  const room = run.room;
  const g = new Combat(run, room.encounter, {
    kind: combatKind(room),
    rng: new RNG(hashString(`${run.seed}|combat-${run.floor}`)),
    aiRng: new RNG(hashString(`${run.seed}|ai-${run.floor}`)),
  });
  return g;
}

export function finishCombat(run, g) {
  const won = g.finish();
  run.stats.kills += g.stats.kills;
  run.stats.taken += g.stats.taken;
  run.stats.played += g.stats.played;
  run.stats.turns += g.turn;
  if (!won) {
    run.over = 'lose';
    return false;
  }
  const kind = combatKind(run.room);
  if (kind === 'elite') run.stats.elites++;
  if (kind === 'boss') run.stats.bosses++;
  run.room.stage = 'reward';
  run.room.rewards = generateRewards(run, kind);
  return true;
}

// -------------------------------------------------------------- rewards ----

const CARD_ODDS = {
  normal: { rare: 3, uncommon: 37 },
  elite: { rare: 10, uncommon: 40 },
  shop: { rare: 9, uncommon: 37 },
};

const byRarity = (rarity, type) => REWARD_POOL.filter((id) => CARDS[id].rarity === rarity && (!type || CARDS[id].type === type));

export function rollCardRarity(run, r, kind) {
  if (kind === 'boss') return 'rare';
  const odds = CARD_ODDS[kind] || CARD_ODDS.normal;
  const roll = r.next() * 100;
  const rareChance = odds.rare + (kind === 'shop' ? 0 : run.rarePity);
  if (roll < rareChance) {
    if (kind !== 'shop') run.rarePity = -5;
    return 'rare';
  }
  if (roll < rareChance + odds.uncommon) return 'uncommon';
  if (kind !== 'shop') run.rarePity = Math.min(run.rarePity + 1, 40);
  return 'common';
}

/** Roll `n` distinct reward cards: [{ id, up }]. */
export function rollCards(run, n, kind, rarityOverride = null) {
  const r = rngOf(run, 'cards');
  const out = [];
  const upChance = run.act === 1 ? 0 : run.act === 2 ? 0.15 : 0.3;
  for (let i = 0; i < n; i++) {
    const rarity = rarityOverride || rollCardRarity(run, r, kind);
    const pool = byRarity(rarity).filter((id) => !out.some((c) => c.id === id));
    const id = r.pick(pool.length ? pool : byRarity(rarity));
    out.push({ id, up: rarity !== 'rare' && r.chance(upChance) });
  }
  return out;
}

function rollTier(r) {
  const roll = r.next() * 100;
  return roll < 50 ? 'common' : roll < 83 ? 'uncommon' : 'rare';
}

/** Random relic id of the given tier the player doesn't own (falls back to other tiers). */
export function rollRelic(run, tier, exclude = []) {
  const r = rngOf(run, 'relics');
  const order = { common: ['common', 'uncommon', 'rare'], uncommon: ['uncommon', 'rare', 'common'], rare: ['rare', 'uncommon', 'common'] }[tier]
    || [tier];
  for (const t of order) {
    const pool = RELIC_POOLS[t].filter((id) => !hasRelic(run, id) && !exclude.includes(id));
    if (pool.length) return r.pick(pool);
  }
  return null;
}

export function rollCell(r) {
  const tier = r.weighted(Object.entries(CELL_WEIGHTS));
  const pool = Object.keys(CELLS).filter((id) => CELLS[id].rarity === tier);
  return r.pick(pool);
}

function generateRewards(run, kind) {
  const r = rngOf(run, 'rewards');
  const mult = run.relics.reduce((m, rel) => m * (RELICS[rel.id].shardMult || 1), 1);
  const base = kind === 'boss' ? r.int(70, 85) : kind === 'elite' ? r.int(25, 35) : r.int(10, 20);
  const rewards = { shards: Math.round(base * mult), cell: null, cards: null, relics: [], bossRelics: null };

  if (kind !== 'boss') {
    if (r.int(0, 99) < run.cellChance) {
      rewards.cell = rollCell(r);
      run.cellChance -= 10;
    } else run.cellChance += 10;
  }

  const bonus = run.relics.reduce((s, rel) => s + (RELICS[rel.id].cardRewardBonus || 0), 0);
  rewards.cards = rollCards(run, 3 + bonus, kind);

  if (kind === 'elite') {
    const first = rollRelic(run, rollTier(r));
    if (first) rewards.relics.push(first);
    if (run.relics.some((rel) => RELICS[rel.id].extraEliteRelic)) {
      const second = rollRelic(run, rollTier(r), rewards.relics);
      if (second) rewards.relics.push(second);
    }
  }
  if (kind === 'boss' && run.act < FINAL_ACT) {
    const pool = r.shuffle(RELIC_POOLS.boss.filter((id) => !hasRelic(run, id)));
    rewards.bossRelics = pool.slice(0, 3);
  }
  return rewards;
}

export function claimShards(run) {
  const rw = run.room?.rewards;
  if (!rw || !rw.shards) return false;
  gainShards(run, rw.shards);
  rw.shards = 0;
  return true;
}

export function claimCell(run) {
  const rw = run.room?.rewards;
  if (!rw || !rw.cell) return false;
  if (!addCell(run, rw.cell)) return false;
  rw.cell = null;
  return true;
}

export function claimRelic(run, i) {
  const rw = run.room?.rewards;
  const id = rw?.relics[i];
  if (!id) return false;
  addRelic(run, id);
  rw.relics[i] = null;
  return true;
}

export function pickRewardCard(run, index) {
  const rw = run.room?.rewards;
  if (!rw || !rw.cards) return false;
  if (index !== null && index !== undefined) {
    const c = rw.cards[index];
    if (!c) return false;
    addToDeck(run, c.id, c.up);
  }
  rw.cards = null;
  return true;
}

export function pickBossRelic(run, index) {
  const rw = run.room?.rewards;
  if (!rw || !rw.bossRelics) return false;
  if (index !== null && index !== undefined) addRelic(run, rw.bossRelics[index]);
  rw.bossRelics = null;
  return true;
}

// -------------------------------------------------------------- treasure ---

export function openTreasure(run) {
  const room = run.room;
  if (room?.type !== 'treasure' || room.opened) return false;
  room.opened = true;
  if (room.relic) addRelic(run, room.relic);
  else room.shards += 50;
  gainShards(run, room.shards);
  return true;
}

// ------------------------------------------------------------------ shop ---

export function priceMult(run) {
  return run.relics.reduce((m, rel) => m * (RELICS[rel.id].priceMult || 1), 1);
}

function generateShop(run) {
  const r = rngOf(run, 'shop');
  const jitter = (p, amt) => Math.round(p * (1 + (r.next() * 2 - 1) * amt));
  const cardPrice = { common: 50, uncommon: 75, rare: 150 };
  const relicPrice = { common: 150, uncommon: 240, rare: 300, shop: 180 };
  const cellPrice = { common: 50, uncommon: 70, rare: 95 };
  const stock = [];

  const taken = [];
  for (const type of ['attack', 'attack', 'skill', 'skill', 'power']) {
    let rarity = rollCardRarity(run, r, 'shop');
    let pool = byRarity(rarity, type).filter((id) => !taken.includes(id));
    if (!pool.length) { rarity = 'uncommon'; pool = byRarity(rarity, type).filter((id) => !taken.includes(id)); }
    const id = r.pick(pool);
    taken.push(id);
    stock.push({ kind: 'card', id, up: false, price: jitter(cardPrice[rarity], 0.1) });
  }
  const sale = r.int(0, 4);
  stock[sale].price = Math.round(stock[sale].price / 2);
  stock[sale].sale = true;

  const relics = [];
  for (let i = 0; i < 2; i++) {
    const id = rollRelic(run, rollTier(r), relics);
    if (id) relics.push(id);
  }
  const shopPool = RELIC_POOLS.shop.filter((id) => !hasRelic(run, id));
  if (shopPool.length) relics.push(r.pick(shopPool));
  for (const id of relics) stock.push({ kind: 'relic', id, price: jitter(relicPrice[RELICS[id].rarity], 0.05) });

  for (let i = 0; i < 3; i++) {
    const id = rollCell(r);
    stock.push({ kind: 'cell', id, price: jitter(cellPrice[CELLS[id].rarity], 0.05) });
  }

  const m = priceMult(run);
  for (const item of stock) item.price = Math.round(item.price * m);
  return stock;
}

export function removalPrice(run) {
  return Math.round(run.removeCost * priceMult(run));
}

export function buyItem(run, index) {
  const room = run.room;
  const item = room?.stock?.[index];
  if (!item || item.sold || run.shards < item.price) return false;
  if (item.kind === 'cell' && !run.cells.includes(null)) return false;
  run.shards -= item.price;
  item.sold = true;
  if (item.kind === 'card') addToDeck(run, item.id, item.up);
  if (item.kind === 'relic') {
    addRelic(run, item.id);
    // A discount relic applies to the rest of this shop right away.
    const mult = RELICS[item.id].priceMult;
    if (mult) for (const other of room.stock) if (!other.sold) other.price = Math.round(other.price * mult);
  }
  if (item.kind === 'cell') addCell(run, item.id);
  return true;
}

export function canRemoveAtShop(run) {
  return run.room?.type === 'shop' && !run.room.removed && run.shards >= removalPrice(run) && run.deck.length > 0;
}

/** Start the shop's card removal (resolved through the deck choice). */
export function beginShopRemoval(run) {
  if (!canRemoveAtShop(run)) return false;
  run.room.pendingChoice = { kind: 'deck', op: 'remove', n: 1, source: 'shop', cancellable: true };
  return true;
}

// ------------------------------------------------------------------ rest ---

export function restHealAmount(run) {
  const bonus = run.relics.reduce((s, r) => s + (RELICS[r.id].restBonus || 0), 0);
  return Math.floor(run.maxHp * 0.3) + bonus;
}

export function canRecover(run) { return !run.relics.some((r) => RELICS[r.id].noRestHeal); }

export function restRecover(run) {
  if (run.room?.type !== 'rest' || run.room.done || !canRecover(run)) return false;
  healRun(run, restHealAmount(run));
  run.room.done = 'recover';
  return true;
}

export function beginRestUpgrade(run) {
  if (run.room?.type !== 'rest' || run.room.done) return false;
  if (!run.deck.some((c) => canUpgrade(c.id, c.up))) return false;
  run.room.pendingChoice = { kind: 'deck', op: 'upgrade', n: 1, source: 'rest', cancellable: true };
  return true;
}

// ---------------------------------------------------------------- events ---

function pickEvent(run) {
  const r = rngOf(run, 'events');
  let pool = Object.keys(EVENTS).filter((id) => !EVENTS[id].opening && EVENTS[id].acts.includes(run.act)
    && !run.seenEvents.includes(id));
  if (!pool.length) pool = Object.keys(EVENTS).filter((id) => !EVENTS[id].opening && EVENTS[id].acts.includes(run.act));
  const id = r.pick(pool);
  run.seenEvents.push(id);
  return id;
}

function enterEvent(run, id) {
  const ev = EVENTS[id];
  const options = typeof ev.options === 'function' ? ev.options(run, rngOf(run, 'events')) : null;
  run.room = { type: 'event', eventId: id, stage: 'choose', options, result: null, queue: [] };
}

export function eventOptions(run) {
  const room = run.room;
  const opts = room.options || EVENTS[room.eventId].options;
  return opts.map((o) => ({ ...o, disabled: o.req ? !o.req(run) : false }));
}

export function chooseEventOption(run, index) {
  const room = run.room;
  if (room?.type !== 'event' || room.stage !== 'choose') return false;
  const opt = eventOptions(run)[index];
  if (!opt || opt.disabled) return false;
  let outcome = opt;
  if (opt.roll) outcome = rngOf(run, 'events').weighted(opt.roll.map((o) => [o, o.w]));
  room.stage = 'result';
  room.chosen = opt.label;
  room.result = outcome.result || opt.result || '';
  applyEffects(run, outcome.effects || []);
  return true;
}

function applyEffects(run, effects) {
  const room = run.room;
  const r = rngOf(run, 'events');
  for (const fx of effects) {
    if (fx.hp) run.hp = Math.max(1, Math.min(run.maxHp, run.hp + fx.hp));
    if (fx.heal) healRun(run, fx.heal);
    if (fx.healPct) healRun(run, Math.floor(run.maxHp * fx.healPct));
    if (fx.maxHp) {
      run.maxHp = Math.max(1, run.maxHp + fx.maxHp);
      run.hp = fx.maxHp > 0 ? run.hp + fx.maxHp : Math.min(run.hp, run.maxHp);
    }
    if (fx.shards) gainShards(run, fx.shards);
    if (fx.relic) {
      const tier = fx.relic === 'random' ? rollTier(r) : fx.relic;
      const id = RELICS[tier] ? tier : rollRelic(run, tier);
      if (id) { addRelic(run, id); (room.gained ||= []).push({ kind: 'relic', id }); }
    }
    if (fx.curse) { addToDeck(run, fx.curse); (room.gained ||= []).push({ kind: 'card', id: fx.curse }); }
    if (fx.randomCard) {
      const [c] = rollCards(run, 1, 'normal', fx.randomCard);
      addToDeck(run, c.id, c.up);
      (room.gained ||= []).push({ kind: 'card', id: c.id, up: c.up });
    }
    if (fx.cardChoice) room.queue.push({ kind: 'cards', options: rollCards(run, fx.n || 3, 'normal', fx.cardChoice) });
    if (fx.deck) {
      // Only ask when at least one card qualifies, otherwise the event could never be left.
      if (deckOptionsFor(run, fx.deck).length) room.queue.push({ kind: 'deck', op: fx.deck, n: fx.n || 1, source: 'event' });
      else (room.gained ||= []).push({ kind: 'note', text: fx.deck === 'upgrade' ? 'Every card is already upgraded.' : 'No card qualified.' });
    }
    if (fx.randomUpgrade) {
      const cands = r.shuffle(run.deck.filter((c) => canUpgrade(c.id, c.up)));
      for (const c of cands.slice(0, fx.randomUpgrade)) {
        c.up = true;
        (room.gained ||= []).push({ kind: 'upgrade', id: c.id });
      }
    }
    if (fx.cells) {
      for (let i = 0; i < fx.cells; i++) {
        const id = rollCell(r);
        if (addCell(run, id)) (room.gained ||= []).push({ kind: 'cell', id });
        else (room.gained ||= []).push({ kind: 'note', text: 'Your Cell slots are full.' });
      }
    }
    if (fx.fight) {
      room.stage = 'fight';
      room.encounter = fx.fight;
      room.fightKind = fx.kind || 'normal';
    }
  }
  nextPending(run);
}

function nextPending(run) {
  const room = run.room;
  if (!room.pendingChoice && room.queue?.length) room.pendingChoice = room.queue.shift();
}

/** Cards the player may pick for the current deck choice. */
export function deckChoiceOptions(run) {
  const pc = run.room?.pendingChoice;
  if (!pc || pc.kind !== 'deck') return [];
  return deckOptionsFor(run, pc.op);
}

function deckOptionsFor(run, op) {
  if (op === 'upgrade') return run.deck.filter((c) => canUpgrade(c.id, c.up));
  if (op === 'duplicate') return run.deck.filter((c) => CARDS[c.id].type !== 'curse');
  return [...run.deck];
}

export function resolveDeckChoice(run, uids) {
  const room = run.room;
  const pc = room?.pendingChoice;
  if (!pc || pc.kind !== 'deck') return false;
  if (!uids || !uids.length) {
    if (!pc.cancellable && deckChoiceOptions(run).length) return false;
    room.pendingChoice = null;
    nextPending(run);
    return true;
  }
  const valid = deckChoiceOptions(run).filter((c) => uids.includes(c.uid)).slice(0, pc.n);
  if (!valid.length) return false;
  for (const c of valid) {
    if (pc.op === 'remove') run.deck.splice(run.deck.indexOf(c), 1);
    if (pc.op === 'upgrade') c.up = true;
    if (pc.op === 'duplicate') addToDeck(run, c.id, c.up);
  }
  if (pc.source === 'shop') {
    run.shards -= removalPrice(run);
    run.removeCost += 25;
    room.removed = true;
  }
  if (pc.source === 'rest') room.done = 'upgrade';
  room.lastChoice = { op: pc.op, cards: valid.map((c) => ({ id: c.id, up: c.up })) };
  room.pendingChoice = null;
  nextPending(run);
  return true;
}

export function resolveCardChoice(run, index) {
  const room = run.room;
  const pc = room?.pendingChoice;
  if (!pc || pc.kind !== 'cards') return false;
  if (index !== null && index !== undefined) {
    const c = pc.options[index];
    if (!c) return false;
    addToDeck(run, c.id, c.up);
    (room.gained ||= []).push({ kind: 'card', id: c.id, up: c.up });
  }
  room.pendingChoice = null;
  nextPending(run);
  return true;
}

// ------------------------------------------------------------ progress ----

/** Leave the current room. After a boss this advances the act (or wins the run). */
export function leaveRoom(run) {
  const room = run.room;
  if (!room || room.pendingChoice) return false;
  if (room.type === 'event' && room.stage === 'fight') return false;
  if (['combat', 'elite', 'boss'].includes(room.type) && room.stage !== 'reward') return false;
  const wasBoss = room.type === 'boss';
  run.room = null;
  if (wasBoss) {
    if (run.act >= FINAL_ACT) {
      run.over = 'win';
    } else {
      startAct(run, run.act + 1);
      healRun(run, Math.ceil((run.maxHp - run.hp) * 0.75));
    }
  }
  return true;
}

export function computeScore(run) {
  const s = run.stats;
  return run.floor * 10 + s.elites * 30 + s.bosses * 75 + s.kills * 2 + (run.over === 'win' ? 300 : 0);
}

export function totalFloors() { return (MAP_ROWS + 1) * FINAL_ACT; }

// ------------------------------------------------------------------ save ---

export function serializeRun(run) { return JSON.stringify(run); }

export function deserializeRun(json) {
  try {
    const run = JSON.parse(json);
    return run && run.v === SAVE_VERSION ? run : null;
  } catch {
    return null;
  }
}
