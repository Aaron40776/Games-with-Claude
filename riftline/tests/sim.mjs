import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8124/index.html';
const weapons = (process.argv[3] || 'pulse').split(',');
const maxWave = +(process.argv[4] || 20);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__riftTest, null, { timeout: 60000 });
for (const wpn of weapons) {
  const r = await page.evaluate(({ wpn, maxWave }) => {
    const T = window.__riftTest, out = { weapon: wpn, errors: [], nonfinite: [], waves: [], evKinds: {} };
    const w = new T.Aa({ seed: T.Yi ? 1 : (wpn.length * 7919) >>> 0, weapon: wpn, threat: 2, ws: { hull: 5, power: 5, droneBay: 2 } });
    w.god = true;
    let steps = 0, waveSteps = 0, maxEnemies = 0, maxEb = 0, maxPb = 0, maxPick = 0;
    const t0 = performance.now();
    try {
      while (w.wave <= maxWave && steps < 400000) {
        const p = w.player;
        let tgt = null, best = 1e9;
        for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; tgt = e; } }
        const inp = { mx: 0, my: 0, aim: false, fire: true, auto: true, assist: true, dash: steps % 180 === 0, nova: p.nova >= 100 };
        if (tgt) { const a = Math.atan2(tgt.y - p.y, tgt.x - p.x); inp.aim = true; inp.ax = Math.cos(a); inp.ay = Math.sin(a); const k = best < 5 ? -1 : best > 9 ? 1 : 0.3; inp.mx = Math.cos(a) * k + Math.cos(a + 1.57) * 0.5; inp.my = Math.sin(a) * k + Math.sin(a + 1.57) * 0.5; }
        else if (w.pickups.length) { const q = w.pickups[0]; const a = Math.atan2(q.y - p.y, q.x - p.x); inp.mx = Math.cos(a); inp.my = Math.sin(a); }
        w.step(1 / 60, inp); steps++; waveSteps++;
        for (const f of w.fx) out.evKinds[f.k] = (out.evKinds[f.k] || 0) + 1;
        w.fx.length = 0;
        maxEnemies = Math.max(maxEnemies, w.enemies.length); maxEb = Math.max(maxEb, w.eb.length); maxPb = Math.max(maxPb, w.pb.length); maxPick = Math.max(maxPick, w.pickups.length);
        if (steps % 30 === 0) {
          if (![p.x, p.y, p.vx, p.vy, p.hp, w.shards, w.time].every(Number.isFinite)) out.nonfinite.push('player@' + w.wave);
          for (const e of w.enemies) if (![e.x, e.y, e.hp].every(Number.isFinite)) { out.nonfinite.push(e.type + '@' + w.wave); break; }
          if (Math.abs(p.x) > w.arena.W + 0.01 || Math.abs(p.y) > w.arena.H + 0.01) out.nonfinite.push('player-oob@' + w.wave);
        }
        if (waveSteps > 60 * 240) { out.waves.push({ wave: w.wave, stuck: true, enemies: w.enemies.length, plan: w.plan.length - w.planIdx, markers: w.markers.length, state: w.state, types: w.enemies.map(e => e.type + (e.hunt ? '*' : '')).join(',') }); w.enemies.forEach(e => w.killEnemy(e)); waveSteps = 0; }
        if (w.state === 'choose') {
          out.waves.push({ wave: w.wave, secs: +(waveSteps / 60).toFixed(1), mode: w.waveMode, biome: w.arena.biome.id });
          waveSteps = 0;
          w.choose(w.offer[0]);
        } else if (w.state === 'victory') {
          out.waves.push({ wave: w.wave, secs: +(waveSteps / 60).toFixed(1), victory: true });
          if (w.wave >= maxWave) break;
          w.continueEndless(); waveSteps = 0;
        }
      }
    } catch (e) { out.errors.push(String(e && e.stack || e).slice(0, 600)); }
    out.ms = Math.round(performance.now() - t0); out.steps = steps; out.finalWave = w.wave; out.max = { maxEnemies, maxEb, maxPb, maxPick }; out.up = Object.keys(w.up).length;
    return out;
  }, { wpn, maxWave });
  console.log(JSON.stringify({ ...r, waves: r.waves.filter(x => x.stuck || x.victory).concat([{ n: r.waves.length, avgSecs: +(r.waves.reduce((a, b) => a + (b.secs || 0), 0) / Math.max(1, r.waves.length)).toFixed(1) }]) }));
}
console.log(errs.join('\n'));
await browser.close();
