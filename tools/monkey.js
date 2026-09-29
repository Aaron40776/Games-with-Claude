// Monkey test: plays whole runs through the real UI with random (seeded)
// choices, and fails on any page error or on a stall (the same state for too
// long). Catches lifecycle bugs the scripted tests don't reach: screens that
// change mid-animation, modals over combat, rewards claimed in odd orders.
//   node tools/monkey.js [seed] [runs] [--phone]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'shots', 'monkey');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = args[0] || 'MONKEY';
const runs = Number(args[1] || 2);
const phone = process.argv.includes('--phone');
const MAX_STEPS = 4000;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone
  ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
  : { viewport: { width: 1280, height: 760 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.join(ROOT, 'dist/index.html')).href);
await page.waitForTimeout(500);

let s = 0;
for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);

/** One action in the page; returns a short signature of what happened (or `done`). */
function step(x) {
  const app = window.__riftdeck;
  const pick = (list) => list[Math.floor(x * list.length) % list.length];
  const visible = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.disabled && !e.closest('.closing'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return (async () => {
    if (app.run?.over) return { done: app.run.over, floor: app.run.floor };
    const cv = app.combat;
    if (cv && !app.modals.length) {
      for (let i = 0; i < 100 && cv.busy && app.combat === cv; i++) await sleep(50);
      if (app.combat !== cv) return { sig: 'left combat' };
      if (cv.busy) return { sig: 'busy' };
      const g = cv.g;
      if (g.outcome) { await sleep(100); return { sig: 'outcome' }; }
      const playable = g.hand.filter((c) => g.canPlay(c));
      if (x < 0.05 && app.run.cells.some(Boolean)) {
        cv.useCell(app.run.cells.findIndex(Boolean), g.aliveEnemies()[0]?.ref);
        return { sig: `cell ${g.turn}` };
      }
      if (playable.length && x < 0.85) {
        const t = pick(g.aliveEnemies());
        cv.play(pick(playable).uid, t ? t.ref : null);
        return { sig: `play ${g.turn}:${g.hand.length}:${g.energy}`, busy: true };
      }
      cv.endTurn();
      return { sig: `end turn ${g.turn}` };
    }
    if (app.modals.length) {
      const modal = document.querySelector('.modal-backdrop:not(.closing) .modal');
      const cards = modal ? [...modal.querySelectorAll('.card.pickable')] : [];
      if (cards.length && !modal.querySelector('.card.picked')) { pick(cards).click(); return { sig: 'modal card' }; }
      const btns = modal ? [...modal.querySelectorAll('.actions .btn:not(:disabled)')] : [];
      const primary = btns.find((b) => b.classList.contains('primary'));
      const b = x < 0.8 && primary ? primary : pick(btns);
      if (b) { b.click(); return { sig: `modal ${b.textContent}` }; }
      return { sig: 'modal without buttons', stuck: true };
    }
    const screen = app.screenEl.dataset.screen;
    if (screen === 'map') {
      const nodes = visible('.node.reach');
      if (!nodes.length) return { sig: 'map without reachable rooms', stuck: true };
      pick(nodes).click();
      await sleep(30);
      document.querySelector('.map-enter')?.click();
      return { sig: `map floor ${app.run.floor}` };
    }
    const choices = visible('.reward, .option, .rest-opt, .chest, .shop-card, .shop-item');
    const onward = visible('.panel .actions .btn');
    if (choices.length && (x < 0.7 || !onward.length)) {
      const c = pick(choices);
      c.click();
      return { sig: `${screen}: ${c.className} (${app.run.shards} shards)` };
    }
    if (onward.length) { pick(onward).click(); return { sig: `${screen}: onward` }; }
    return { sig: `${screen}: nothing to do`, stuck: true };
  })();
}

const results = [];
let failed = false;
fs.mkdirSync(OUT, { recursive: true });
for (let r = 0; r < runs && !failed; r++) {
  const runSeed = `${seed}${r}`;
  // Fast animations, cheap rendering and a big HP pool, so random play reaches the later acts.
  await page.evaluate((runSeed) => {
    const app = window.__riftdeck;
    Object.assign(app.settings, { speed: 'fast', quality: 'low' });
    app.scene.speed = 1.8;
    app.scene.setQuality('low');
    app.closeAllModals();
    app.startRun(runSeed);
    app.run.maxHp = app.run.hp = 600;
    app.save();
    app.route();
  }, runSeed);
  let last = '';
  let same = 0;
  let steps = 0;
  for (; steps < MAX_STEPS; steps++) {
    const st = await page.evaluate(step, rand());
    if (st.done) { results.push(`${runSeed}: ${st.done} on floor ${st.floor} after ${steps} steps`); break; }
    same = st.sig === last && !st.busy ? same + 1 : 0;
    last = st.sig;
    const stalled = st.stuck ? same > 20 : same > 200;
    if (stalled || errors.length) {
      results.push(`${runSeed}: ${errors.length ? 'page error' : 'stalled'} at step ${steps} ("${st.sig}")`);
      await page.screenshot({ path: path.join(OUT, `${runSeed}.png`) });
      failed = true;
      break;
    }
  }
  if (steps >= MAX_STEPS) results.push(`${runSeed}: still going after ${MAX_STEPS} steps`);
}
await browser.close();
console.log(results.join('\n'));
if (errors.length) console.log(`ERRORS:\n${[...new Set(errors)].slice(0, 8).join('\n')}`);
if (failed) process.exit(1);
console.log('monkey ok');
