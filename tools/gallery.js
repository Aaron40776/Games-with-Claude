// Screenshot gallery of every screen and a few enemy line-ups, driven by
// setting run state directly (faster than playing to each room).
//   node tools/gallery.js [--phone]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'shots', 'gallery');
fs.mkdirSync(OUT, { recursive: true });
const phone = process.argv.includes('--phone');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone
  ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
  : { viewport: { width: 1366, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.join(ROOT, 'dist/index.html')).href);
await page.waitForTimeout(800);
const tag = phone ? 'phone' : 'desk';
const shot = (n) => page.screenshot({ path: path.join(OUT, `${tag}-${n}.png`) });

async function setRoom(room, extra = '') {
  await page.evaluate(([room, extra]) => {
    const app = window.__riftdeck;
    if (!app.run) app.startRun('GALLERY1');
    app.endCombatView();
    const run = app.run;
    run.room = room;
    // eslint-disable-next-line no-new-func
    if (extra) new Function('run', 'app', extra)(run, app);
    app.commit();
  }, [room, extra]);
  await page.waitForTimeout(900);
}

await setRoom(null, "run.relics.push({id:'tally_counter',counter:4},{id:'ember_core'},{id:'void_battery'},{id:'phoenix_sigil',counter:1}); run.cells=['blast_cell','repair_cell',null];");
await shot('map');
await setRoom({ type: 'event', eventId: 'echo_cache', stage: 'choose', options: null, result: null, queue: [] });
await shot('event');
await setRoom({ type: 'shop', stock: null, removed: false }, "run.room.stock = [{kind:'card',id:'twin_burst',up:false,price:52},{kind:'card',id:'scatter_blast',up:false,price:48,sale:true},{kind:'card',id:'phase_step',up:false,price:55},{kind:'card',id:'coolant_flush',up:false,price:74},{kind:'card',id:'echo_chamber',up:false,price:151},{kind:'relic',id:'kinetic_plate',price:150},{kind:'relic',id:'shock_coil',price:245},{kind:'relic',id:'membership_chip',price:180},{kind:'cell',id:'fire_cell',price:52},{kind:'cell',id:'energy_cell',price:49},{kind:'cell',id:'phase_cell',price:96}]; run.shards = 180;");
await shot('shop');
await setRoom({ type: 'rest', done: false });
await shot('rest');
await setRoom({ type: 'rest', done: false, pendingChoice: { kind: 'deck', op: 'upgrade', n: 1, source: 'rest', cancellable: true } });
await page.locator('.modal .card').nth(2).click();
await page.waitForTimeout(300);
await shot('upgrade');
await setRoom({ type: 'treasure', opened: true, relic: 'mirror_core', shards: 28 });
await shot('treasure');
await setRoom({ type: 'boss', stage: 'reward', encounter: ['gatekeeper'], rewards: { shards: 0, cell: null, cards: null, relics: [], bossRelics: ['rift_engine', 'hollow_crown', 'wide_lens'] } });
await page.locator('.reward.boss').click();
await page.waitForTimeout(300);
await shot('bossrelic');

const fights = [['elite-sentries', 'elite', ['sentry', 'sentry', 'sentry']], ['boss1', 'boss', ['gatekeeper']], ['brood', 'elite', ['brood']],
  ['act2', 'combat', ['hound', 'shade', 'cultist']], ['boss2', 'boss', ['leviathan']], ['act3', 'combat', ['weaver', 'sentinel', 'mite']],
  ['elite3', 'elite', ['archon', 'archon']], ['colossus', 'elite', ['colossus']], ['heart', 'boss', ['heart']]];
for (const [name, type, enc] of fights) {
  const act = name.includes('3') || name === 'heart' || name === 'colossus' ? 3 : name.includes('2') ? 2 : 1;
  await setRoom({ type, stage: 'fight', encounter: enc }, `run.act = ${act};`);
  await page.waitForTimeout(2600);
  await shot(`fight-${name}`);
}
await page.evaluate(() => { const app = window.__riftdeck; app.endCombatView(); app.run.over = 'win'; app.run.stats.kills = 61; app.run.floor = 36; app.commit(); });
await page.waitForTimeout(700);
await shot('end');
await page.evaluate(() => window.__riftdeck.toTitle());
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'How to play' }).click();
await page.waitForTimeout(300);
await shot('help');
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('gallery ok ->', OUT);
