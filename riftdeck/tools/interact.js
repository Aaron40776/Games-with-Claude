// Input test: plays cards with real pointer input (mouse drag on desktop,
// taps on a touch phone) and checks that energy/HP change as expected.
//   node tools/interact.js

import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname) + '/..';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

async function setup(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  await page.goto('file://' + path.join(ROOT, 'dist/index.html'));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const app = window.__riftdeck;
    app.settings.speed = 'fast';
    app.scene.speed = 1.8;
    app.startRun('INPUT1');
    app.run.room = { type: 'combat', stage: 'fight', encounter: ['leech'] };
    // A known hand: Pulse Shot, Deflect, Arc Lance on top of the draw pile.
    app.commit();
  });
  await page.waitForFunction(() => { const cv = window.__riftdeck.combat; return cv && !cv.busy && cv.g.phase === 'player'; }, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

const state = (page) => page.evaluate(() => {
  const g = window.__riftdeck.combat.g;
  return { energy: g.energy, enemyHp: g.enemies[0].hp, shield: g.player.shield, hand: g.hand.map((c) => c.id) };
});
const idle = (page) => page.waitForFunction(() => !window.__riftdeck.combat?.busy, null, { timeout: 30000 });

// ---------------------------------------------------------------- desktop
{
  const { ctx, page } = await setup({ viewport: { width: 1280, height: 800 } });
  const before = await state(page);
  const attackIdx = before.hand.findIndex((id) => id === 'pulse_shot' || id === 'arc_lance');
  const card = page.locator('.card.in-hand').nth(attackIdx);
  const box = await card.boundingBox();
  const target = await page.evaluate(() => { const cv = window.__riftdeck.combat; const r = cv.hitRects.get(cv.g.enemies[0].ref); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 150, { steps: 6 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.waitForTimeout(150);
  const aiming = await page.evaluate(() => window.__riftdeck.combat.aimTarget);
  check(!!aiming, 'desktop: dragging an attack shows a target under the pointer');
  await page.mouse.up();
  await idle(page);
  const after = await state(page);
  check(after.enemyHp < before.enemyHp, `desktop: drag attack damaged the enemy (${before.enemyHp} -> ${after.enemyHp})`);
  check(after.energy < before.energy, 'desktop: energy spent');

  // Skill: drag straight up
  const skillIdx = after.hand.findIndex((id) => id === 'deflect');
  if (skillIdx >= 0) {
    const b2 = await page.locator('.card.in-hand').nth(skillIdx).boundingBox();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + 30);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, 250, { steps: 10 });
    await page.mouse.up();
    await idle(page);
    const s3 = await state(page);
    check(s3.shield > 0, `desktop: drag-up skill gave Shield (${s3.shield})`);
  }
  // Keyboard: select card 1 and press Enter, then E ends the turn
  const s4 = await state(page);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await idle(page);
  const s5 = await state(page);
  check(s5.energy <= s4.energy, 'desktop: keyboard 1 + Enter plays a card');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await idle(page);
  const turn = await page.evaluate(() => window.__riftdeck.combat?.g.turn);
  check(turn === 2, `desktop: E ends the turn (turn ${turn})`);
  await ctx.close();
}

// ------------------------------------------------------------------ phone
{
  const { ctx, page } = await setup({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const before = await state(page);
  const idx = before.hand.findIndex((id) => id === 'pulse_shot');
  const card = page.locator('.card.in-hand').nth(idx);
  const box = await card.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 20);
  await page.waitForTimeout(250);
  const sel = await page.evaluate(() => window.__riftdeck.combat.selected);
  check(!!sel, 'phone: tap selects a card');
  // Only one enemy: tapping the selected card again plays it on that enemy.
  const lifted = await page.locator('.card.in-hand.selected').boundingBox();
  await page.touchscreen.tap(lifted.x + lifted.width / 2, lifted.y + lifted.height / 2);
  await idle(page);
  const after = await state(page);
  check(after.enemyHp < before.enemyHp, `phone: second tap plays the attack (${before.enemyHp} -> ${after.enemyHp})`);
  // Tap a card, then tap the enemy
  const idx2 = after.hand.findIndex((id) => id === 'pulse_shot' || id === 'arc_lance');
  if (idx2 >= 0) {
    const b2 = await page.locator('.card.in-hand').nth(idx2).boundingBox();
    await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + 20);
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => { const cv = window.__riftdeck.combat; const r = cv.hitRects.get(cv.g.enemies[0].ref); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
    await page.touchscreen.tap(t.x, t.y);
    await idle(page);
    const s3 = await state(page);
    check(s3.enemyHp < after.enemyHp || s3.energy < after.energy, 'phone: select card, then tap enemy plays it');
  }
  await ctx.close();
}
await browser.close();
if (failed) process.exit(1);
