# Riftdeck

A roguelite deckbuilder set in the Riftline universe. You climb three layers of the rift on a
branching map, fight on a floating 3D platform and build your deck from salvaged tech. Your goal
is to break the Heart of the Rift at the bottom.

The game runs in the browser (desktop and phone) as a single HTML file. It is built with
three.js and plain JavaScript modules. There is no framework.

**Play:** <https://aaron40776.github.io/Riftdeck/>. Every push to `main` is tested, built and
published there automatically (`.github/workflows/pages.yml`). Locally: `npm install && npm run build`,
then open `dist/index.html`.

## Playing

- **Your turn:** you get 3 Energy and draw 5 cards. Swipe a card up into the field to play it
  (a dashed line shows where it counts). Attacks go onto an enemy; with only one enemy, anywhere in
  the field works. Tapping a card only enlarges it for reading. The settings have an optional
  "swipe or tap twice" mode.
- **Map:** tap a room to see what it is, then press *Enter*.
- **Intents:** the icon above each enemy shows its next move. Plan your Shield around it.
- **Between fights:** pick 1 of 3 cards, rest (heal or upgrade), shop, open treasure or take a
  chance on events.
- **Keyboard:** `1`–`9` selects a card, `Enter` plays it, arrow keys pick a target, `E` ends the
  turn, `Esc` cancels.

## Content

| | |
|---|---|
| Cards | 52: 3 starter, 18 common, 18 uncommon, 10 rare, 3 status/curse. All have upgrades |
| Enemies | 27 over 3 acts: normal enemies, 8 elites with minions, 3 bosses |
| Relics | 27 (starter, common, uncommon, rare, shop, boss relics with drawbacks) |
| Cells | 11 single-use consumables |
| Events | 11 plus the opening "Rift Gate" |
| Mechanics | Shield, Amp, Plating, Exposed, Jammed, Fragile, Burn, Charge, Spikes, Phased, Fade, Volatile, Hold, Opening, X-cost, mid-card choices |

## Commands

```bash
npm install          # three, esbuild, fonts, playwright (browsers are preinstalled in the cloud env)
npm run build        # -> dist/riftdeck.html (artifact fragment) + dist/index.html (standalone)
npm run dev          # rebuild on change + serve http://localhost:5173
npm test             # engine unit tests + 40 full bot runs (node:test)
npm run sim -- 500   # balance simulation: win rate, deaths per encounter, HP lost per fight
npm run smoke        # headless browser playthrough, screenshots in shots/
npm run e2e          # real pointer input + rare scenarios (summons, act change, death, reload…)
npm run gallery      # screenshots of every screen (add -- --phone for the phone layout)
```

## Project structure

```
src/
  core/            game logic, no DOM (runs in Node for tests and the sim bot)
    rng.js         seeded RNG streams (same seed = same run)
    combat.js      combat engine: piles, energy, damage, statuses, intents, event log
    map.js         map generator (non-crossing paths, room-type rules)
    run.js         run state: rooms, rewards, shop, rest, events, save/load
  data/            all content as plain data + small hook functions
    cards.js  enemies.js  relics.js  cells.js  events.js  statuses.js
  render/          three.js diorama
    scene.js       platform, rift shader, camera fitting, unit layout, effects API
    models.js      procedural low-poly models for the runner and all enemies
    fx.js          particles, projectiles, rings, beams
  ui/              DOM interface
    app.js         routing between screens, HUD, modals, saving
    combat.js      hand, targeting, overlays, turning engine events into animations
    screens.js     title, map, rewards, event, shop, rest, treasure, end
    cardview.js    card frame, procedural card art, rules text with live numbers
    sfx.js         synthesized sound effects and ambient music (WebAudio)
tools/             sim bot, balance sim, browser tests
tests/             node:test suite
build.js           esbuild bundle -> single HTML file with inlined fonts
```

### How the pieces fit

1. **The engine is pure logic.** `Combat` changes state and appends events to `g.events`
   (`attack`, `damage`, `shield`, `status`, `draw`, …). It never waits or animates.
2. **The UI replays events.** `ui/combat.js` drains the event list and plays each event with an
   animation. HP bars show "display" values that follow the events, so multi-hit attacks count
   down step by step. Afterwards they sync to the real state.
3. **Choices use generators.** A card like Rewind is written as `*play(g) { const picked = yield g.choose(...) }`.
   The engine pauses until the UI (or the bot) calls `resolveChoice()`.
4. **Everything random is seeded.** Each system has its own RNG stream, stored in the run. So a
   save/reload continues exactly where it stopped, and a combat replays identically after a reload.
5. **Saves happen at room boundaries** (`localStorage`). The artifact hot-reload hook also keeps
   the run when a new version is published.

## Adding content

**A card** (`src/data/cards.js`):

```js
static_lance: {
  name: 'Static Lance', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', rating: 5,
  vals: { dmg: 7, jam: 1 }, up: { dmg: 10, jam: 2 },
  text: 'Deal {D:dmg} damage. Apply {jam} Jammed.',
  play(g, v, t) { g.attack(t, v.dmg); g.applyStatus(t, 'jammed', v.jam); },
},
```

`{D:x}` shows attack damage including Amp, Jammed and Exposed, and `{S:x}` shows Shield including
Plating. Keywords such as *Jammed* are highlighted and explained in tooltips automatically.

**An enemy** (`src/data/enemies.js`) is a set of declarative moves plus an `ai()` function that
picks the next one. Add it to `ENCOUNTERS` and choose a `model` from `render/models.js`.
Then run `npm test` (every AI runs 12 turns) and `npm run sim` (balance).

**A relic** uses hooks like `onCombatStart`, `onTurnStart`, `onCardPlayed` or flags like `energy: 1`.

## Balance

`npm run sim` lets a simple heuristic bot play hundreds of runs. With 500 runs it currently wins
about 9% and dies mostly at the three bosses. The bot does not plan ahead, so a human player
should do clearly better. Numbers per encounter (HP lost, turns, losses) help find outliers.

## Ideas for next steps

- Second character with its own card pool (e.g. a drone engineer built around Charge)
- Ascension levels (harder modifiers after a win) and unlockable cards
- Daily seed with a shared leaderboard (artifact database capability)
- Card upgrade animations and attack animations tailored to each enemy model
- More events and a fourth act behind the Heart
