// App shell test: the published page installs as an app (manifest, icons,
// service worker), starts offline, picks up new versions, and browser gestures
// that make it feel like a web page are off.
//   node build.js && node tools/pwa.js

import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from './serve.js';

const ROOT = path.dirname(new URL(import.meta.url).pathname) + '/..';
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

// Serve a copy of dist/, so the test can publish a "new version" without touching the build.
const SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'riftdeck-pwa-'));
fs.cpSync(path.join(ROOT, 'dist'), SITE, { recursive: true });
const { server, url } = await serve(SITE);
const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
const booted = (page) => page.waitForFunction(() => !!document.querySelector('.title-screen') && !!window.__riftdeck, null, { timeout: 20000 });

// ---------------------------------------------------------------- desktop
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  await page.goto(url);
  await booted(page);

  // Manifest and icons
  const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href);
  const res = await page.request.get(manifestHref);
  const manifest = await res.json();
  check(res.headers()['content-type']?.includes('manifest+json'), 'manifest is served as application/manifest+json');
  check(manifest.name === 'Riftdeck' && manifest.display === 'standalone' && manifest.start_url === './', 'manifest: name, standalone display, relative start URL');
  for (const ic of manifest.icons) {
    const r = await page.request.get(new URL(ic.src, manifestHref).href);
    const [w, hgt] = pngSize(await r.body());
    check(r.ok() && `${w}x${hgt}` === ic.sizes, `icon ${ic.src} (${ic.purpose}) is a ${ic.sizes} PNG`);
  }
  check(manifest.icons.some((i) => i.purpose === 'maskable'), 'manifest has a maskable icon (Android launchers)');
  const apple = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.href);
  const appleRes = apple && await page.request.get(apple);
  check(!!appleRes && appleRes.ok() && pngSize(await appleRes.body()).join('x') === '180x180', 'iOS home screen icon is a 180x180 PNG');
  const iosMeta = await page.evaluate(() => ['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title']
    .every((n) => document.querySelector(`meta[name="${n}"]`)));
  check(iosMeta, 'iOS full-screen meta tags are present');

  // Service worker: controls the page after a reload, and the game starts offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await booted(page);
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await ctx.setOffline(true);
  await page.reload();
  await booted(page);
  check(true, 'offline: the game starts from the cached copy');
  await ctx.setOffline(false);

  // A new version on the server is loaded when online (network first) and then kept for offline.
  const index = path.join(SITE, 'index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('</body>', '<i id="v2"></i></body>'));
  await page.reload();
  await booted(page);
  check(await page.evaluate(() => !!document.getElementById('v2')), 'online: a new version is loaded right away');
  await page.waitForTimeout(300); // let the copy be stored
  await ctx.setOffline(true);
  await page.reload();
  await booted(page);
  check(await page.evaluate(() => !!document.getElementById('v2')), 'offline: the newest version seen is started');
  await ctx.setOffline(false);

  // Browser behaviour
  const guards = await page.evaluate(() => {
    const fire = (target, ev) => { target.dispatchEvent(ev); return ev.defaultPrevented; };
    const app = document.getElementById('app');
    const input = document.getElementById('seed-input');
    return {
      menu: fire(app, new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      menuInput: fire(input, new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      wheelZoom: fire(app, new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 })),
      wheel: fire(app, new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 })),
      keyZoom: fire(document.body, new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: '+', ctrlKey: true })),
      reloadInTab: fire(document.body, new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'F5' })),
    };
  });
  check(guards.menu && !guards.menuInput, 'right-click menu is off, except in the seed text field');
  check(guards.wheelZoom && !guards.wheel, 'Ctrl + wheel does not zoom the page; plain wheel is untouched');
  check(guards.keyZoom, 'Ctrl + plus does not zoom the page');
  check(!guards.reloadInTab, 'in a browser tab F5 still reloads (only the installed app blocks it)');
  await ctx.close();
}

// ----------------------------------------------------------------- iPhone
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  const cdp = await ctx.newCDPSession(page);
  await page.goto(url);
  await booted(page);

  const link = page.getByRole('button', { name: 'Install app' });
  check(await link.isVisible(), 'iPhone: the title screen offers "Install app"');
  await link.click();
  const help = await page.locator('.install-help').textContent().catch(() => '');
  check(/Add to Home Screen/.test(help), 'iPhone: it explains Share → Add to Home Screen');
  await page.getByRole('button', { name: 'Got it' }).click();

  // Pinch-zoom is off: no zoom gestures on the app (headless Chromium can't pinch-zoom at all,
  // so this checks the settings instead), and iOS Safari's own gesture events are cancelled.
  const zoom = await page.evaluate(() => {
    const ev = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.getElementById('app').dispatchEvent(ev);
    return { touchAction: getComputedStyle(document.getElementById('app')).touchAction, gesture: ev.defaultPrevented };
  });
  check(zoom.touchAction === 'none' && zoom.gesture, `iPhone: pinch-zoom is off (touch-action ${zoom.touchAction}, iOS gesture cancelled: ${zoom.gesture})`);
  // … but scrollable areas still scroll with a finger.
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.waitForTimeout(300);
  // A real finger drag (CDP's synthetic scroll gesture doesn't reach the dialog in headless Chromium).
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 187, y: 500 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 187, y: 500 - i * 25 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => document.querySelector('.modal-backdrop').scrollTop);
  check(scrolled > 50, `iPhone: long dialogs still scroll with a finger (scrollTop ${scrolled})`);
  await ctx.close();
}

// --------------------------------------------------------------- artifact
{
  // The artifact fragment has no manifest: it stays a plain page, no install offer.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, userAgent: IPHONE_UA });
  const page = await ctx.newPage();
  await page.goto(url + 'riftdeck.html');
  await booted(page);
  const state = await page.evaluate(() => ({ manifest: !!document.querySelector('link[rel="manifest"]'), sw: navigator.serviceWorker?.controller }));
  const install = await page.getByRole('button', { name: 'Install app' }).isVisible();
  check(!state.manifest && !install, 'artifact build: no manifest, no install offer');
  await ctx.close();
}

await browser.close();
server.close();
fs.rmSync(SITE, { recursive: true, force: true });
if (failed) { console.log('\nPWA checks FAILED'); process.exit(1); }
console.log('\nall PWA checks passed');
