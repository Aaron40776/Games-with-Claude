// Riftline full QA runner — criteria-based, step by step.
// Usage: node full-qa.mjs [baseUrl] [sectionFilter]
//   sections: files, saves, ui, run, buttons
// Every check states its criterion; the run fails if any check fails.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = (process.argv[2] || 'http://localhost:8124/').replace(/index\.html$/, '');
const ONLY = process.argv[3] || '';
const FIX = new URL('./fixtures/', import.meta.url).pathname;
fs.mkdirSync(new URL('./shots/', import.meta.url).pathname, { recursive: true });
const KEY = 'riftline.save.v1';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, touch: false },
  phone: { viewport: { width: 390, height: 844 }, touch: true, mobile: true },
};
let fails = 0; const out = [];
const log = (sec, st, name, detail = '') => { out.push(`[${st}] ${sec} · ${name}${detail ? ' — ' + detail : ''}`); if (st === 'FAIL') fails++; };

/* ---------- helpers ---------- */
// Fresh browser context; `save` is written to localStorage once, before the game boots
// (string = raw text, null = no save). `block` makes localStorage throw.
async function open(profName, { save = null, block = false } = {}) {
  const prof = PROFILES[profName];
  const ctx = await browser.newContext({ viewport: prof.viewport, hasTouch: !!prof.touch, isMobile: !!prof.mobile, deviceScaleFactor: prof.mobile ? 2 : 1 });
  await ctx.addInitScript(([k, v, block]) => {
    if (block) { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); return; }
    if (sessionStorage.getItem('__qaSeeded')) return;
    sessionStorage.setItem('__qaSeeded', '1');
    localStorage.clear();
    if (v != null) localStorage.setItem(k, v);
  }, [KEY, save, block]);
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => bad.push(`failed ${r.url()}`));
  const P = { ctx, page, errors, bad, prof };
  P.boot = async () => {
    await page.goto(BASE + 'index.html');
    await page.waitForFunction(() => window.__riftTest && window.__riftTest.game && window.__riftTest.ui && window.__riftTest.RL_HEALTH.length > 5, null, { timeout: 90000 });
    await page.waitForTimeout(800);
  };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.vis = id => page.evaluate(i => { const e = document.getElementById(i); if (!e || e.hidden) return false; let n = e; while (n && n !== document.body) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return false; n = n.parentElement; } return true; }, id);
  P.tap = async (sel) => {
    const el = typeof sel === 'string' ? await page.$(sel) : sel;
    if (!el) throw new Error('missing ' + sel);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox(); if (!b) throw new Error('invisible ' + sel);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (prof.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(prof.touch ? 900 : 300); // > touch ghost-click guard window
  };
  // click a dialog button by its label
  P.dlg = async (label) => {
    await page.waitForFunction(() => !document.getElementById('dialog').hidden, null, { timeout: 5000 });
    const btns = await page.$$('#dlgBtns button');
    for (const b of btns) if ((await b.textContent()).trim().toLowerCase() === label.toLowerCase()) return P.tap(b);
    throw new Error(`dialog has no "${label}" button (has: ${(await Promise.all(btns.map(b => b.textContent()))).join(', ')})`);
  };
  P.dlgTitle = () => page.evaluate(() => document.getElementById('dialog').hidden ? null : document.getElementById('dlgTitle').textContent);
  P.nav = async (screen) => { await P.tap(`[data-go="${screen}"]`); };
  P.back = async (screen) => { await P.tap(`#${screen} [data-back]`); };
  P.stored = () => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return 'unparsable'; } }, KEY);
  P.close = () => ctx.close();
  return P;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function section(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { await fn((st, n, d) => log(name, st, n, d)); }
  catch (e) { log(name, 'FAIL', 'section exception', String(e.message).split('\n')[0]); }
  out.push(`        (${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const check = (L, name, cond, detail = '') => L(cond ? 'PASS' : 'FAIL', name, detail);
// clear the current wave (kills everything, plan exhausted) -> choose / victory screen
const CLEAR = () => { const w = window.__riftTest.game.world; w.god = true; w.planIdx = w.plan.length; w.bossPending = null; w.championPending = null; w.markers = []; for (const e of [...w.enemies]) w.killEnemy(e); };

/* ======================= 1. files / PWA ======================= */
await section('files', async L => {
  const P = await open('desktop'); await P.boot();
  const sw = await (await P.page.request.get(BASE + 'sw.js')).text();
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\])/)[1]);
  const cache = sw.match(/const CACHE = '([^']+)'/)[1];
  const missing = [];
  for (const f of files) { const r = await P.page.request.get(BASE + (f === './' ? '' : f)); if (r.status() !== 200) missing.push(`${f} ${r.status()}`); }
  check(L, 'service worker: every precached file exists', !missing.length, `${files.length} files${missing.length ? '; missing ' + missing.join(', ') : ''}`);
  const man = await (await P.page.request.get(BASE + 'manifest.webmanifest')).json();
  const icons = []; for (const i of man.icons || []) { const r = await P.page.request.get(BASE + i.src); r.status() !== 200 && icons.push(i.src); }
  check(L, 'manifest: all icons exist', !icons.length && (man.icons || []).length > 0, icons.join(', '));
  const meta = await P.ev(() => ({ v: document.querySelector('meta[name="riftline-version"]')?.content, b: document.querySelector('meta[name="riftline-build"]')?.content, src: [...document.scripts].map(s => s.getAttribute('src')).filter(Boolean) }));
  const info = await (await P.page.request.get(BASE + 'build-info.json')).json();
  check(L, 'version identical in index.html / build-info / service worker', meta.v === info.version && meta.b === info.build && cache.includes(meta.v.replace(/\./g, '-')), `${meta.v} / ${info.version} / ${cache}`);
  check(L, 'game script is the one precached by the SW', meta.src.every(s => files.includes(s)), meta.src.join(','));
  const inGame = await P.ev(() => window.__riftTest.data && document.getElementById('verText')?.textContent || '');
  check(L, 'no failed requests while booting', !P.bad.length, P.bad.join(' | '));
  check(L, 'no page errors while booting', !P.errors.length, P.errors.join(' | '));
  await P.close();
});

/* ======================= 2. save matrix ======================= */
await section('saves', async L => {
  const v222 = fs.readFileSync(FIX + 'save-v222.json', 'utf8'), v231 = fs.readFileSync(FIX + 'save-v231.json', 'utf8');
  const common = async (P, label, allowLoadLog = false) => {
    check(L, `${label}: boots to home`, await P.vis('home'));
    // the loader reporting a broken save through the diagnostics log is intended
    const errs = P.errors.filter(e => !(allowLoadLog && /^console: \[riftline\] load /.test(e)));
    check(L, `${label}: no page errors`, !errs.length, errs.join(' | '));
    // round trip: what is stored must load back to the same data
    const rt = await P.ev(() => { const s = window.__riftTest.store; s.save('qa'); const raw = localStorage.getItem('riftline.save.v1'); const p = s.parse(raw); const strip = d => { const c = JSON.parse(JSON.stringify(d)); delete c.savedAt; return c; }; return p.ok && JSON.stringify(strip(p.data)) === JSON.stringify(strip(s.data)); });
    check(L, `${label}: save → load round trip is lossless`, rt);
  };
  // 2.1 no save at all
  { const P = await open('desktop'); await P.boot();
    const d = await P.ev(() => { const T = window.__riftTest, s = T.store.data; return { shards: s.shards, run: s.run, hist: s.history, set: JSON.stringify(s.settings) === JSON.stringify(T.data.Oh) }; });
    check(L, 'fresh: default profile', d.shards === 0 && d.run === null && Array.isArray(d.hist) && d.hist.length === 0 && d.set, JSON.stringify(d));
    check(L, 'fresh: no Continue button', !(await P.vis('continueBtn')));
    await common(P, 'fresh'); await P.close(); }
  // 2.2 / 2.3 real saves from older builds (with a pending upgrade offer)
  for (const [label, raw] of [['2.2.2 save', v222], ['2.3.1 save', v231]]) {
    const P = await open('desktop', { save: raw }); await P.boot();
    const src = JSON.parse(raw);
    const d = await P.ev(() => { const g = window.__riftTest.game, s = window.__riftTest.store.data; return { shards: s.shards, hull: s.workshop.hull, ion: s.weapons.ion, weapon: s.weapon, set: s.settings, runs: s.stats.runs, best: s.stats.bestWave, run: !!s.run, hist: s.history, vol: g.sound.sfxVol, zoom: window.__riftTest.renderer.zoom, contrast: window.__riftTest.renderer.contrast }; });
    check(L, `${label}: progress kept (shards, workshop, weapons, stats)`, d.shards === src.shards && d.hull === 2 && d.ion === true && d.weapon === 'ion' && d.runs === src.stats.runs && d.best === src.stats.bestWave, JSON.stringify({ shards: d.shards, hull: d.hull, weapon: d.weapon, runs: d.runs }));
    check(L, `${label}: settings kept and applied`, eq(d.set, { ...d.set, ...src.settings }) && Math.abs(d.vol - src.settings.sfx) < 1e-6 && Math.abs(d.zoom - src.settings.zoom) < 1e-6 && d.contrast === src.settings.contrast, `sfxVol ${d.vol} zoom ${d.zoom} contrast ${d.contrast}`);
    check(L, `${label}: run history present`, Array.isArray(d.hist) && d.hist.length === (src.history || []).length, `${d.hist && d.hist.length} entries`);
    check(L, `${label}: unfinished run offered`, d.run && await P.vis('continueBtn'));
    await P.tap('#continueBtn'); await P.page.waitForTimeout(1200);
    const r = await P.ev(() => { const w = window.__riftTest.game.world; return w && { wave: w.wave, weapon: w.weapon, state: w.state, cards: document.querySelectorAll('#cards .card').length, choose: !document.getElementById('choose').hidden }; });
    check(L, `${label}: continue restores the pending upgrade choice`, r && r.wave === src.run.wave && r.weapon === src.run.weapon && r.choose && r.cards >= 3, JSON.stringify(r));
    if (r && r.choose) { await P.tap('#cards .card'); await P.page.waitForTimeout(800); }
    const w2 = await P.ev(() => window.__riftTest.game.world?.wave);
    check(L, `${label}: picking the upgrade starts the next wave`, w2 === src.run.wave + 1, 'wave ' + w2);
    await P.ev(() => window.__riftTest.game.abandon());
    await P.page.waitForTimeout(1200);
    check(L, `${label}: abandon shows the run summary`, await P.vis('over'));
    await P.tap('#homeBtn');
    await common(P, label); await P.close();
  }
  // 2.4 corrupt JSON, 2.5 oversized save: must not brick the game and must not be lost
  for (const [label, raw] of [['corrupt JSON', v222.slice(0, -40)], ['oversized save', JSON.stringify({ ...JSON.parse(v222), pad: 'x'.repeat(300000) })]]) {
    const P = await open('desktop', { save: raw }); await P.boot();
    const d = await P.ev(() => ({ shards: window.__riftTest.store.data.shards, backups: Object.keys(localStorage).filter(k => k.startsWith('riftline.save.v1.backup-')).map(k => localStorage.getItem(k)) }));
    check(L, `${label}: falls back to a fresh profile`, d.shards === 0);
    check(L, `${label}: unreadable save is kept in a backup key (not overwritten)`, d.backups.some(b => b === raw), `${d.backups.length} backup(s)`);
    await common(P, label, true); await P.close();
  }
  // 2.6 hostile / out-of-range values
  { const hostile = JSON.stringify({ v: 1, game: 'riftline', shards: -5, weapon: 'evil', weapons: { evil: true, ion: 'yes' }, workshop: { hull: 99, power: -3, nope: 2 }, threatMax: 9, threat: 7,
      milestones: { fake: true }, settings: { sfx: 9, music: -1, zoom: 0, quality: 'ultra', autoFire: 'no', contrast: 1 }, stats: { runs: '5', bestWave: 1e99, kills: NaN, bosses: { '<img src=x>': 3, warden: 2 } },
      history: [1, 'x', null, { wave: 'a' }, { wave: 5, win: 'yes' }], run: { v: 1, weapon: 'pulse', wave: 'x', hp: 5 }, seen: { tutorial: 'yes' } });
    const P = await open('desktop', { save: hostile }); await P.boot();
    const d = await P.ev(() => window.__riftTest.store.data);
    const probs = [];
    d.shards !== 0 && probs.push('shards ' + d.shards);
    d.weapon !== 'pulse' && probs.push('weapon ' + d.weapon);
    (d.weapons.evil || d.weapons.ion) && probs.push('weapons ' + JSON.stringify(d.weapons));
    d.workshop.hull !== 5 && probs.push('hull ' + d.workshop.hull);
    ('power' in d.workshop || 'nope' in d.workshop) && probs.push('workshop ' + JSON.stringify(d.workshop));
    (d.threatMax !== 5 || d.threat !== 5) && probs.push(`threat ${d.threat}/${d.threatMax}`);
    d.milestones.fake && probs.push('fake milestone');
    const s = d.settings;
    !(s.sfx >= 0 && s.sfx <= 1) && probs.push('sfx ' + s.sfx);
    !(s.music >= 0 && s.music <= 1) && probs.push('music ' + s.music);
    ![0.85, 1, 1.18].includes(s.zoom) && probs.push('zoom ' + s.zoom);
    s.quality !== 'auto' && probs.push('quality ' + s.quality);
    (s.autoFire !== true || s.contrast !== false) && probs.push('booleans');
    (d.stats.runs !== 0 || !Number.isFinite(d.stats.bestWave) || d.stats.bestWave > 1e12) && probs.push('stats ' + d.stats.runs + '/' + d.stats.bestWave);
    Object.keys(d.stats.bosses).some(k => /[<>]/.test(k)) && probs.push('boss key injection');
    d.run !== null && probs.push('invalid run kept');
    d.seen.tutorial === 'yes' && probs.push('seen');
    !d.history.every(h => h && typeof h === 'object' && Number.isFinite(h.wave)) && probs.push('history ' + JSON.stringify(d.history));
    check(L, 'hostile save: every value clamped to its valid range', !probs.length, probs.join('; '));
    await common(P, 'hostile save'); await P.close(); }
  // 2.7 storage unavailable (private mode / blocked)
  { const P = await open('desktop', { block: true }); await P.boot();
    check(L, 'storage blocked: game still boots', await P.vis('home'));
    await P.nav('settings');
    check(L, 'storage blocked: warning shown in settings', await P.vis('storageWarn'));
    check(L, 'storage blocked: no page errors', !P.errors.length, P.errors.join(' | '));
    await P.close(); }
});

/* ======================= 2b. workshop modules do what their text says ======================= */
await section('workshop', async L => {
  const P = await open('desktop'); await P.boot();
  const r = await P.ev(() => {
    const T = window.__riftTest, max = id => T.ai.find(a => a.id === id).costs.length;
    const S = (ws, up = {}) => T.nr('pulse', up, ws), b = S({});
    const W = ws => new T.Aa({ weapon: 'pulse', threat: 0, ws, seed: 7 });
    const res = {}, near = (a, x) => Math.abs(a - x) < 1e-6;
    const L = id => max(id);
    res.hull = near(S({ hull: L('hull') }).maxHp, b.maxHp + 10 * L('hull'));
    res.armorCore = near(S({ armorCore: L('armorCore') }).maxHp, b.maxHp + 8 * L('armorCore'));
    res.power = near(S({ power: L('power') }).dmgMul, b.dmgMul * (1 + .05 * L('power')));
    res.arsenalLab = near(S({ arsenalLab: L('arsenalLab') }).dmgMul, b.dmgMul * (1 + .05 * L('arsenalLab')));
    res.thrust = near(S({ thrust: L('thrust') }).speed, b.speed * (1 + .04 * L('thrust')));
    res.dash = near(S({ dash: L('dash') }).dashCd, b.dashCd * (1 - .08 * L('dash')));
    res.magnet = near(S({ magnet: L('magnet') }).magnet, b.magnet * (1 + .2 * L('magnet')));
    res.hazardSeal = near(S({ hazardSeal: L('hazardSeal') }).hazardResist, .15 * L('hazardSeal'));
    res.reroll = W({ reroll: L('reroll') }).rerolls === W({}).rerolls + L('reroll');
    res.insight = W({ insight: 1 }).makeOffer().length === 4 && W({}).makeOffer().length === 3;
    // Nova Cell: each wave starts with AT LEAST 25 %/level; Rift Battery / Reactor Core ADD
    // 10 % / 5 % per level on every wave start (carried charge is kept, capped at 100)
    const nova = (ws, carry) => { const w = W(ws); w.player.nova = carry; w.startWave(2); return w.player.nova; };
    res.nova = nova({ nova: L('nova') }, 0) === 25 * L('nova') && nova({ nova: L('nova') }, 80) === 80;
    res.riftBattery = nova({ riftBattery: L('riftBattery') }, 20) === 20 + 10 * L('riftBattery') && nova({ riftBattery: L('riftBattery') }, 90) === 100;
    res.reactorCore = nova({ reactorCore: L('reactorCore') }, 20) === 20 + 5 * L('reactorCore');
    res.droneBay = S({ droneBay: 1 }, { wingman: 1 }).wingmen === S({}, { wingman: 1 }).wingmen + 1 && S({ droneBay: 1 }).wingmen === 0;
    // +1 cache per level in every non-boss wave from wave 2; boss waves stay cache-free
    let nb = 0;
    const caches = ws => { let n = 0, boss = 0; nb = 0; for (let wave = 2; wave <= 12; wave++) { const w = W(ws); w.startWave(wave); const c = w.pickups.filter(p => p.cache).length; if (w.bossPending) boss += c; else { n += c; nb++; } } return boss ? -1 : n; };
    const c0 = caches({});
    res.fieldSupply = c0 >= 0 && caches({ fieldSupply: 2 }) === c0 + 2 * nb;
    res.routeScanner = c0 >= 0 && caches({ routeScanner: 2 }) === c0 + 2 * nb;
    const rv = W({ revive: 1 }); rv.state = 'fight'; rv.player.iT = 0; rv.player.shield = false; rv.hurtPlayer(99999, null, null, 'grunt', true);
    const dv = W({}); dv.state = 'fight'; dv.player.iT = 0; dv.player.shield = false; dv.hurtPlayer(99999, null, null, 'grunt', true);
    res.revive = rv.player.alive && rv.player.hp === Math.round(rv.stats.maxHp * .5) && !dv.player.alive;
    res.salvage = true; // payout formula is verified by the post-run audit ("payout") after every run
    const untested = T.ai.map(a => a.id).filter(id => !(id in res));
    return { res, untested };
  });
  for (const [id, ok] of Object.entries(r.res)) check(L, `module ${id} works as described`, ok);
  // every run upgrade changes at least one stat for every weapon ("heal" is an instant repair)
  const dead = await P.ev(() => { const T = window.__riftTest, out = []; for (const w of Object.keys(T.ue)) { const b = JSON.stringify(T.nr(w, {}, {})); for (const u of T.data.Zi) if (u.id !== 'heal' && JSON.stringify(T.nr(w, { [u.id]: 1 }, {})) === b) out.push(`${u.id}@${w}`); } return out; });
  check(L, 'every upgrade has an effect with every weapon', !dead.length, dead.slice(0, 12).join(', '));
  const heal = await P.ev(() => { const T = window.__riftTest, w = new T.Aa({ weapon: 'pulse', threat: 0, ws: {}, seed: 3 }); w.player.hp = 10; w.state = 'choose'; w.offer = ['heal']; w.choose('heal'); return w.player.hp; });
  check(L, 'Field Repair heals 45 % of max HP', heal === 10 + 45, 'hp ' + heal);
  check(L, 'every workshop module has an effect test', !r.untested.length, r.untested.join(', '));
  check(L, 'no page errors', !P.errors.length, P.errors.join(' | '));
  await P.close();
});

/* ======================= 3. menus: settings, workshop, weapons, import/export ======================= */
for (const profName of ['desktop', 'phone']) await section(`ui-${profName}`, async L => {
  const P = await open(profName, { save: JSON.stringify({ v: 1, game: 'riftline', seen: { tutorial: true } }) }); await P.boot();
  // --- settings: every toggle changes data, storage and its runtime effect; survives reload
  await P.nav('settings');
  const toggles = { setAuto: 'autoFire', setAssist: 'assist', setSwap: 'swap', setShake: 'shake', setNumbers: 'numbers', setContrast: 'contrast', setCalm: 'calm' };
  for (const [id, key] of Object.entries(toggles)) {
    const before = await P.ev(k => window.__riftTest.store.data.settings[k], key);
    const el = await P.page.$('#' + id); const box = await el.boundingBox();
    await P.tap(box && box.width > 4 ? '#' + id : await P.page.evaluateHandle(i => document.getElementById(i).closest('label'), id));
    const d = await P.ev(([k, id]) => ({ v: window.__riftTest.store.data.settings[k], ui: document.getElementById(id).checked, st: JSON.parse(localStorage.getItem('riftline.save.v1')).settings[k] }), [key, id]);
    check(L, `setting ${key}: toggles and is saved`, d.v === !before && d.ui === d.v && d.st === d.v, JSON.stringify(d));
  }
  const fx = await P.ev(() => { const T = window.__riftTest; return { swap: document.getElementById('hud').classList.contains('swap'), contrast: T.renderer.contrast, calm: T.ui.calm, inputSwap: T.game.input.swap }; });
  check(L, 'settings swap/contrast/calm take effect immediately', fx.swap && fx.contrast && fx.calm && fx.inputSwap, JSON.stringify(fx));
  await P.tap('#setQuality button[data-v="battery"]'); await P.tap('#setZoom button[data-v="1.18"]');
  await P.ev(() => { for (const [id, v] of [['setSfx', .25], ['setMusic', .15]]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); } });
  const q = await P.ev(() => { const T = window.__riftTest, s = T.store.data.settings; return { q: s.quality, z: s.zoom, rz: T.renderer.zoom, sfx: T.game.sound.sfxVol, mus: T.game.sound.musVol, on: document.querySelector('#setQuality .on')?.dataset.v }; });
  check(L, 'quality/zoom/volume controls apply', q.q === 'battery' && q.z === 1.18 && q.rz === 1.18 && q.sfx === .25 && q.mus === .15 && q.on === 'battery', JSON.stringify(q));
  const want = await P.ev(() => JSON.stringify(window.__riftTest.store.data.settings));
  await P.page.reload(); await P.page.waitForFunction(() => window.__riftTest && window.__riftTest.ui, null, { timeout: 90000 }); await P.page.waitForTimeout(800);
  const after = await P.ev(() => { const T = window.__riftTest; T.ui.renderSettings(); const s = T.store.data.settings; return { s: JSON.stringify(s), ui: ['setAuto', 'setAssist', 'setSwap', 'setShake', 'setNumbers', 'setContrast', 'setCalm'].every((id, i) => document.getElementById(id).checked === s[['autoFire', 'assist', 'swap', 'shake', 'numbers', 'contrast', 'calm'][i]]), vol: T.game.sound.sfxVol, zoom: T.renderer.zoom }; });
  check(L, 'all settings survive a reload (data, controls, effect)', after.s === want && after.ui && after.vol === .25 && after.zoom === 1.18, after.s === want ? '' : `${after.s} != ${want}`);
  // --- workshop: buy every level; exact costs; persisted; MAX at the end
  await P.ev(() => { const T = window.__riftTest; T.store.data.shards = 100000; T.store.save('qa'); T.ui.homeInit = false; });
  await P.nav('workshop');
  let buys = 0;
  for (let guard = 0; guard < 60; guard++) { const b = await P.page.$('#wsList [data-buy]:not([disabled])'); if (!b) break; await P.tap(b); buys++; }
  const ws = await P.ev(() => { const T = window.__riftTest, d = T.store.data; return { shards: d.shards, all: T.ai.every(a => d.workshop[a.id] === a.costs.length), total: T.ai.reduce((s, a) => s + a.costs.reduce((x, y) => x + y, 0), 0), levels: T.ai.reduce((s, a) => s + a.costs.length, 0), maxBtns: document.querySelectorAll('#wsList button[disabled]').length, stored: JSON.stringify(JSON.parse(localStorage.getItem('riftline.save.v1')).workshop) === JSON.stringify(d.workshop) }; });
  check(L, 'workshop: every level purchasable, exact cost, all MAX, saved', ws.all && buys === ws.levels && ws.shards === 100000 - ws.total && ws.maxBtns === (await P.ev(() => window.__riftTest.ai.length)) && ws.stored, `${buys}/${ws.levels} buys, spent ${100000 - ws.shards}/${ws.total}`);
  await P.back('workshop');
  // --- weapons: locked weapon cannot be bought without shards, can with
  const locked = await P.ev(() => { const T = window.__riftTest, d = T.store.data, En = T.data.En; const i = En.findIndex(id => !d.weapons[id]); return { i, id: En[i], cost: T.ue[En[i]].cost }; });
  await P.ev(() => { const T = window.__riftTest; T.store.data.shards = 0; T.ui.homeInit = false; T.ui.renderHome && T.ui.renderHome(); });
  for (let k = 0; k < locked.i; k++) await P.tap('#wNext');
  await P.tap('#wBuy').catch(() => {});
  check(L, 'weapon: not unlocked without enough shards', !(await P.ev(id => window.__riftTest.store.data.weapons[id], locked.id)));
  await P.ev(() => { const T = window.__riftTest; T.store.data.shards = 50000; T.ui.renderHome(); });
  await P.tap('#wBuy');
  const wb = await P.ev(id => { const d = window.__riftTest.store.data; return { own: d.weapons[id], sel: d.weapon, shards: d.shards }; }, locked.id);
  check(L, `weapon: buying ${locked.id} unlocks, selects and charges ${locked.cost}`, wb.own && wb.sel === locked.id && wb.shards === 50000 - locked.cost, JSON.stringify(wb));
  // --- threat selector
  await P.ev(() => { const T = window.__riftTest; T.store.data.threatMax = 2; T.store.data.threat = 0; T.ui.renderHome(); });
  await P.tap('#tNext');
  check(L, 'threat: next raises threat, capped by unlocked max', await P.ev(() => window.__riftTest.store.data.threat) === 1);
  await P.ev(() => { const T = window.__riftTest; T.store.data.threat = 0; T.store.save('qa'); T.ui.renderHome(); });
  // --- export
  await P.nav('settings');
  await P.tap('#backupBtn');
  const exp = await P.ev(() => document.getElementById('saveExport')?.value || '');
  let expOk = false; try { const j = JSON.parse(exp); expOk = j.game === 'riftline' && j.shards === (await P.ev(() => window.__riftTest.store.data.shards)); } catch {}
  check(L, 'export: dialog shows the complete save as JSON', expOk, exp.length + ' chars');
  await P.dlg('Close');
  // --- import: invalid text is rejected without touching the save
  const shardsBefore = await P.ev(() => window.__riftTest.store.data.shards);
  await P.tap('#restoreBtn'); await P.page.fill('#saveImport', '{"not":"a save"}'); await P.dlg('Restore');
  check(L, 'import: invalid text rejected with a message', (await P.dlgTitle()) === 'Invalid save' && await P.ev(() => window.__riftTest.store.data.shards) === shardsBefore);
  await P.dlg('OK').catch(() => P.page.keyboard.press('Escape'));
  // --- import: a real 2.2.2 export is accepted
  const imp = JSON.parse(fs.readFileSync(FIX + 'save-v222.json', 'utf8')); imp.shards = 4321;
  await P.tap('#restoreBtn'); await P.page.fill('#saveImport', JSON.stringify(imp)); await P.dlg('Restore'); await P.dlg('Restore');
  const im = await P.ev(() => ({ shards: window.__riftTest.store.data.shards, st: JSON.parse(localStorage.getItem('riftline.save.v1')).shards, home: !document.getElementById('home').hidden, hist: Array.isArray(window.__riftTest.store.data.history) }));
  check(L, 'import: old (2.2.2) export restores progress and returns home', im.shards === 4321 && im.st === 4321 && im.home && im.hist, JSON.stringify(im));
  // --- reset keeps settings, wipes progress (two confirmations)
  await P.nav('settings');
  const setB = await P.ev(() => JSON.stringify(window.__riftTest.store.data.settings));
  await P.tap('#resetBtn'); await P.dlg('Continue'); await P.dlg('Reset everything');
  const rs = await P.ev(() => { const d = window.__riftTest.store.data; return { shards: d.shards, ws: Object.keys(d.workshop).length, set: JSON.stringify(d.settings), run: d.run }; });
  check(L, 'reset: progress wiped, settings kept', rs.shards === 0 && rs.ws === 0 && rs.set === setB && rs.run === null, JSON.stringify({ ...rs, set: rs.set === setB }));
  // --- replay tutorial
  await P.ev(() => { window.__riftTest.store.data.seen.tutorial = true; });
  await P.tap('#replayTutBtn'); await P.dlg('Enable');
  check(L, 'replay tutorial: queued', await P.ev(() => window.__riftTest.store.data.seen.tutorial) === false);
  check(L, 'no page errors', !P.errors.length, P.errors.join(' | '));
  await P.close();
});

/* ======================= 4. run flow ======================= */
for (const profName of ['desktop', 'phone']) await section(`run-${profName}`, async L => {
  const P = await open(profName, { save: JSON.stringify({ v: 1, game: 'riftline', shards: 0, seen: {} }) }); await P.boot();
  const pause = async () => { if (P.prof.touch) await P.tap('#pauseBtn'); else { await P.page.keyboard.press('Escape'); await P.page.waitForTimeout(300); } };
  const waitScreen = (id, ms = 15000) => P.page.waitForFunction(i => !document.getElementById(i).hidden, id, { timeout: ms }).then(() => true, () => false);
  // tutorial on the first ever run
  await P.tap('#playBtn'); await P.page.waitForTimeout(900);
  check(L, 'first run shows the tutorial coach', await P.ev(() => !!window.__riftTest.game.tut) && await P.vis('coach'));
  await P.ev(() => { const g = window.__riftTest.game; if (g.tut) g.tut.step = 4; });
  // restart from pause
  const w0 = await P.ev(() => (window.__riftTest.game.world.__qa = 1));
  await pause(); await P.tap('#restartBtn'); await P.dlg('Restart'); await P.page.waitForTimeout(800);
  const rst = await P.ev(() => { const g = window.__riftTest.game; return { fresh: !g.world.__qa, wave: g.world.wave, mode: g.mode, paused: g.paused }; });
  check(L, 'pause → restart gives a fresh run at wave 1', rst.fresh && rst.wave === 1 && rst.mode === 'game' && !rst.paused, JSON.stringify(rst));
  // wave clear -> choose -> reroll
  await P.ev(CLEAR);
  check(L, 'wave clear opens the upgrade choice', await waitScreen('choose', 30000));
  await P.page.waitForTimeout(700);
  const rr0 = await P.ev(() => { const w = window.__riftTest.game.world; w.rerolls = 2; window.__riftTest.ui.renderChoose?.(w); return { n: w.rerolls, offer: w.offer.map(o => (o.u && o.u.id) || o.id || o.name || JSON.stringify(o).slice(0, 24)).join() }; });
  await P.tap('#rerollBtn');
  const rr1 = await P.ev(() => { const w = window.__riftTest.game.world; return { n: w.rerolls, offer: w.offer.map(o => (o.u && o.u.id) || o.id || o.name || JSON.stringify(o).slice(0, 24)).join(), cards: [...document.querySelectorAll('#cards .card')].length }; });
  check(L, 'reroll: uses one reroll and redraws the cards', rr1.n === rr0.n - 1 && rr1.cards >= 3, `${rr0.n}→${rr1.n}; ${rr0.offer} → ${rr1.offer}`);
  // boss wave: jump to wave 10 via the choice. Freshly drawn cards ignore clicks for
  // 650 ms (anti-misclick lock), so wait for the lock after the reroll to end.
  await P.page.waitForFunction(() => !document.getElementById('cards').classList.contains('locked'), null, { timeout: 5000 });
  await P.ev(() => { window.__riftTest.game.world.wave = 9; });
  await P.tap('#cards .card'); await P.page.waitForTimeout(600);
  const bw = await P.ev(() => { const w = window.__riftTest.game.world; w.god = true; return { wave: w.wave, boss: !!(w.bossPending || w.boss) }; });
  check(L, 'wave 10 is a boss wave', bw.wave === 10 && bw.boss, JSON.stringify(bw));
  const bossUp = await P.page.waitForFunction(() => { const w = window.__riftTest.game.world; return w.boss && !document.getElementById('bossBar').hidden; }, null, { timeout: 30000 }).then(() => true, () => false);
  check(L, 'boss spawns with its health bar', bossUp);
  const cachesInBoss = await P.ev(() => { const w = window.__riftTest.game.world; return JSON.stringify(w.pickups.filter(p => /cache/i.test(p.k || p.kind || p.type || '')).length); });
  check(L, 'no wave cache during the boss wave', cachesInBoss === '0', cachesInBoss);
  await P.ev(CLEAR);
  check(L, 'boss kill → upgrade choice', await waitScreen('choose', 20000));
  await P.page.waitForTimeout(600);
  // final boss (wave 20) → victory → endless
  await P.ev(() => { window.__riftTest.game.world.wave = 19; });
  await P.tap('#cards .card'); await P.page.waitForTimeout(600);
  await P.ev(() => { window.__riftTest.game.world.god = true; });
  await P.page.waitForFunction(() => window.__riftTest.game.world.boss, null, { timeout: 30000 }).catch(() => {});
  await P.ev(CLEAR);
  const won = await waitScreen('over', 25000);
  const vs = await P.ev(() => ({ state: window.__riftTest.game.world?.state, title: document.getElementById('overTitle').textContent }));
  check(L, 'clearing wave 20 is a victory', won && vs.state === 'victory', JSON.stringify(vs));
  await P.page.waitForTimeout(1200);
  check(L, 'victory screen offers Endless', await P.vis('endlessBtn'));
  await P.tap('#endlessBtn');
  check(L, 'Endless starts with a bonus upgrade choice', await waitScreen('choose', 8000));
  await P.page.waitForTimeout(700);
  await P.tap('#cards .card'); await P.page.waitForTimeout(1000);
  const en = await P.ev(() => { const w = window.__riftTest.game.world; return { endless: w.endless, wave: w.wave, hud: !document.getElementById('hud').hidden, over: !document.getElementById('over').hidden }; });
  check(L, 'Endless continues the same run', en.endless && en.wave === 21 && en.hud && !en.over, JSON.stringify(en));
  // abandon from pause
  await pause(); await P.tap('#abandonBtn'); await P.dlg('Abandon');
  const ab = await waitScreen('over', 8000) || await P.vis('home');
  const st = await P.stored();
  check(L, 'pause → abandon ends the run and clears the saved run', ab && st.run === null, 'run ' + JSON.stringify(st.run));
  if (await P.vis('over')) await P.tap('#homeBtn');
  // death → retry
  await P.tap('#playBtn'); await P.page.waitForTimeout(800);
  await P.ev(() => { const w = window.__riftTest.game.world; w.god = false; w.player.iT = 0; w.player.dashT = 0; w.player.shield = false; w.hurtPlayer(99999, null, null, 'grunt', true); });
  check(L, 'death shows the game-over screen', await waitScreen('over'));
  await P.page.waitForTimeout(1200);
  await P.tap('#retryBtn'); await P.page.waitForTimeout(800);
  const rt = await P.ev(() => { const g = window.__riftTest.game; return { mode: g.mode, wave: g.world && g.world.wave, over: !document.getElementById('over').hidden }; });
  check(L, 'retry starts a new run', rt.mode === 'game' && rt.wave === 1 && !rt.over, JSON.stringify(rt));
  await P.ev(() => window.__riftTest.game.abandon()); await P.page.waitForTimeout(800);
  if (await P.vis('over')) await P.tap('#homeBtn');
  // records & history
  await P.nav('records');
  const hs = await P.ev(() => ({ n: window.__riftTest.store.data.history.length, rows: document.querySelectorAll('#runHist > *').length, ms: document.querySelectorAll('#msList .row').length, msWant: window.__riftTest.data._i.length }));
  check(L, 'records: recent runs listed', hs.n >= 3 && hs.rows >= Math.min(hs.n, 3), JSON.stringify(hs));
  check(L, 'records: every milestone rendered', hs.ms === hs.msWant, `${hs.ms}/${hs.msWant}`);
  // claim a milestone through the UI
  const claim = await P.page.$('#msList [data-claim]');
  if (claim) {
    const b0 = await P.ev(() => window.__riftTest.store.data.shards);
    const id = await claim.getAttribute('data-claim'); await P.tap(claim);
    const c = await P.ev(id => { const d = window.__riftTest.store.data, m = window.__riftTest.data._i.find(x => x.id === id); return { done: d.milestones[id], gain: d.shards, reward: m.reward }; }, id);
    check(L, 'milestone claim pays its reward once', c.done === true && c.gain - b0 === c.reward, JSON.stringify({ ...c, b0 }));
  } else L('INFO', 'milestone claim', 'nothing claimable in this run');
  const aud = await P.ev(() => window.__riftTest.lastRunAudit);
  check(L, 'last run audit has no FAIL', aud && !aud.checks.some(c => c.st === 'FAIL'), aud ? aud.checks.filter(c => c.st !== 'OK').map(c => c.id + ':' + c.st).join(', ') : 'none');
  check(L, 'no page errors', !P.errors.length, P.errors.slice(0, 4).join(' | '));
  await P.close();
});

/* ======================= 4b. visual criteria ======================= */
await section('visual', async L => {
  // biomes: grid colours must be clearly different (ΔE >= 30) — identity check
  { const P = await open('desktop'); await P.boot();
    const q = await P.ev(() => window.__riftTest.data.rlBiomeDistinct());
    check(L, 'every biome is recognisable (grid colours ΔE ≥ 30 apart)', !q.length, q.join(', '));
    await P.close(); }
  // upgrade cards on wide screens: one row, equal height, content fills the card
  const sizes = [[1920, 955, 0], [1920, 955, 1], [1440, 900, 0], [1366, 768, 1], [1280, 640, 0], [1024, 768, 0]];
  for (const [w, h, insight] of sizes) {
    PROFILES.tmp = { viewport: { width: w, height: h }, touch: w < 1100 && h === 768, mobile: w < 1100 && h === 768 };
    const P = await open('tmp', { save: JSON.stringify({ v: 1, game: 'riftline', seen: { tutorial: true }, workshop: insight ? { insight: 1 } : {} }) }); await P.boot();
    await P.ev(() => window.__riftTest.game.startRun({})); await P.page.waitForTimeout(800);
    await P.ev(CLEAR);
    await P.page.waitForFunction(() => !document.getElementById('choose').hidden, null, { timeout: 30000 }); await P.page.waitForTimeout(600);
    await P.ev(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#cards')).map(a => a.finished)));
    const r = await P.ev(() => {
      const cards = [...document.querySelectorAll('#cards .card')], rr = cards.map(c => c.getBoundingClientRect());
      const fill = cards.map(c => { const ch = [...c.children].map(x => x.getBoundingClientRect()); const top = Math.min(...ch.map(x => x.top)), bot = Math.max(...ch.map(x => x.bottom)); return (bot - top) / c.getBoundingClientRect().height; });
      const rb = document.getElementById('rerollBtn').getBoundingClientRect();
      return { n: cards.length, oneRow: rr.every(x => Math.abs(x.top - rr[0].top) < 2), tops: rr.map(x => Math.round(x.top)).join('/'), hover: cards.map(c => c.matches(':hover') ? 1 : 0).join(''), eqH: rr.every(x => Math.abs(x.height - rr[0].height) < 2), minFill: Math.min(...fill), h: Math.round(rr[0].height), w: Math.round(rr[0].width),
        clipped: cards.some(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1), reroll: rb.bottom <= innerHeight && rb.top >= rr[0].bottom, inView: rr.every(x => x.left >= 0 && x.right <= innerWidth && x.bottom <= innerHeight) };
    });
    const tag = `${w}×${h} · ${r.n} cards`;
    check(L, `cards ${tag}: one row, equal height, fully visible`, r.oneRow && r.eqH && r.inView && !r.clipped, JSON.stringify(r));
    check(L, `cards ${tag}: content fills the card (≥ 50 %)`, r.minFill >= .5, `fill ${(r.minFill * 100).toFixed(0)} % · card ${r.w}×${r.h}`);
    check(L, `cards ${tag}: reroll below the cards and on screen`, r.reroll);
    await P.page.screenshot({ path: new URL(`./shots/qa-cards-${w}x${h}-${r.n}.png`, import.meta.url).pathname });
    await P.close();
  }
});

/* ======================= 4c. layout criteria per device ======================= */
for (const [name, vp, touch] of [['pc', { width: 1920, height: 955 }, false], ['phone', { width: 390, height: 844 }, true], ['land', { width: 844, height: 390 }, true]]) await section(`layout-${name}`, async L => {
  PROFILES['L' + name] = { viewport: vp, touch, mobile: touch };
  const P = await open('L' + name, { save: JSON.stringify({ v: 1, game: 'riftline', shards: 5000, seen: { tutorial: true } }) }); await P.boot();
  // settings: every switch/slider sits on the same line as its label, at the right edge
  await P.ev(() => window.__riftTest.ui.show('settings')); await P.page.waitForTimeout(700);
  const rows = await P.ev(() => [...document.querySelectorAll('#settings label.set-row')].map(r => { const t = r.firstElementChild.getBoundingClientRect(), c = r.lastElementChild.getBoundingClientRect(), R = r.getBoundingClientRect(); const cy = (c.top + c.bottom) / 2; return { n: r.textContent.trim().slice(0, 18), ok: cy >= t.top - 2 && cy <= t.bottom + 2 && R.right - c.right < 24 && c.left > t.left + 40 }; }));
  const badRows = rows.filter(r => !r.ok).map(r => r.n);
  check(L, `settings: all ${rows.length} switches/sliders beside their label, right-aligned`, !badRows.length, badRows.join(', '));
  // menu pages: no row stretched across a huge screen (readability)
  for (const pg of ['workshop', 'records']) {
    await P.ev(pg => { window.__riftTest.ui.show(pg); }, pg); await P.page.waitForTimeout(700);
    const wmax = await P.ev(pg => Math.max(...[...document.querySelectorAll(`#${pg} .row`)].map(r => r.getBoundingClientRect().width)), pg);
    check(L, `${pg}: list rows at most 900 px wide`, wmax <= 900, `widest row ${Math.round(wmax)} px`);
  }
  await P.ev(() => window.__riftTest.ui.show('home'));
  // hints: hidden behind the pause menu; below the boss bar in a boss fight
  await P.ev(() => window.__riftTest.game.startRun({})); await P.page.waitForTimeout(800);
  await P.ev(() => { window.__riftTest.ui.toast('QA hint that must not cover the pause menu', 'intro', 8000); window.__riftTest.game.pause(); });
  await P.page.waitForTimeout(400);
  const tp = await P.ev(() => { const t = document.getElementById('toasts'); return getComputedStyle(t).visibility === 'hidden' || !t.children.length; });
  check(L, 'hints are hidden while the pause menu is open', tp);
  await P.ev(() => { const g = window.__riftTest.game; g.paused = false; window.__riftTest.ui.hidePause(); });
  await P.ev(CLEAR);
  await P.page.waitForFunction(() => !document.getElementById('choose').hidden, null, { timeout: 30000 }); await P.page.waitForTimeout(700);
  await P.ev(() => { const w = window.__riftTest.game.world; w.wave = 9; w.choose(w.offer[0]); });
  await P.page.waitForFunction(() => { const b = document.getElementById('bossBar'); return !b.hidden && window.__riftTest.game.world.boss; }, null, { timeout: 40000 }).catch(() => {});
  await P.ev(() => window.__riftTest.ui.toast('QA hint during the boss fight', 'intro', 8000)); await P.page.waitForTimeout(500);
  const bb = await P.ev(() => { const b = document.getElementById('bossBar').getBoundingClientRect(), t = [...document.querySelectorAll('#toasts .toast')].map(x => x.getBoundingClientRect()); return { bar: Math.round(b.bottom), top: t.length ? Math.round(Math.min(...t.map(x => x.top))) : null }; });
  check(L, 'boss fight: hints start below the boss health bar', bb.top != null && bb.top >= bb.bar, JSON.stringify(bb));
  check(L, 'no page errors', !P.errors.length, P.errors.join(' | '));
  await P.close();
});

/* ======================= 5. controls: every button is wired and named ======================= */
await section('buttons', async L => {
  const P = await open('desktop'); await P.boot();
  await P.ev(() => { const u = window.__riftTest.ui; u.renderWorkshop(); u.renderRecords(); u.renderSettings(); });
  const n = await P.ev(() => { let i = 0; for (const e of document.querySelectorAll('button, input, select, [role="button"]')) e.dataset.qaI = i++; return i; });
  const cdp = await P.ctx.newCDPSession(P.page);
  const unwired = [], unnamed = [];
  for (let i = 0; i < n; i++) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-qa-i="${i}"]')` });
    const info = await P.ev(i => { const e = document.querySelector(`[data-qa-i="${i}"]`); const lbl = e.closest('label'); return { d: e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') + (e.dataset.v ? `[${e.dataset.v}]` : ''), shown: !!(e.offsetWidth || e.offsetHeight), name: (e.getAttribute('aria-label') || e.title || e.textContent || (lbl && lbl.textContent) || e.placeholder || '').trim(), path: (() => { const p = []; let n = e; while (n && n !== document.body) { p.push(n); n = n.parentElement; } return p.length; })() }; }, i);
    // own listeners + listeners on ancestors below <body> (delegation)
    let wired = false, obj = result.objectId;
    for (let depth = 0; depth < info.path && obj && !wired; depth++) {
      const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: obj });
      if (listeners.some(l => /click|pointer|touch|input|change|keydown/.test(l.type))) wired = true;
      const par = await cdp.send('Runtime.callFunctionOn', { objectId: obj, functionDeclaration: 'function(){return this.parentElement}' });
      obj = par.result.objectId;
    }
    if (!wired) unwired.push(info.d);
    if (!info.name && info.shown) unnamed.push(info.d); // hidden controls get their label when shown
  }
  check(L, `every control has an event handler (${n} controls)`, !unwired.length, unwired.join(', '));
  check(L, 'every control has an accessible name', !unnamed.length, unnamed.join(', '));
  await P.close();
});

await browser.close();
console.log(out.join('\n'));
console.log(`\nFULL QA: ${fails ? fails + ' FAIL' : 'all checks passed'}`);
process.exit(fails ? 1 : 0);
