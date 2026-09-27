// Captures every screen/state for manual visual review. Usage: node screens.mjs [url] pc|phone|land
import { chromium } from 'playwright';
import fs from 'fs';
const URL = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://localhost:8124/index.html';
const NAME = /^https?:/.test(process.argv[2] || '') ? process.argv[3] : process.argv[2];
const prof = { pc: { viewport: { width: 1920, height: 955 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, land: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }[NAME];
if (!prof) { console.error('usage: node screens.mjs [url] pc|phone|land'); process.exit(2); }
const OUT = `tests/shots/screens-${NAME}`; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await b.newContext(prof); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(URL); await p.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 });
const shot = async n => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${n}.png` }); };
const ev = (f, a) => p.evaluate(f, a);
await ev(() => { const T = window.__riftTest, d = T.store.data; d.shards = 2345; d.stats.runs = 12; d.stats.kills = 3400; d.stats.bestWave = 17; d.workshop = { hull: 3, power: 2, magnet: 3, insight: 1 }; d.weapons.ion = true; d.seen.tutorial = false; T.store.save('qa'); T.ui.homeInit = false; T.ui.show('home'); });
await shot('01-home');
for (const s of ['workshop', 'records', 'settings']) { await ev(s => { window.__riftTest.ui.show(s); }, s); await shot('02-' + s); await ev(s => { const e = document.querySelector('#' + s + ' .scroll') || document.getElementById(s); e.scrollTop = 1e6; for (const x of document.querySelectorAll('#' + s + ' *')) if (x.scrollHeight > x.clientHeight + 20) x.scrollTop = 1e6; }, s); await shot('03-' + s + '-bottom'); }
await ev(() => window.__riftTest.ui.show('home'));
await ev(() => window.__riftTest.game.startRun({})); await shot('04-run-tutorial');
await ev(() => { const g = window.__riftTest.game; if (g.tut) g.tut.step = 4; });
await p.waitForTimeout(2500); await shot('05-run-fight');
await ev(() => { const w = window.__riftTest.game.world; w.god = true; w.planIdx = w.plan.length; w.bossPending = null; w.championPending = null; w.markers = []; for (const e of [...w.enemies]) w.killEnemy(e); });
await p.waitForFunction(() => !document.getElementById('choose').hidden, null, { timeout: 30000 }); await shot('06-choose');
await ev(() => { window.__riftTest.game.world.wave = 9; }); await p.click('#cards .card', { force: true }).catch(() => {});
await ev(() => { const g = window.__riftTest.game; if (g.world.state === 'choose') g.world.choose(g.world.offer[0]); });
await p.waitForFunction(() => window.__riftTest.game.world.boss, null, { timeout: 40000 }).catch(() => {}); await p.waitForTimeout(2500); await shot('07-boss');
await ev(() => window.__riftTest.game.pause()); await shot('08-pause');
await ev(() => { const g = window.__riftTest.game; g.paused = false; window.__riftTest.ui.hidePause(); const w = g.world; w.god = false; w.player.iT = 0; w.player.shield = false; w.hurtPlayer(99999, null, null, 'grunt', true); });
await p.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500); await shot('09-over-death');
await ev(() => { const o = document.querySelector('#over .center-col'); o && (o.scrollTop = 1e6); }); await shot('10-over-death-bottom');
await ev(() => window.__riftTest.game.goHome());
await ev(() => window.__riftTest.ui.show('settings')); await p.click('#backupBtn', { force: true }); await shot('11-dialog-export');
await ev(() => window.__riftTest.ui.closeDialog(null));
await p.click('#logBtn', { force: true }); await p.waitForFunction(() => !document.getElementById('dialog').hidden, null, { timeout: 60000 }); await shot('12-dialog-diagnostics');
await ev(() => window.__riftTest.ui.closeDialog(null));
await ev(() => { window.__riftTest.ui.showCrash('TypeError: example\n  at frame'); }); await shot('13-crash');
await ev(() => { window.__riftTest.ui.hideCrash(); window.__riftTest.ui.show('home'); window.__riftTest.ui.toast('Save restored', 'gold', 5000); window.__riftTest.ui.setUpdate && window.__riftTest.ui.setUpdate(true); }); await shot('14-toast-update');
console.log(NAME, 'errors:', errs.length ? errs : 'none');
await b.close();
