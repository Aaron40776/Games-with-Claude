// Balance simulation: the bot plays N full runs and reports win rate,
// where runs end, and how much HP each encounter costs on average.
//   node tools/sim.js [runs=200] [--verbose]

import { RNG } from '../src/core/rng.js';
import { newRun } from '../src/core/run.js';
import { playRun } from './bot.js';

const N = Number(process.argv.find((a) => /^\d+$/.test(a)) || 200);
const verbose = process.argv.includes('--verbose');

let wins = 0;
const deaths = {};
const floors = [];
const enc = {};
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const seed = `SIM${i}`;
  const run = newRun(seed);
  const log = [];
  playRun(run, new RNG(i + 1), log);
  if (run.over === 'win') wins++;
  else {
    const last = log[log.length - 1];
    const key = last ? `A${last.act} ${last.kind} ${last.enc}` : 'other';
    deaths[key] = (deaths[key] || 0) + 1;
  }
  floors.push(run.floor);
  for (const l of log) {
    const k = `A${l.act} ${l.kind.padEnd(6)} ${l.enc}`;
    enc[k] ||= { n: 0, lost: 0, turns: 0, losses: 0 };
    enc[k].n++;
    enc[k].lost += l.lost;
    enc[k].turns += l.turns;
    if (!l.won) enc[k].losses++;
  }
  if (verbose) console.log(seed, run.over, 'floor', run.floor, 'hp', run.hp, 'deck', run.deck.length, 'relics', run.relics.map((r) => r.id).join(','));
}

const avgFloor = floors.reduce((a, b) => a + b, 0) / N;
console.log(`\n${N} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s  win rate ${(100 * wins / N).toFixed(1)}%  avg floor ${avgFloor.toFixed(1)}`);
console.log('\nDeaths by encounter:');
for (const [k, v] of Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('\nEncounter           avg HP lost  avg turns  losses/n');
for (const [k, v] of Object.entries(enc).sort()) {
  console.log(`  ${k.padEnd(40)} ${(v.lost / v.n).toFixed(1).padStart(6)} ${(v.turns / v.n).toFixed(1).padStart(8)}   ${v.losses}/${v.n}`);
}
