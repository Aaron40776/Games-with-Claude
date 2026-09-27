// Drives a real run (live world + real UI loop) with a bot through N waves, then dies,
// and prints the post-run audit produced by the in-game monitor.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:8124/index.html';
const WEAPON = process.argv[3] || 'pulse', TARGET = +(process.argv[4] || 22);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
await page.evaluate(w => { const T = window.__riftTest; T.store.data.weapons[w] = true; T.store.data.weapon = w; T.store.data.seen.tutorial = true; }, WEAPON);
await page.click('#playBtn'); await page.waitForTimeout(500);
let wave = 1, guard = 0;
while (wave < TARGET && guard++ < 400) {
  const r = await page.evaluate(() => {
    const g = window.__riftTest.game, w = g.world; if (!w) return { wave: -1 };
    w.god = true;
    for (let i = 0; i < 900; i++) {
      if (w.state === 'choose') { g.choose(w.offer[0]); break; }
      if (w.state === 'victory') { break; }
      const p = w.player; let t = null, b = 1e9;
      for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < b) { b = d; t = e; } }
      const inp = { mx: 0, my: 0, fire: true, auto: true, assist: true, dash: i % 200 === 0, nova: p.nova >= 100 };
      if (t) { const a = Math.atan2(t.y - p.y, t.x - p.x); inp.aim = true; inp.ax = Math.cos(a); inp.ay = Math.sin(a); const k = b < 5 ? -1 : b > 9 ? 1 : .3; inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * .5; inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * .5; }
      w.step(1 / 60, inp);
      if (w.state === 'fight' && w.time - (w._t0 ?? (w._t0 = w.time)) > 150) { for (const e of [...w.enemies]) w.killEnemy(e); w.planIdx = w.plan.length; w.markers = []; }
    }
    if (w.state !== 'fight') w._t0 = undefined;
    return { wave: w.wave, state: w.state };
  });
  if (r.state === 'victory') { await page.waitForTimeout(3000); if (await page.isVisible('#endlessBtn')) { console.log('victory at wave 20 → endless'); await page.click('#endlessBtn'); await page.waitForTimeout(300); } }
  wave = r.wave; await page.waitForTimeout(60);
}
await page.evaluate(() => { const w = window.__riftTest.game.world; w.god = false; w.player.iT = 0; w.player.shield = false; w.hurtPlayer(1e6, null, null, 'grunt', true); });
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const a = await page.evaluate(() => window.__riftTest.lastRunAudit);
console.log(`run reached wave ${wave}; audit outcome ${a.outcome}, ok=${a.ok}`);
for (const c of a.checks) console.log(`  [${c.st}] ${c.id}: ${c.msg}`);
console.log('page errors:', errors.length ? errors : 'none');
(await import('fs')).mkdirSync('tests/shots', { recursive: true });
await page.screenshot({ path: 'tests/shots/run-over.png' });
await browser.close();
process.exitCode = a.ok && !errors.length ? 0 : 1;
