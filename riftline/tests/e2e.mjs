// Riftline end-to-end regression suite (PC + touch devices). Usage: node e2e.mjs <url> [profileFilter]
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:8124/index.html';
const only = process.argv[3] || '';
const SHOTS = 'tests/shots';
import fs from 'fs'; fs.mkdirSync(SHOTS, { recursive: true });
const PROFILES = [
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, touch: false },
  { name: 'desktop-1280x640', viewport: { width: 1280, height: 640 }, touch: false },
  { name: 'tablet-1024x768', viewport: { width: 1024, height: 768 }, touch: true, mobile: true },
  { name: 'phone-390x844', viewport: { width: 390, height: 844 }, touch: true, mobile: true },
  { name: 'phone-844x390', viewport: { width: 844, height: 390 }, touch: true, mobile: true },
].filter(p => !only || p.name.includes(only));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let totalFail = 0;
for (const prof of PROFILES) {
  const ctx = await browser.newContext({ viewport: prof.viewport, hasTouch: !!prof.touch, isMobile: !!prof.mobile, deviceScaleFactor: prof.mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [], results = [];
  const ok = (name, cond, detail = '') => { results.push([cond ? 'PASS' : 'FAIL', name, detail]); if (!cond) totalFail++; };
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const cdp = await ctx.newCDPSession(page);
  const tap = async (sel) => {
    const el = await page.$(sel); if (!el) throw new Error('missing ' + sel);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox(); if (!b) throw new Error('invisible ' + sel);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (prof.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(250);
  };
  const vis = (id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, id);
  const audit = async (label) => { const a = await page.evaluate(() => window.__riftLayoutAudit()); ok(`layout ${label}`, a.ok && a.checked > 0, `${a.checked} checked; ${a.findings.join('; ')}`); };
  const touchDrag = async (x0, y0, dx, dy, ms) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    const n = Math.max(2, Math.round(ms / 50));
    for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * Math.min(1, i / 4), y: y0 + dy * Math.min(1, i / 4), id: 1 }] }); await page.waitForTimeout(50); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.__riftTest && window.__riftTest.game && window.__riftTest.RL_HEALTH.length > 5, null, { timeout: 90000 });
    await page.waitForTimeout(1200);
    const t0 = Date.now();
    await tap('[data-go="settings"]');
    ok('menu responsive (settings opens)', await vis('settings'), `${Date.now() - t0} ms`);
    await audit('settings'); await tap('#settings [data-back]');
    ok('home after back', await vis('home'));
    await audit('home');
    await page.screenshot({ path: `${SHOTS}/${prof.name}-home.png` });
    for (const s of ['workshop', 'records']) { await tap(`[data-go="${s}"]`); ok(`nav ${s}`, await vis(s)); await audit(s); await tap(`#${s} [data-back]`); }
    await tap('#wNext'); ok('weapon next', (await page.textContent('#wIndex')).startsWith('2/'));
    await tap('#wPrev');
    // --- start run
    await tap('#playBtn');
    await page.waitForTimeout(800);
    ok('run started (HUD visible)', await vis('hud'), await page.evaluate(() => window.__riftTest.game.mode));
    const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
    results.push(['INFO', 'rAF fps (headless, software GL)', String(fps)]);
    // skip tutorial hold if present
    await page.evaluate(() => { const g = window.__riftTest.game; if (g.tut) { g.tut.step = 4; } });
    // --- input
    const W = prof.viewport.width, H = prof.viewport.height;
    const p0 = await page.evaluate(() => { const p = window.__riftTest.game.world.player; return [p.x, p.y]; });
    if (prof.touch) { await touchDrag(W * 0.2, H * 0.7, 60, -40, 1200); }
    else { await page.keyboard.down('d'); await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('d'); await page.keyboard.up('w'); }
    const p1 = await page.evaluate(() => { const p = window.__riftTest.game.world.player; return [p.x, p.y]; });
    ok('player moved by input', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1, `${p0.map(v => v.toFixed(1))} -> ${p1.map(v => v.toFixed(1))}`);
    if (prof.touch) { await tap('#dashBtn'); } else { await page.keyboard.press('Space'); }
    await page.waitForFunction(() => window.__riftTest.game.world.runStats.dashes > 0, null, { timeout: 4000 }).catch(() => {});
    ok('dash registered', await page.evaluate(() => window.__riftTest.game.world.runStats.dashes > 0));
    await page.screenshot({ path: `${SHOTS}/${prof.name}-game.png` });
    // --- pause/resume
    if (prof.touch) await tap('#pauseBtn'); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok('pause screen', await vis('pause'));
    await audit('pause');
    await tap('#resumeBtn');
    ok('resumed', !(await vis('pause')) && !(await page.evaluate(() => window.__riftTest.game.paused)));
    // --- clear wave -> choose
    await page.evaluate(() => { const w = window.__riftTest.game.world; w.god = true; w.planIdx = w.plan.length; w.bossPending = null; w.championPending = null; w.markers = []; for (const e of [...w.enemies]) w.killEnemy(e); });
    await page.waitForFunction(() => !document.getElementById('choose').hidden, null, { timeout: 15000 }).catch(() => {});
    ok('choose screen after wave clear', await vis('choose'));
    await page.waitForTimeout(800);
    await audit('choose');
    await page.screenshot({ path: `${SHOTS}/${prof.name}-choose.png` });
    await tap('#cards .card');
    await page.waitForTimeout(400);
    const wv = await page.evaluate(() => window.__riftTest.game.world.wave);
    ok('upgrade picked -> wave 2', wv === 2 && !(await vis('choose')), 'wave ' + wv);
    // --- reload & continue
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => window.__riftTest && window.__riftTest.game, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    ok('continue offered after reload', await vis('continueBtn'), await page.textContent('#continueBtn').catch(() => ''));
    ok('no crash after reload with save', !errors.some(e => /is not a function/.test(e)), errors.join(' | ').slice(0, 200));
    if (await vis('continueBtn')) {
      await tap('#continueBtn'); await page.waitForTimeout(800);
      const cw = await page.evaluate(() => window.__riftTest.game.world && window.__riftTest.game.world.wave);
      ok('continue restores wave 2', cw === 2, 'wave ' + cw);
    }
    // --- death -> over
    await page.evaluate(() => { const w = window.__riftTest.game.world; w.god = false; w.player.iT = 0; w.player.dashT = 0; w.player.shield = false; w.hurtPlayer(99999, null, null, 'grunt', true); });
    await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 15000 }).catch(() => {});
    ok('game over screen', await vis('over'));
    await page.waitForTimeout(1200);
    await audit('over');
    await page.screenshot({ path: `${SHOTS}/${prof.name}-over.png` });
    const aud = await page.evaluate(() => window.__riftTest.lastRunAudit);
    ok('post-run audit present', !!(aud && aud.checks && aud.checks.length >= 10), aud ? `${aud.checks.length} checks` : 'none');
    if (aud) for (const c of aud.checks) results.push([c.st === 'FAIL' ? 'FAIL' : 'INFO', 'audit ' + c.id, `[${c.st}] ${c.msg}`]);
    if (aud) totalFail += aud.checks.filter(c => c.st === 'FAIL').length;
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('riftline.save.v1')));
    ok('save: run cleared after death', saved && saved.run === null);
    await tap('#homeBtn');
    ok('home after run', await vis('home'));
    // diagnostics dialog
    await tap('[data-go="settings"]'); await tap('#logBtn');
    await page.waitForFunction(() => !document.getElementById('dialog').hidden, null, { timeout: 60000 }).catch(() => {});
    ok('diagnostics dialog opens', await vis('dialog'));
    const logText = await page.evaluate(() => document.querySelector('#dlgBody textarea')?.value || '');
    fs.writeFileSync(`${SHOTS}/${prof.name}-diagnostics.txt`, logText);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  } catch (e) { ok('suite exception', false, String(e.message).split('\n')[0]); }
  ok('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(`\n=== ${prof.name} ===`);
  for (const r of results) console.log(`[${r[0]}] ${r[1]}${r[2] ? ' — ' + r[2] : ''}`);
  await ctx.close();
}
await browser.close();
console.log(`\nTOTAL FAIL: ${totalFail}`);
process.exit(totalFail ? 1 : 0);
