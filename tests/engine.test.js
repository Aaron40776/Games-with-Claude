import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RNG } from '../src/core/rng.js';
import { Combat } from '../src/core/combat.js';
import { generateMap, MAP_ROWS, TREASURE_ROW, REST_ROW } from '../src/core/map.js';
import * as R from '../src/core/run.js';
import { CARDS } from '../src/data/cards.js';
import { ENEMIES, ENCOUNTERS } from '../src/data/enemies.js';
import { RELICS } from '../src/data/relics.js';
import { CELLS } from '../src/data/cells.js';
import { EVENTS } from '../src/data/events.js';
import { playRun, autoChoose } from '../tools/bot.js';

/** Minimal run + combat against the given enemies with a fixed hand. */
function setup(enemies = ['leech'], { hand = [], relics = [], hp = 72 } = {}) {
  const run = { hp, maxHp: 72, deck: [], relics: relics.map((id) => ({ id, ...(RELICS[id].counter !== undefined ? { counter: RELICS[id].counter } : {}) })), cells: [null, null, null] };
  const g = new Combat(run, enemies, { rng: new RNG(1), aiRng: new RNG(2) });
  g.start();
  g.hand = hand.map((id) => g.makeCard(id.replace('+', ''), id.endsWith('+')));
  g.energy = 10;
  return g;
}

test('rng is deterministic per seed and stream', () => {
  const a = RNG.from('SEED', 'x');
  const b = RNG.from('SEED', 'x');
  const c = RNG.from('SEED', 'y');
  const seqA = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => c.next()));
});

test('map: fixed rows, connectivity and no crossing paths', () => {
  for (let i = 0; i < 40; i++) {
    const map = generateMap(new RNG(i), 1);
    const nodes = Object.values(map.nodes).filter((n) => n.id !== 'boss');
    for (const n of nodes) {
      if (n.row === 0) assert.equal(n.type, 'combat');
      if (n.row === TREASURE_ROW) assert.equal(n.type, 'treasure');
      if (n.row === REST_ROW) assert.equal(n.type, 'rest');
      if (n.row < 4) assert.notEqual(n.type, 'elite');
      assert.ok(n.next.length > 0, 'every node leads somewhere');
      if (n.row > 0) assert.ok(n.prev.length > 0, 'every node is reachable');
      for (const id of n.next) {
        const m = map.nodes[id];
        if (m.id === 'boss') continue;
        for (const t of ['rest', 'shop', 'elite']) assert.ok(!(n.type === t && m.type === t), `no ${t} chain`);
        // crossing check: edge (r,c)->(r+1,c') vs (r,c')->(r+1,c)
        if (m.col !== n.col) {
          const mirror = map.nodes[`${n.row}-${m.col}`];
          assert.ok(!mirror || !mirror.next.includes(`${n.row + 1}-${n.col}`), 'paths never cross');
        }
      }
    }
    assert.ok(nodes.some((n) => n.type === 'shop'), 'at least one shop');
    assert.ok(nodes.filter((n) => n.row === MAP_ROWS - 1).every((n) => n.next.includes('boss')));
  }
});

test('shield absorbs damage before HP', () => {
  const g = setup(['leech']);
  const e = g.aliveEnemies()[0];
  e.shield = 4;
  const hp = e.hp;
  const r = g.attack(e, 10);
  assert.equal(r.blocked, 4);
  assert.equal(e.hp, hp - 6);
});

test('Exposed, Jammed, Amp and Plating modify numbers', () => {
  const g = setup(['leech']);
  const e = g.aliveEnemies()[0];
  g.applyStatus(e, 'exposed', 1);
  assert.equal(g.calcAttack(g.player, e, 10), 15);
  g.applyStatus(g.player, 'amp', 2);
  assert.equal(g.calcAttack(g.player, e, 10), 18);
  g.applyStatus(g.player, 'jammed', 1);
  assert.equal(g.calcAttack(g.player, e, 10), 13); // floor(12 * .75 * 1.5)
  g.applyStatus(g.player, 'plating', 2);
  assert.equal(g.previewShield(5), 7);
  g.applyStatus(g.player, 'fragile', 1);
  assert.equal(g.previewShield(8), 7);
});

test('debuffs from enemies last through the next enemy phase', () => {
  const g = setup(['leech']);
  g.phase = 'enemy';
  g.applyStatus(g.player, 'exposed', 1, g.enemies[0]);
  g.endRound(); // fresh: survives this round end
  assert.equal(g.status(g.player, 'exposed'), 1);
  g.phase = 'enemy';
  g.endRound();
  assert.equal(g.status(g.player, 'exposed'), 0);
});

test('player-applied Exposed 1 lasts only the current round', () => {
  const g = setup(['leech']);
  const e = g.aliveEnemies()[0];
  g.applyStatus(e, 'exposed', 1);
  g.endTurn();
  while (g.phase === 'enemy') g.enemyStep();
  assert.equal(g.status(e, 'exposed'), 0);
});

test('Burn ticks at turn start and decays', () => {
  const g = setup(['leech']);
  const e = g.aliveEnemies()[0];
  g.applyStatus(e, 'burn', 3);
  const hp = e.hp;
  g.endTurn();
  g.enemyStep();
  assert.equal(e.hp <= hp - 3, true);
  assert.equal(g.status(e, 'burn'), 2);
});

test('Fade, Volatile and Hold route cards correctly', () => {
  const g = setup(['leech'], { hand: ['siphon', 'vent', 'pierce_veil', 'pulse_shot'] });
  const [siphon, vent, veil, pulse] = g.hand;
  g.playCard(siphon.uid, g.enemies[0].ref);
  assert.ok(g.faded.includes(siphon));
  g.endTurn();
  assert.ok(g.faded.includes(veil), 'volatile fades at end of turn');
  assert.ok(g.hand.includes(vent), 'hold stays in hand');
  assert.ok(g.discard.includes(pulse));
});

test('X cost spends all energy', () => {
  const g = setup(['heart'], { hand: ['fusion_beam'] });
  g.energy = 3;
  const e = g.enemies[0];
  const hp = e.hp;
  g.playCard(g.hand[0].uid, e.ref);
  assert.equal(g.energy, 0);
  assert.equal(hp - e.hp, 27);
});

test('Rewind pauses for a choice and resumes', () => {
  const g = setup(['leech'], { hand: ['rewind'] });
  g.discard = [g.makeCard('slug_round'), g.makeCard('deflect')];
  g.playCard(g.hand[0].uid);
  assert.ok(g.pending);
  const target = g.discard[0];
  assert.ok(g.resolveChoice([target.uid]));
  assert.ok(g.hand.includes(target));
  assert.equal(g.pending, null);
  assert.ok(g.discard.some((c) => c.id === 'rewind'));
});

test('Echo Chamber plays the first card twice', () => {
  const g = setup(['heart'], { hand: ['pulse_shot', 'pulse_shot'] });
  g.applyStatus(g.player, 'echo', 1);
  const e = g.enemies[0];
  const hp = e.hp;
  g.playCard(g.hand[0].uid, e.ref);
  assert.equal(hp - e.hp, 12);
  g.playCard(g.hand[0].uid, e.ref);
  assert.equal(hp - e.hp, 18);
});

test('Rift Barrier caps damage per turn', () => {
  const g = setup(['heart'], { hand: ['singularity+', 'singularity+', 'singularity+', 'singularity+', 'singularity+'] });
  g.energy = 20;
  const e = g.enemies[0];
  const hp = e.hp;
  for (const c of [...g.hand]) g.playCard(c.uid, e.ref);
  assert.equal(hp - e.hp, 120);
});

test('every card can be played (base and upgraded) without errors', () => {
  const playable = Object.keys(CARDS).filter((id) => !CARDS[id].unplayable);
  for (const id of playable) {
    for (const up of [false, true]) {
      const g = setup(['shardling', 'leech', 'drone']);
      g.autoChoose = autoChoose;
      g.discard = [g.makeCard('pulse_shot')];
      g.draw = [g.makeCard('deflect'), g.makeCard('scan')];
      const c = g.makeCard(id, up);
      g.hand = [c, g.makeCard('pulse_shot')];
      g.applyStatus(g.player, 'charge', 3);
      g.applyStatus(g.aliveEnemies()[0], 'burn', 3);
      g.player.shield = 5;
      assert.ok(g.playCard(c.uid, g.aliveEnemies()[0].ref), `${id}${up ? '+' : ''} playable`);
      assert.equal(g.pending, null);
    }
  }
});

test('every card text references only known values', () => {
  for (const [id, def] of Object.entries(CARDS)) {
    for (const vals of [def.vals, { ...def.vals, ...def.up }]) {
      const tokens = [...(def.text + (def.combatText || '')).matchAll(/\{(?:[DS]:)?(\w+)\}/g)].map((m) => m[1]);
      for (const t of tokens) {
        const known = t in vals || (def.words && t in def.words) || ['total', 'dmg'].includes(t);
        assert.ok(known, `${id}: unknown token ${t}`);
      }
    }
  }
});

test('every enemy AI runs for 12 turns without errors', () => {
  for (const id of Object.keys(ENEMIES)) {
    const g = setup([id], { hp: 999 });
    g.player.maxHp = 999;
    for (let t = 0; t < 12 && !g.outcome; t++) {
      g.hand = [];
      g.endTurn();
      while (g.phase === 'enemy') g.enemyStep();
      const e = g.enemies[0];
      if (e.alive) assert.ok(e.def.moves[e.move], `${id} picked a valid move (${e.move})`);
    }
  }
});

test('encounters only reference defined enemies', () => {
  for (const act of Object.values(ENCOUNTERS)) {
    for (const list of Object.values(act)) for (const enc of list) for (const id of enc) assert.ok(ENEMIES[id], id);
  }
});

test('relic, cell and event definitions are complete', () => {
  for (const [id, r] of Object.entries(RELICS)) assert.ok(r.name && r.desc && r.rarity, id);
  for (const [id, c] of Object.entries(CELLS)) assert.ok(c.name && c.desc && c.use, id);
  for (const [id, e] of Object.entries(EVENTS)) assert.ok(e.name && e.text && e.options, id);
});

test('cells can be used in combat', () => {
  for (const id of Object.keys(CELLS)) {
    const g = setup(['leech', 'drone']);
    g.run.cells = [id, null, null];
    assert.ok(g.useCell(0, g.aliveEnemies()[0].ref), id);
    assert.equal(g.run.cells[0], null);
  }
});

test('save and load round-trips a run', () => {
  const run = R.newRun('SAVETEST');
  R.chooseEventOption(run, 0);
  R.leaveRoom(run);
  R.travel(run, R.reachableNodes(run)[0]);
  const copy = R.deserializeRun(R.serializeRun(run));
  assert.deepEqual(copy, JSON.parse(JSON.stringify(run)));
  // the same combat is produced after a reload
  const a = R.makeCombat(run).start();
  const b = R.makeCombat(copy).start();
  assert.deepEqual(a.hand.map((c) => c.id), b.hand.map((c) => c.id));
});

test('bot completes 40 full runs without errors', () => {
  let finished = 0;
  for (let i = 0; i < 40; i++) {
    const run = R.newRun(`TEST${i}`);
    playRun(run, new RNG(i + 7));
    assert.ok(run.over === 'win' || run.over === 'lose', `run ${i} ended (${run.over}) at floor ${run.floor}`);
    assert.ok(run.hp >= 0 && run.hp <= run.maxHp);
    finished++;
  }
  assert.equal(finished, 40);
});
