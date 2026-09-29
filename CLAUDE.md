# Riftdeck: working notes

README.md explains the game, the layout and how to add content. This file is the checklist
for changing it.

## Keep the structure

- `src/core/` is pure game logic: no DOM, no timers, no three.js. It runs in Node for the tests,
  the sim and the bot. The engine only appends events to `g.events`; it never animates or waits.
- `src/data/` holds content as plain data plus small hook functions. New cards, enemies, relics,
  cells and events go here, not into the engine.
- `src/render/` is the three.js diorama. The UI talks to it through the `Diorama` methods
  (`attack`, `hit`, `flash`, ...). `FlatStage` must offer the same API, so add a stub there too.
- `src/ui/` turns engine events into DOM and animation. Small reusable effects go in `juice.js`.
- Presentation changes should not touch `core/` or `data/`. If they have to, say why.
- Anything that moves respects `prefers-reduced-motion` (`prefersReducedMotion()` in `dom.js`,
  `scene.reduced`, and the reduced-motion block at the end of `style.css`).

## Before calling a change done

Check the code's state on every change, not only when asked:

1. `npm run lint`: real mistakes only (undefined names, unused code, unreachable branches). Must be clean.
2. `npm test`: engine unit tests and 40 full bot runs.
3. `npm run e2e`: real pointer input, rare scenarios and the PWA/offline checks in Chromium.
4. `npm run smoke`: headless playthrough; look at the screenshots in `shots/` for layout breakage.
5. For UI flow changes (screens, modals, combat lifecycle), also run `npm run monkey`: random
   full runs through the real UI that fail on any page error or stall.
6. For motion, check it visually. Headless screenshots can show the end state of a running
   animation, so record a video with Playwright (`recordVideo`) and look at extracted frames.
7. Re-read the diff for bugs: async work that outlives its screen (`this.destroyed`, closed
   modals, removed elements), state that re-renders (`route()` rebuilds screens and the HUD),
   and phone layout (`--phone` in the gallery, touch input in e2e).
8. `npm run sim -- 500` after any balance-relevant change (cards, enemies, relics).

CI (`.github/workflows/ci.yml`) runs lint, tests, e2e and smoke on every pull request;
`pages.yml` runs lint and tests again before publishing `main`.

## Style

Plain ES modules, no framework. Comments explain why, in full sentences, at the density of the
surrounding code. Commit messages say what changed for the player first, then the code.
