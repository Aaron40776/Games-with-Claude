# Riftline

A 3D arena roguelite shooter. You pilot a small combat drone through 20 waves of the rift, each
in a different biome, pick one upgrade after every wave and fight a boss every fifth wave. After
the Rift Core at wave 20 you can keep going in Endless mode. Shards from every run, won or lost,
buy permanent modules in the Workshop.

The game runs in the browser (desktop and phone) and installs as an offline-capable PWA. It is
built with three.js and plain JavaScript. There is no framework.

**Play:** <https://aaron40776.github.io/Games-with-Claude/riftline/> (GitHub Pages, rebuilt on every
push to `main`). Locally: `npm install && npm run dev`, then open <http://localhost:8124/>.

## Controls

| | Keyboard and mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | drag on the left half |
| Aim and fire | hold the left mouse button (auto-fire shoots the nearest enemy otherwise) | drag on the right half |
| Dash | `Space` or `Shift` | `DASH` button or double-tap the left half |
| Nova | `E` (also `Q`, `F`) | `NOVA` button |
| Pause | `Esc` or `P` | pause button |

*Left-handed* in Settings swaps the two touch halves.

## Content

| | |
|---|---|
| Weapons | 21, unlocked with shards (Pulse Blaster to Ember Rail) |
| Enemies | 25 types with their own models, plus biome champions |
| Bosses | 4: The Warden (wave 5), Hive Queen (10), Prism (15), Rift Core (20), then repeating in Endless |
| Biomes | 19, each with its own palette, obstacle shapes and music; all but Neon Yard have a hazard (lava, ice, acid or portals) |
| Upgrades | 84, 25 of them evolutions |
| Workshop | 18 permanent modules |
| Milestones | 48 with shard rewards |
| Threat | Standard and Threat I–V |

## Commands

```bash
npm install          # esbuild + playwright (browsers are preinstalled in the cloud env,
                     # elsewhere: npx playwright install chromium)
npm run build        # -> dist/ (the deployable site)
npm run dev          # build unminified, rebuild on change, serve http://localhost:8124
npm run serve        # serve dist/ on http://localhost:8124
npm test             # build + deep self-test + file/PWA contract + data audit (~1 min, also runs in CI)
npm run qa           # full QA: saves, settings, workshop, runs on PC and phone, layout, buttons (~10 min)
npm run e2e          # end-to-end with real pointer/touch input on 5 device sizes
npm run audit        # world audit (routes, walls, spawns), data audit, bot run to wave 22 + post-run audit
npm run sim -- pulse,ion 31   # weapon simulation to wave 31 (| python3 tools/summarize-sim.py)
npm run screens      # screenshot of every screen on PC, phone and landscape phone -> tests/shots/
```

Single test scripts run with `node tools/qa.js <script> [args]`. It serves `dist/` on a free port and
passes the URL to the script, for example `node tools/qa.js full-qa run-desktop` runs one section
of the full QA. Before a release run
`npm run qa`, `npm run e2e`, `npm run audit` and `npm run screens`, then look at the screenshots.

## Project structure

```
src/
  game.js          the whole game: game code + three.js r186 in one file
  index.html       page shell, all CSS, device detection, layout audit
  sw.js            service worker (offline cache, update handshake)
  build-info.json  version, build id, feature and change list (fetched by the game)
  _headers         cache headers for hosts that support them (Netlify/Cloudflare style)
public/            icons, fonts, web manifest (copied to dist/ unchanged)
tests/             browser test scripts (Playwright) and real old saves for migration tests
tools/             build helpers: static server, test runner, sim summary
docs/              QA reports of every release (German)
build.js           src/ -> dist/
```

### About `src/game.js`

Riftline was released as one minified bundle (game code and three.js, built with esbuild) and then
patched by hand for several releases. The module sources the bundle was built from are not part of
the release. `src/game.js` is that bundle, formatted with Prettier, and `build.js` minifies it again:

- Names from the original build are still minified (`ft` is the game, `Ft` the UI, `ee` the save
  store, `oe` the renderer, `Aa` the simulation world, `ue` the weapons, `Ae` the enemies, `ri` the
  upgrades, `ai` the workshop modules). Most code added in later releases has readable names
  (`rl…`) and comments.
- The content packs 2.0–2.2 and every later fix hook into the original classes by wrapping
  prototype methods (`const base = Aa.prototype.startWave; Aa.prototype.startWave = function …`).
  New fixes should follow that pattern and say which version added them.
- three.js r186 sits in the middle of the file (roughly lines 9 800–34 100). Do not edit it.
- `window.__riftTest` exposes the game, UI, store, renderer and data tables for the tests.

### Versions

The version and build id exist only in `package.json` (`version`, `riftline.build`). The sources use
the placeholders `__RL_VERSION__`, `__RL_BUILD__`, `__RL_VERSION_DASHED__` and `__RL_GAME_FILE__`,
and `build.js` fills them in. That keeps the version contract the game checks at start-up
(HTML meta, script name, JS constants, build-info.json, service-worker cache) consistent. `build.js`
also fails if the service worker would precache a file that does not exist.

For a release: bump `version` and `riftline.build` in `package.json`, add the changes at the top of
`changes` in `src/build-info.json`, and write the QA report in `docs/`.

## Hosting

`dist/` is a static site that works in any sub-path. The service worker only caches files of its own
folder and removes old `riftline-*` caches on update. On GitHub Pages `_headers` has no effect,
which is fine: the service worker fetches `index.html` and `build-info.json` with `no-store`, and
the game file has the version in its name.

Saves live in `localStorage` under `riftline.save.v1` (plus a log and backups under `riftline.*`),
so Riftline and Riftdeck can share the same origin without touching each other's data.

## Known limits and ideas

- Automated tests run only in Chromium. Firefox and Safari are checked by hand.
- Field Supply and Route Scanner have the same effect (+1 supply cache per wave and richer caches);
  Power Core and Arsenal Lab both give +5 % damage per level. One of each pair could get its own role.
- A real module structure (like Riftdeck's `src/core`, `render`, `ui`) with three.js from npm would
  make larger changes much easier. The deep test, world audit and full QA are the safety net for
  such a refactor.
