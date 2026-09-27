// Heuristic bot that plays Riftdeck through the same API as the UI.
// It is not meant to play well — it is a consistent baseline for balancing
// and a crash test that touches every system of a run.

import { CARDS, canUpgrade } from '../src/data/cards.js';
import { CELLS } from '../src/data/cells.js';
import * as R from '../src/core/run.js';

const ENERGY_VALUE = 5;

function incomingDamage(g) {
  let total = 0;
  for (const e of g.aliveEnemies()) {
    const it = g.intentOf(e);
    if (it && it.dmg !== null) total += it.dmg * it.hits;
  }
  return total;
}

function pickTarget(g, dmg) {
  const alive = g.aliveEnemies();
  const killable = alive.filter((e) => e.hp + e.shield <= g.calcAttack(g.player, e, dmg));
  if (killable.length) return killable.sort((a, b) => threat(g, b) - threat(g, a))[0];
  return [...alive].sort((a, b) => threat(g, b) - threat(g, a) || a.hp - b.hp)[0];
}

function threat(g, e) {
  const it = g.intentOf(e);
  return it && it.dmg !== null ? it.dmg * it.hits : 2;
}

function hitsOf(card, v) {
  if (card.id === 'twin_burst') return 2;
  if (card.id === 'ricochet') return v.n;
  if (card.id === 'fusion_beam') return v.x;
  return 1;
}

/** Rough value of playing `card` right now, and the target to use. */
function evaluate(g, card) {
  const def = card.def;
  const cost = g.costOf(card);
  const energyCost = cost === 'X' ? g.energy : cost;
  const v = g.valsOf(card, g.energy);
  const alive = g.aliveEnemies();
  const need = Math.max(0, incomingDamage(g) - g.player.shield);
  let s = 0;
  let target = null;

  let base = v.dmg;
  if (card.id === 'discharge') base = v.total;
  if (card.id === 'bulwark_slam') base = g.player.shield;
  if (base) {
    const hits = hitsOf(card, v);
    if (def.target === 'all') {
      for (const e of alive) s += Math.min(g.calcAttack(g.player, e, base) * hits, e.hp + e.shield);
    } else if (def.target === 'random') {
      s += g.calcAttack(g.player, alive[0], base) * hits * 0.9;
    } else {
      target = pickTarget(g, base * hits);
      const dmg = g.calcAttack(g.player, target, base) * hits;
      s += Math.min(dmg, target.hp + target.shield);
      if (dmg >= target.hp + target.shield) s += 8 + threat(g, target);
    }
  }
  if (v.sh) {
    const sh = g.previewShield(v.sh);
    s += Math.min(sh, need) * 1.3 + sh * 0.15;
  }
  if (card.id === 'entrench') s += Math.min(g.player.shield, need) * 1.3;
  if (def.type === 'power') s += g.turn <= 2 ? 16 : 8;
  if (v.burn) s += v.burn * (def.target === 'all' ? alive.length : 1) * 1.4;
  if (v.ex) { s += 5; target = target || pickTarget(g, 10); }
  if (v.jam) s += need > 0 ? 3 * (def.target === 'all' ? alive.length : 1) : 1;
  if (v.ch) s += v.ch * 2.5;
  if (card.id === 'catalyst') { target = [...alive].sort((a, b) => g.status(b, 'burn') - g.status(a, 'burn'))[0]; s += g.status(target, 'burn') * 1.5; }
  const draws = { quick_draw: 1, phase_step: 1, capacitor: 1, scan: v.n || 3, adrenal_spike: 2 };
  if (draws[card.id]) s += draws[card.id] * 3.5;
  if (card.id === 'adrenal_spike') s += v.en * ENERGY_VALUE;
  if (card.id === 'surge' || card.id === 'amplify') s += g.hand.filter((c) => c.def.type === 'attack').length * 2;
  if (card.id === 'overcharge') s -= 3;
  if (card.id === 'rewind') s += g.discard.length ? 6 : -10;
  if (card.id === 'reroute') s += g.hand.filter((c) => c.def.unplayable).length * 4 - 2;
  if (card.id === 'coolant_flush') s += Object.keys(g.player.statuses).filter((k) => ['exposed', 'jammed', 'fragile', 'burn'].includes(k)).length * 4;
  if (card.id === 'phase_shift') s += need > 15 ? need : 0;
  // The Warden punishes Skills.
  if (def.type === 'skill' && alive.some((e) => g.status(e, 'enforcer'))) s -= 6;
  if (def.target === 'enemy' && !target) target = pickTarget(g, 6);
  return { score: s - energyCost * ENERGY_VALUE, target };
}

export function autoChoose(req) {
  const sorted = [...req.options].sort((a, b) => (b.def.rating || 0) - (a.def.rating || 0));
  return sorted.slice(0, Math.max(req.min, 1));
}

/** Play one full player turn. */
export function playTurn(g) {
  g.autoChoose = autoChoose;
  // Cells in hard fights
  if (g.kind !== 'normal' && g.turn <= 2) {
    g.run.cells.forEach((id, slot) => {
      if (!id || g.outcome) return;
      const t = CELLS[id].target === 'enemy' ? pickTarget(g, 20) : null;
      g.useCell(slot, t ? t.ref : null);
    });
  }
  for (let guard = 0; guard < 40 && g.phase === 'player' && !g.outcome; guard++) {
    let best = null;
    for (const c of g.hand) {
      if (!g.canPlay(c)) continue;
      const ev = evaluate(g, c);
      if (!best || ev.score > best.score) best = { ...ev, card: c };
    }
    if (!best || best.score < -1.5) break;
    if (!g.playCard(best.card.uid, best.target ? best.target.ref : null)) break;
  }
  if (!g.outcome) g.endTurn();
  while (g.phase === 'enemy') g.enemyStep();
}

export function fight(run) {
  const g = R.makeCombat(run);
  g.start();
  let turns = 0;
  while (!g.outcome && turns++ < 80) playTurn(g);
  if (!g.outcome) { g.outcome = 'lose'; g.player.hp = 0; }
  return g;
}

// ------------------------------------------------------------------ run ----

const rating = (id) => CARDS[id].rating || 0;

function resolveChoices(run) {
  let guard = 0;
  while (run.room?.pendingChoice && guard++ < 10) {
    const pc = run.room.pendingChoice;
    if (pc.kind === 'cards') {
      let best = 0;
      pc.options.forEach((c, i) => { if (rating(c.id) > rating(pc.options[best].id)) best = i; });
      R.resolveCardChoice(run, best);
    } else {
      const opts = R.deckChoiceOptions(run);
      let pick;
      if (pc.op === 'remove') {
        pick = [...opts].sort((a, b) => rating(a.id) - rating(b.id) || (a.up ? 1 : 0) - (b.up ? 1 : 0))[0];
      } else {
        pick = [...opts].sort((a, b) => rating(b.id) - rating(a.id))[0];
      }
      R.resolveDeckChoice(run, pick ? [pick.uid] : []);
    }
  }
}

function takeRewards(run) {
  const rw = run.room.rewards;
  R.claimShards(run);
  R.claimCell(run);
  rw.relics.forEach((_, i) => R.claimRelic(run, i));
  if (rw.cards) {
    let best = null;
    rw.cards.forEach((c, i) => { if (best === null || rating(c.id) > rating(rw.cards[best].id)) best = i; });
    const worth = rating(rw.cards[best].id) >= 5 || run.deck.length < 16;
    R.pickRewardCard(run, worth ? best : null);
  }
  if (rw.bossRelics) R.pickBossRelic(run, 0);
}

function chooseNode(run, rng) {
  const ids = R.reachableNodes(run);
  const hpPct = run.hp / run.maxHp;
  let best = null;
  for (const id of ids) {
    const n = run.map.nodes[id];
    let s = rng.next();
    if (n.type === 'rest') s += hpPct < 0.55 ? 4 : 0.5;
    if (n.type === 'elite') s += hpPct > 0.7 ? 2 : -3;
    if (n.type === 'shop') s += run.shards >= 150 ? 2 : -1;
    if (n.type === 'event') s += 1;
    if (n.type === 'treasure') s += 3;
    if (!best || s > best.s) best = { id, s };
  }
  return best.id;
}

function shop(run) {
  if (R.canRemoveAtShop(run)) {
    R.beginShopRemoval(run);
    resolveChoices(run);
  }
  const stock = run.room.stock;
  const order = stock.map((item, i) => ({ item, i }))
    .filter(({ item }) => item.kind !== 'card' || rating(item.id) >= 6)
    .sort((a, b) => (a.item.kind === 'relic' ? -1 : 0) - (b.item.kind === 'relic' ? -1 : 0));
  for (const { i } of order) R.buyItem(run, i);
}

/** Play a complete run. Returns the finished run object plus a per-encounter log. */
export function playRun(run, rng, log = []) {
  for (let guard = 0; guard < 400 && !run.over; guard++) {
    const room = run.room;
    if (!room) {
      R.travel(run, chooseNode(run, rng));
      continue;
    }
    if (room.pendingChoice) { resolveChoices(run); continue; }
    const fighting = (['combat', 'elite', 'boss'].includes(room.type) || room.type === 'event') && room.stage === 'fight';
    if (fighting) {
      const hpBefore = run.hp;
      const g = fight(run);
      R.finishCombat(run, g);
      log.push({ act: run.act, kind: R.combatKind(room), enc: room.encounter.join('+'), lost: hpBefore - g.player.hp, turns: g.turn, won: g.outcome === 'win' });
      continue;
    }
    switch (room.type) {
      case 'combat': case 'elite': case 'boss':
        takeRewards(run);
        R.leaveRoom(run);
        break;
      case 'event':
        if (room.stage === 'choose') {
          const opts = R.eventOptions(run);
          const lowHp = run.hp / run.maxHp < 0.4;
          let idx = opts.findIndex((o) => !o.disabled && !(lowHp && /Lose \d+ HP/.test(o.detail)));
          if (idx < 0) idx = opts.length - 1;
          R.chooseEventOption(run, idx);
        } else {
          if (room.rewards) takeRewards(run);
          R.leaveRoom(run);
        }
        break;
      case 'shop':
        shop(run);
        R.leaveRoom(run);
        break;
      case 'rest':
        if (run.hp / run.maxHp < 0.55 && R.canRecover(run)) R.restRecover(run);
        else if (R.beginRestUpgrade(run)) resolveChoices(run);
        else R.restRecover(run);
        R.leaveRoom(run);
        break;
      case 'treasure':
        R.openTreasure(run);
        R.leaveRoom(run);
        break;
      default:
        throw new Error(`Bot stuck in room ${room.type}`);
    }
  }
  return run;
}

export { canUpgrade };
