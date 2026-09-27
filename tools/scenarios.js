// Scenario tests in the browser for rarer flows: mid-combat choices,
// summons, detonations, event fights, act transitions, death, reload, cells.
//   node tools/scenarios.js

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const URL_ = pathToFileURL(path.join(ROOT, 'dist/index.html')).href;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = false;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed = true; };

await page.goto(URL_);
await page.waitForTimeout(600);

async function fight(room, setup = '') {
  await page.evaluate(([room, setup]) => {
    const app = window.__riftdeck;
    app.settings.speed = 'fast';
    app.scene.speed = 1.8;
    if (!app.run || app.run.over) app.startRun('SCEN1');
    app.endCombatView();
    app.run.room = room;
    new Function('run', 'app', setup)(app.run, app);
    app.commit();
  }, [room, setup]);
  await page.waitForFunction(() => { const cv = window.__riftdeck.combat; return cv && !cv.busy && cv.g.phase === 'player'; }, null, { timeout: 30000 });
}

/** Autoplay the current fight through the view: play attacks, end turns. */
async function autoplay(maxTurns = 30, playCards = true) {
  return page.evaluate(async ([maxTurns, playCards]) => {
    const app = window.__riftdeck;
    const cv = app.combat;
    const g = cv.g;
    const idle = async () => { while (cv.busy && app.combat === cv) await new Promise((r) => setTimeout(r, 30)); };
    for (let t = 0; t < maxTurns; t++) {
      for (let i = 0; i < 12 && playCards; i++) {
        await idle();
        if (app.combat !== cv || g.outcome) return g.outcome;
        const c = g.hand.find((x) => g.canPlay(x) && x.def.type !== 'skill') || g.hand.find((x) => g.canPlay(x));
        if (!c) break;
        const target = g.aliveEnemies()[0];
        await cv.play(c.uid, target ? target.ref : null);
        while (g.pending) await new Promise((r) => setTimeout(r, 30));
      }
      await idle();
      if (app.combat !== cv || g.outcome) return g.outcome;
      await cv.endTurn();
    }
    await idle();
    return g.outcome;
  }, [maxTurns, playCards]);
}
const strong = "run.hp = run.maxHp = 999; run.deck = ['singularity','singularity','slug_round','slug_round','arc_chain','arc_chain','scatter_blast','scatter_blast','twin_burst','twin_burst'].map((id, i) => ({ uid: 'x' + i, id, up: true }));";

// A: Rewind opens a choice modal and returns the picked card
await fight({ type: 'combat', stage: 'fight', encounter: ['leech'] });
await page.evaluate(() => {
  const cv = window.__riftdeck.combat;
  const g = cv.g;
  g.hand.push(g.makeCard('rewind'));
  g.discard.push(g.makeCard('slug_round'), g.makeCard('phase_step'));
  cv.refresh();
  cv.play(g.hand[g.hand.length - 1].uid, null);
});
await page.waitForSelector('.modal .card', { timeout: 10000 });
await page.locator('.modal .card').first().click();
await page.getByRole('button', { name: /Confirm/ }).click();
await page.waitForTimeout(600);
const handA = await page.evaluate(() => window.__riftdeck.combat.g.hand.map((c) => c.id));
check(handA.includes('slug_round') || handA.includes('phase_step'), `A: Rewind returned a card to hand (${handA.join(',')})`);

// B: Brood Mother summons minions; they flee when she dies
await fight({ type: 'elite', stage: 'fight', encounter: ['brood'] }, strong);
const minions = await page.evaluate(() => window.__riftdeck.combat.g.aliveEnemies().length);
check(minions === 3, `B: brood starts with 2 broodlings (${minions} alive)`);
const outB = await autoplay();
check(outB === 'win', `B: elite fight won (${outB})`);
await page.waitForSelector('.reward-panel', { timeout: 15000 });
const relicReward = await page.locator('.reward .relic').count();
check(relicReward === 1, 'B: elite reward includes a relic');

// C: Mines detonate after their countdown
await fight({ type: 'combat', stage: 'fight', encounter: ['mine', 'hound', 'mine'] }, 'run.hp = run.maxHp = 999;');
await autoplay(4, false);
const mines = await page.evaluate(() => window.__riftdeck.combat?.g.enemies.filter((e) => e.id === 'mine').map((e) => e.alive));
check(mines && mines.every((a) => !a), `C: mines detonated and are gone (${JSON.stringify(mines)})`);

// D: Event ambush fight -> rewards on the event screen
await fight({ type: 'event', eventId: 'ghost_signal', stage: 'fight', encounter: ['wisp', 'wisp'], fightKind: 'normal', options: null, queue: [], result: 'It was bait.' }, strong);
const outD = await autoplay();
check(outD === 'win', 'D: event fight won');
await page.waitForSelector('.event-panel .rewards', { timeout: 15000 });
check(true, 'D: event screen shows rewards after the fight');
await page.locator('.event-panel .btn').last().click();
const leaveD = page.getByRole('button', { name: /Leave them/ });
if (await leaveD.count()) await leaveD.click();
await page.waitForTimeout(500);

// E: Boss win -> boss relic -> act 2
await fight({ type: 'boss', stage: 'fight', encounter: ['gatekeeper'] }, strong);
const outE = await autoplay(40);
check(outE === 'win', `E: boss defeated (${outE})`);
await page.waitForSelector('.reward.boss', { timeout: 15000 });
await page.locator('.reward.boss').click();
await page.locator('.boss-relic').first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Descend deeper/ }).click();
const leaveE = page.getByRole('button', { name: /Leave them/ });
if (await leaveE.count()) await leaveE.click();
await page.waitForTimeout(800);
const act = await page.evaluate(() => ({ act: window.__riftdeck.run.act, relics: window.__riftdeck.run.relics.length, screen: document.querySelector('.screen-layer').dataset.screen }));
check(act.act === 2 && act.screen === 'map', `E: moved to act 2 map (${JSON.stringify(act)})`);

// H: Cell from the HUD with enemy targeting
await fight({ type: 'combat', stage: 'fight', encounter: ['shardling', 'shardling'] }, "run.cells = ['blast_cell', null, null];");
const hpBefore = await page.evaluate(() => window.__riftdeck.combat.g.enemies[1].hp);
await page.locator('.hud-cells .cell').first().click();
await page.getByRole('button', { name: 'Use' }).click();
await page.waitForTimeout(200);
const t = await page.evaluate(() => { const cv = window.__riftdeck.combat; const r = cv.hitRects.get(cv.g.enemies[1].ref); return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; });
await page.mouse.click(t.x, t.y);
await page.waitForTimeout(800);
const cellAfter = await page.evaluate(() => ({ hp: window.__riftdeck.combat.g.enemies[1].hp, alive: window.__riftdeck.combat.g.enemies[1].alive, cells: window.__riftdeck.run.cells }));
check((cellAfter.hp < hpBefore || !cellAfter.alive) && cellAfter.cells[0] === null, `H: Blast Cell hit the chosen enemy (${hpBefore} -> ${cellAfter.hp})`);

// G: reload continues the run from the last room boundary
const seedBefore = await page.evaluate(() => { const app = window.__riftdeck; app.endCombatView(); app.run.room = null; app.commit(); return app.run.seed; });
await page.reload();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /Continue/ }).click();
await page.waitForTimeout(600);
const resumed = await page.evaluate(() => ({ seed: window.__riftdeck.run?.seed, screen: document.querySelector('.screen-layer').dataset.screen }));
check(resumed.seed === seedBefore && resumed.screen === 'map', `G: reload resumed the run (${JSON.stringify(resumed)})`);

// I: quitting to the title during the enemy phase must not touch a new run
await fight({ type: 'combat', stage: 'fight', encounter: ['leech', 'leech'] }, 'run.hp = 2;');
await page.evaluate(() => {
  const app = window.__riftdeck;
  app.combat.endTurn(); // enemies will kill the runner during this phase
  app.save();
  app.toTitle();
  app.startRun('FRESH1');
});
await page.waitForTimeout(6000);
const fresh = await page.evaluate(() => ({ seed: window.__riftdeck.run.seed, over: window.__riftdeck.run.over, screen: document.querySelector('.screen-layer').dataset.screen }));
check(fresh.seed === 'FRESH1' && !fresh.over && fresh.screen !== 'end', `I: an abandoned fight can't end a new run (${JSON.stringify(fresh)})`);

// F: dying ends the run and records stats
const runsBefore = await page.evaluate(() => window.__riftdeck.meta.runs);
await fight({ type: 'combat', stage: 'fight', encounter: ['leech'] }, 'run.hp = 1;');
await autoplay(3, false);
await page.waitForSelector('.end-panel', { timeout: 15000 });
const runsAfter = await page.evaluate(() => window.__riftdeck.meta.runs);
check(runsAfter === runsBefore + 1, `F: death shows the end screen and records the run (${runsBefore} -> ${runsAfter})`);

await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); failed = true; }
process.exit(failed ? 1 : 0);
