// Browser smoke test: plays through the opening of a run in headless
// Chromium (phone + desktop viewports), fails on console errors and saves
// screenshots to ./shots.
//   node tools/smoke.js [--only=phone|desktop] [--fights=2]

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname) + '/..';
const OUT = path.join(ROOT, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const only = arg('only', '');
const fights = Number(arg('fights', '2'));

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: exe });

const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 },
};

const errors = [];
for (const [name, opts] of Object.entries(VIEWPORTS)) {
  if (only && only !== name) continue;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto('file://' + path.join(ROOT, 'dist/index.html'));
  await page.waitForTimeout(1500);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) });
  await shot('01-title');

  await page.evaluate(() => { const app = window.__riftdeck; app.settings.speed = 'fast'; app.scene.speed = 1.8; });
  await page.getByRole('button', { name: /New run/i }).click();
  await page.waitForTimeout(700);
  await shot('02-opening');
  // Opening event: take "Fortify" (first option)
  await page.locator('.option').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(900);
  await shot('03-map');

  for (let f = 0; f < fights; f++) {
    // Travel to the first reachable combat node (or any reachable).
    const node = page.locator('.node.reach.n-combat').first();
    if (await node.count()) await node.click({ force: true });
    else await page.locator('.node.reach').first().click({ force: true });
    await page.waitForTimeout(300);
    if (f === 0) await shot('03b-map-info');
    await page.locator('.map-enter').click();
    await page.waitForTimeout(2600);
    await shot(`04-combat-${f}`);

    // Select a card by tapping it, to capture the inspect state.
    const first = page.locator('.card.in-hand.playable').first();
    if (await first.count()) {
      await first.click({ force: true });
      await page.waitForTimeout(400);
      await shot(`05-selected-${f}`);
    }
    // Play the fight through the view API (like a player would).
    for (let turn = 0; turn < 30; turn++) {
      const state = await page.evaluate(async () => {
        const app = window.__riftdeck;
        const cv = app.combat;
        if (!cv) return 'done';
        const g = cv.g;
        if (g.outcome) return 'over';
        const idle = async () => { while (cv.busy && app.combat === cv) await new Promise((r) => setTimeout(r, 50)); };
        for (let i = 0; i < 12; i++) {
          await idle();
          if (app.combat !== cv || g.outcome) return 'over';
          const c = g.hand.find((x) => g.canPlay(x));
          if (!c) break;
          const t = g.aliveEnemies()[0];
          await cv.play(c.uid, t ? t.ref : null);
        }
        await idle();
        if (app.combat !== cv || g.outcome) return 'over';
        await cv.endTurn();
        return 'turn';
      });
      if (turn === 1 && f === 0) await shot('06-midfight');
      if (state !== 'turn') break;
    }
    await page.waitForTimeout(2500);
    await shot(`07-after-${f}`);
    const onReward = await page.locator('.reward-panel').count();
    if (!onReward) break;
    // Take the card reward
    const cardReward = page.locator('.reward', { hasText: 'Add a card' });
    if (await cardReward.count()) {
      await cardReward.click();
      await page.waitForTimeout(500);
      await shot(`08-cardpick-${f}`);
      await page.locator('.card-pick-row .card').first().click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: /^Take / }).click();
      await page.waitForTimeout(500);
    }
    const shards = page.locator('.reward', { hasText: 'Shards' });
    if (await shards.count()) await shards.click();
    await page.waitForTimeout(300);
    await page.locator('.reward-panel .btn').last().click();
    await page.waitForTimeout(400);
    const leave = page.getByRole('button', { name: /Leave them/i });
    if (await leave.count()) await leave.click();
    await page.waitForTimeout(900);
    await shot(`09-map-${f}`);
  }
  // Deck view
  await page.getByRole('button', { name: 'View deck' }).click();
  await page.waitForTimeout(500);
  await shot('10-deck');
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke ok, screenshots in', OUT);
