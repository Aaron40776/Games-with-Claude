// Systematic world-consistency audit over many seeds and waves.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.goto(process.argv[2] || 'http://localhost:8124/index.html');
await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 60000 });
const r = await page.evaluate(() => {
  const T = window.__riftTest, issues = {}, cnt = {}, add = (k, m) => { (issues[k] ||= []).length < 6 && issues[k].push(m); cnt[k] = (cnt[k] || 0) + 1; };
  const Eu = T.Eu, stats = { waves: 0, spawns: 0, pickups: 0, bosses: 0 };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new T.Aa({ seed, weapon: 'pulse', threat: seed % 6, ws: { fieldSupply: 3, routeScanner: 3 } });
    const seen = new Set();
    for (let wave = 1; wave <= 40; wave++) {
      if (wave > 1) w.startWave(wave);
      stats.waves++;
      const A = w.arena, b = A.biome;
      if (wave <= 19) seen.add(b.id);
      if (wave > 1 && w.biomeFor(wave - 1).id === b.id) add('route-repeat', `seed ${seed} wave ${wave} ${b.id}`);
      if (b.id !== w.biomeFor(wave).id) add('route-mismatch', `wave ${wave}`);
      if (!A.key.startsWith(b.id + ':')) add('layout-key', `${A.key} vs ${b.id}`);
      // walls
      for (const o of A.obs) {
        const ex = o.t === 'c' ? o.r : Math.max(o.w, o.h);
        if (Math.abs(o.x) + (o.t === 'c' ? o.r : o.w) > A.W - 1 || Math.abs(o.y) + (o.t === 'c' ? o.r : o.h) > A.H - 1) add('wall-outside', `${b.id} w${wave}`);
        if (Eu([o], 0, 2, 1.5)) add('wall-on-start', `${b.id} w${wave} ${JSON.stringify(o)}`);
      }
      for (let i = 0; i < A.obs.length; i++) for (let j = i + 1; j < A.obs.length; j++) { const a = A.obs[i], c = A.obs[j]; if (Eu([a], c.x, c.y, 0.01)) add('wall-overlap', `${b.id} w${wave}`); }
      if (!T.kp(A.obs, A.W, A.H)) add('wall-connectivity', `${b.id} w${wave}`);
      // features vs walls
      for (const k of ['vents', 'ice', 'acid']) for (const q of A[k]) if (Eu(A.obs, q.x, q.y, q.r * 0.5)) add('feature-in-wall', `${k} ${b.id} w${wave}`);
      const theme = { yard:'',works:'vents',vault:'ice',void:'portals',marsh:'acid',tempest:'ice',crystal:'ice',ash:'vents',grove:'acid',starfall:'ice',fracture:'vents',canopy:'acid',catacomb:'portals',aurora:'ice',drowned:'acid',horizon:'vents',foundry:'vents',bloomrift:'acid',requiem:'portals' }[b.id];
      for (const k of ['vents','ice','acid','portals']) if (A[k].length && k !== theme) add('hazard-off-theme', `${k} in ${b.id} w${wave}`);
      for (const p of A.portals) for (const [x, y] of [[p.ax, p.ay], [p.bx, p.by]]) if (Eu(A.obs, x, y, 1) || A.outside(x, y, 1)) add('portal-bad', `${b.id} w${wave}`);
      // pickups / caches
      for (const q of w.pickups) { stats.pickups++; if (A.blocked(q.x, q.y, 0.3) || A.outside(q.x, q.y, 0.5)) add('pickup-in-wall', `${b.id} w${wave}`); }
      // enemy plan: 'from' respected
      for (const g of w.plan) for (const m of g.members) if (T.Ae[m.type].from > wave) add('enemy-too-early', `${m.type} (from ${T.Ae[m.type].from}) in wave ${wave}`);
      // simulate spawns: run until plan exhausted or 90 s, check marker & enemy positions
      w.god = true; let t = 0;
      const boss = w.bossPending;
      while (t < 90 && (w.planIdx < w.plan.length || w.markers.length || w.bossPending)) {
        const before = w.markers.length;
        w.step(1 / 30, { mx: Math.sin(t), my: Math.cos(t * .7), fire: false, auto: false }); t += 1 / 30;
        for (const mk of w.markers) if (mk.t === 0 || mk.t < 1 / 30 + 1e-6) {
          if (mk.fake) continue; stats.spawns++;
          if (A.blocked(mk.x, mk.y, 0.3)) add('spawn-in-wall', `${mk.type} ${b.id} w${wave}`);
          if (A.outside(mk.x, mk.y, 0.5)) add('spawn-outside', `${mk.type} ${b.id} w${wave}`);
          if (A.featureBlocked(mk.x, mk.y, 0)) add('spawn-on-hazard', `${mk.type} ${b.id} w${wave}`);
          if (Math.hypot(mk.x - w.player.x, mk.y - w.player.y) < 4) add('spawn-near-player', `${mk.type} d=${Math.hypot(mk.x - w.player.x, mk.y - w.player.y).toFixed(1)} ${b.id} w${wave}`);
        }
        for (const e of w.enemies) if (A.blocked(e.x, e.y, -Math.min(0.3, e.r * 0.5)) ) { add('enemy-inside-wall', `${e.type} ${b.id} w${wave} pl=${w.player.x.toFixed(1)},${w.player.y.toFixed(1)} e=${e.x.toFixed(1)},${e.y.toFixed(1)}`); break; }
        if (w.boss && !stats._b) { stats.bosses++; const B = w.boss; if (A.blocked(B.x, B.y, 0) || A.outside(B.x, B.y, 1)) add('boss-spawn-bad', `${B.type} ${b.id} w${wave}`); stats._b = 1; }
      }
      stats._b = 0;
      if (boss && !w.boss && !w.bossKills.length && wave % 5 === 0) {}
      w.enemies = []; w.markers = []; w.planIdx = w.plan.length; w.bossPending = null; w.boss = null; w.championPending = null;
    }
    if (seen.size !== 19) add('route-coverage', `seed ${seed}: ${seen.size}/19 biomes in waves 1–19`);
  }
  return { stats, issues, cnt };
});
console.log(JSON.stringify(r.stats));
for (const [k, v] of Object.entries(r.issues)) console.log(`${k} ×${r.cnt[k]}: ${v.join(' | ')}`);
const nIssues = Object.keys(r.issues).length;
console.log(nIssues ? `WORLD AUDIT: ${nIssues} issue type(s)` : 'WORLD AUDIT: no issues');
await browser.close();
process.exitCode = nIssues ? 1 : 0;
