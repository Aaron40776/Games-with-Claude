// Input test: plays cards with real pointer input (mouse drag on desktop,
// taps on a touch phone) and checks that energy/HP change as expected.
//   node tools/interact.js

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

async function setup(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  await page.goto(pathToFileURL(path.join(ROOT, 'dist/index.html')).href);
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

/**
 * Bounding box once the element has stopped moving. Hand cards glide via CSS
 * transitions, and software rendering runs at ~10 fps, so comparing two
 * positions is not enough: wait until no transition is running anymore.
 */
async function stableBox(locator) {
  for (let i = 0, quiet = 0; i < 50 && quiet < 3; i++) {
    const running = await locator.evaluate((el) => el.getAnimations().length);
    quiet = running ? 0 : quiet + 1;
    await locator.page().waitForTimeout(80);
  }
  return locator.boundingBox();
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
  const box = await stableBox(card);
  const target = await page.evaluate(() => { const cv = window.__riftdeck.combat; const r = cv.hitRects.get(cv.g.enemies[0].ref); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 150, { steps: 6 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.waitForTimeout(150);
  const aiming = await page.evaluate(() => window.__riftdeck.combat.aimTarget);
  check(!!aiming, 'desktop: dragging an attack shows a target under the pointer');
  // A transform transition on the held card restarts on every move and makes it trail the pointer.
  const lagging = await page.evaluate(() => document.querySelector('.card.dragging')?.getAnimations().some((a) => a.transitionProperty === 'transform'));
  check(lagging === false, 'desktop: the held card has no transform transition, so it does not lag behind the pointer');
  // Software rendering can drop to ~2 fps here, so give the held card time to settle.
  let held = null;
  for (let i = 0; i < 40; i++) {
    held = await page.locator('.card.dragging').boundingBox();
    if (held && target.x > held.x && target.x < held.x + held.width) break;
    await page.waitForTimeout(100);
  }
  check(!!held && target.x > held.x && target.x < held.x + held.width && target.y > held.y - 10 && target.y < held.y + held.height,
    `desktop: the card itself follows the pointer (card ${held && [Math.round(held.x + held.width / 2), Math.round(held.y), Math.round(held.y + held.height)]}, pointer ${Math.round(target.x)},${Math.round(target.y)})`);
  await page.mouse.up();
  await idle(page);
  const after = await state(page);
  check(after.enemyHp < before.enemyHp, `desktop: drag attack damaged the enemy (${before.enemyHp} -> ${after.enemyHp})`);
  check(after.energy < before.energy, 'desktop: energy spent');

  // Skill: drag straight up
  const skillIdx = after.hand.findIndex((id) => id === 'deflect');
  if (skillIdx >= 0) {
    const b2 = await stableBox(page.locator('.card.in-hand').nth(skillIdx));
    await page.mouse.move(b2.x + b2.width / 2, b2.y + 30);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, 250, { steps: 10 });
    await page.mouse.up();
    await idle(page);
    const s3 = await state(page);
    check(s3.shield > 0, `desktop: drag-up skill gave Shield (${s3.shield})`);
  }
  // Keys are ignored while a card is held; an unaffordable card says so instead of arming.
  {
    await page.evaluate(() => { const cv = window.__riftdeck.combat; cv.g.energy = 0; cv.refresh(); });
    const bx = await stableBox(page.locator('.card.in-hand').first());
    await page.mouse.move(bx.x + bx.width / 2, bx.y + 30);
    await page.mouse.down();
    await page.mouse.move(bx.x + bx.width / 2, 250, { steps: 8 });
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => ({ turn: window.__riftdeck.combat.g.turn, label: document.querySelector('.play-zone span')?.textContent, armed: document.querySelector('.play-zone')?.classList.contains('armed') }));
    check(mid.turn === 1, 'desktop: pressing E while holding a card does nothing');
    check(mid.label === 'Not enough Energy' && !mid.armed, `desktop: an unaffordable held card shows "${mid.label}" and does not arm`);
    await page.mouse.up();
    await idle(page);
    await page.evaluate(() => { const cv = window.__riftdeck.combat; cv.g.energy = 3; cv.refresh(); });
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
// Real touch input through the DevTools protocol (Playwright's touchscreen can only tap).
async function swipe(page, cdp, from, to, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
{
  const { ctx, page } = await setup({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const cdp = await ctx.newCDPSession(page);
  const before = await state(page);
  const idx = before.hand.findIndex((id) => id === 'pulse_shot');
  const box = await stableBox(page.locator('.card.in-hand').nth(idx));
  // Tap selects, a second tap puts the card back without playing it.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 20);
  await page.waitForTimeout(250);
  check(!!(await page.evaluate(() => window.__riftdeck.combat.selected)), 'phone: tap selects a card');
  const lifted = await stableBox(page.locator('.card.in-hand.selected'));
  await page.touchscreen.tap(lifted.x + lifted.width / 2, lifted.y + lifted.height / 2);
  await page.waitForTimeout(400);
  const afterTaps = await state(page);
  const sel = await page.evaluate(() => window.__riftdeck.combat.selected);
  check(afterTaps.enemyHp === before.enemyHp && afterTaps.energy === before.energy && !sel, 'phone: double tap does NOT play the card, it puts it back');
  // Swipe up into the field plays the attack on the only enemy.
  const b2 = await stableBox(page.locator('.card.in-hand').nth(idx));
  await swipe(page, cdp, { x: b2.x + b2.width / 2, y: b2.y + 25 }, { x: 195, y: 300 });
  await idle(page);
  const afterSwipe = await state(page);
  check(afterSwipe.enemyHp < before.enemyHp, `phone: swipe into the field plays the attack (${before.enemyHp} -> ${afterSwipe.enemyHp})`);
  // An enlarged card can be dragged in any direction, straight onto the enemy.
  const idxE = afterSwipe.hand.findIndex((id) => id === 'pulse_shot' || id === 'arc_lance');
  if (idxE >= 0) {
    const bE = await stableBox(page.locator('.card.in-hand').nth(idxE));
    await page.touchscreen.tap(bE.x + bE.width / 2, bE.y + 20);
    const big = await stableBox(page.locator('.card.in-hand.selected'));
    const enemy = await page.evaluate(() => { const cv = window.__riftdeck.combat; const r = cv.hitRects.get(cv.g.enemies[0].ref); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
    const hpE = (await state(page)).enemyHp;
    // start sideways first: must not turn into browsing the hand
    await swipe(page, cdp, { x: big.x + big.width / 2, y: big.y + big.height * 0.4 }, { x: big.x + big.width / 2 + 60, y: big.y + big.height * 0.4 - 10 }, 3);
    await page.waitForTimeout(200);
    const s0 = await state(page);
    check(s0.energy === afterSwipe.energy, 'phone: releasing an enlarged card low in the hand does not play it');
    const big2 = await stableBox(page.locator('.card.in-hand').nth(idxE));
    await page.touchscreen.tap(big2.x + big2.width / 2, big2.y + 20);
    const big3 = await stableBox(page.locator('.card.in-hand.selected'));
    await swipe(page, cdp, { x: big3.x + big3.width / 2, y: big3.y + big3.height * 0.4 }, enemy, 10);
    await idle(page);
    const sE = await state(page);
    check(sE.enemyHp < hpE || sE.energy < afterSwipe.energy, 'phone: dragging an enlarged card onto the enemy plays it');
  }
  // A short swipe that stays below the play line is cancelled.
  const beforeShort = await state(page);
  const idx3 = beforeShort.hand.findIndex((id) => id === 'deflect' || id === 'pulse_shot');
  if (idx3 >= 0) {
    const b3 = await stableBox(page.locator('.card.in-hand').nth(idx3));
    await swipe(page, cdp, { x: b3.x + b3.width / 2, y: b3.y + 25 }, { x: b3.x + b3.width / 2, y: b3.y - 50 });
    await page.waitForTimeout(400);
    const s4 = await state(page);
    check(s4.energy === beforeShort.energy, 'phone: a short swipe below the play line is cancelled');
  }
  // A steep upward swipe picks the card up right away, even when it is touched low in the
  // fan, and the card keeps the touched spot under the finger instead of sliding into place.
  {
    const s0 = await state(page);
    const i = s0.hand.findIndex((id) => id === 'deflect' || id === 'pulse_shot');
    if (i >= 0) {
      const b = await stableBox(page.locator('.card.in-hand').nth(i));
      const x = b.x + b.width / 2;
      const y0 = b.y + b.height * 0.75;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let k = 1; k <= 4; k++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - 8 * k }] });
        await page.waitForTimeout(16);
      }
      const held = await page.evaluate(() => {
        const cv = window.__riftdeck.combat;
        const d = cv.drag;
        if (!d) return null;
        const m = new DOMMatrix(cv.cardEls.get(cv.dragUid).style.transform);
        return { x: d.cw / 2 + m.e + m.a * d.gx + m.c * d.gy, y: d.ch + m.f + m.b * d.gx + m.d * d.gy };
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      check(!!held, 'phone: a short steep swipe up from low on a card picks it up at once');
      check(!!held && Math.hypot(held.x - x, held.y - (y0 - 32)) < 2,
        `phone: the picked-up card keeps the touched spot under the finger (${held && [Math.round(held.x), Math.round(held.y)]} vs ${Math.round(x)},${Math.round(y0 - 32)})`);
      check((await state(page)).energy === s0.energy, 'phone: releasing it inside the hand does not play it');
    }
  }
  // Browsing the fan sideways with a finger that drifts upward stays in the hand and selects.
  {
    const s0 = await state(page);
    const first = await stableBox(page.locator('.card.in-hand').first());
    const last = await stableBox(page.locator('.card.in-hand').last());
    await swipe(page, cdp, { x: first.x + 20, y: first.y + 40 }, { x: last.x + last.width - 20, y: first.y + 15 }, 10);
    await page.waitForTimeout(300);
    const s1 = await state(page);
    const sel = await page.evaluate(() => window.__riftdeck.combat.selected);
    check(s1.energy === s0.energy && !!sel, 'phone: scrubbing with upward drift browses and selects instead of picking a card up');
    await page.evaluate(() => window.__riftdeck.combat.deselect());
  }
  // Optional tap mode: a second tap with a little wobble still plays the card.
  {
    await page.evaluate(() => { window.__riftdeck.settings.cardPlay = 'tap'; });
    const s0 = await state(page);
    const i = s0.hand.findIndex((id) => id === 'deflect' || id === 'pulse_shot');
    if (i >= 0) {
      const bT = await stableBox(page.locator('.card.in-hand').nth(i));
      await page.touchscreen.tap(bT.x + bT.width / 2, bT.y + 20);
      const big = await stableBox(page.locator('.card.in-hand.selected'));
      const cx = big.x + big.width / 2;
      const cy = big.y + big.height / 2;
      await swipe(page, cdp, { x: cx, y: cy }, { x: cx + 9, y: cy - 8 }, 2);
      await idle(page);
      const s1 = await state(page);
      check(s1.energy < s0.energy, 'phone (tap mode): a wobbly second tap still plays the card');
    }
    await page.evaluate(() => { window.__riftdeck.settings.cardPlay = 'swipe'; });
  }
  // Map: tapping a room shows info, only Enter travels.
  await page.evaluate(() => { const app = window.__riftdeck; app.endCombatView(); app.run.room = null; app.run.pos = null; app.commit(); });
  await page.waitForTimeout(500);
  const n = await page.locator('.node.reach').first().boundingBox();
  await page.touchscreen.tap(n.x + n.width / 2, n.y + n.height / 2);
  await page.waitForTimeout(300);
  const infoTitle = await page.locator('.map-info-title').textContent().catch(() => null);
  const stillMap = await page.evaluate(() => !window.__riftdeck.run.room);
  check(!!infoTitle && stillMap, `phone: tapping a room shows "${infoTitle}" without entering it`);
  await page.locator('.map-enter').tap();
  await page.waitForTimeout(400);
  check(await page.evaluate(() => !!window.__riftdeck.run.room), 'phone: Enter travels to the room');
  await ctx.close();
}
await browser.close();
if (failed) process.exit(1);
