// Build: turns the readable sources into the deployable game in dist/.
//   src/game.js       -> dist/game-v<version>-final.js  (minified with esbuild)
//   src/index.html, src/sw.js, src/build-info.json, src/_headers -> dist/ (placeholders filled in)
//   public/*          -> dist/ (icons, fonts, manifest; copied as they are)
// Version and build id live only in package.json ("version", "riftline.build"). The sources use
// the placeholders __RL_VERSION__, __RL_BUILD__, __RL_VERSION_DASHED__ and __RL_GAME_FILE__.
// Usage: node build.js [--watch]   (watch also serves dist/ on http://localhost:8124)

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './tools/serve.js';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const r = (...p) => path.join(ROOT, ...p);
const DIST = r('dist');
const watch = process.argv.includes('--watch');

function meta() {
  const pkg = JSON.parse(fs.readFileSync(r('package.json'), 'utf8'));
  const version = pkg.version, build = pkg.riftline && pkg.riftline.build;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json version "${version}" is not x.y.z`);
  if (!/^r\d{3}a\d{4}[a-z]-r\d+$/.test(build || '')) throw new Error(`package.json riftline.build "${build}" does not look like r233a0926g-r1`);
  return { version, build, dashed: version.replace(/\./g, '-'), gameFile: `game-v${version}-final.js` };
}

// Replaces every placeholder; fails if one is left (typo) so a broken contract never ships.
function fill(text, m, name) {
  const out = text
    .replaceAll('__RL_VERSION_DASHED__', m.dashed)
    .replaceAll('__RL_VERSION__', m.version)
    .replaceAll('__RL_BUILD__', m.build)
    .replaceAll('__RL_GAME_FILE__', m.gameFile);
  const left = out.match(/__RL_[A-Z_]+__/);
  if (left) throw new Error(`${name}: unknown placeholder ${left[0]}`);
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

async function build() {
  const t0 = Date.now();
  const m = meta();
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(r('public'), DIST);

  // The game is one IIFE (game code + three.js r186). The version constants are plain
  // identifiers in the source; esbuild swaps them for string literals.
  const src = fs.readFileSync(r('src/game.js'), 'utf8');
  const js = await esbuild.transform(src, {
    loader: 'js',
    minify: !watch,
    target: 'es2020',
    legalComments: 'none',
    charset: 'utf8',
    define: { __RL_VERSION__: JSON.stringify(m.version), __RL_BUILD__: JSON.stringify(m.build) },
    sourcefile: 'game.js',
  });
  fs.writeFileSync(path.join(DIST, m.gameFile), js.code);

  for (const f of ['index.html', 'sw.js', 'build-info.json', '_headers']) {
    fs.writeFileSync(path.join(DIST, f), fill(fs.readFileSync(r('src', f), 'utf8'), m, f));
  }
  JSON.parse(fs.readFileSync(path.join(DIST, 'build-info.json'), 'utf8')); // must stay valid JSON

  // Offline contract: every file the service worker precaches must exist in dist/.
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\]);/)[1]);
  const missing = files.filter((f) => f !== './' && !fs.existsSync(path.join(DIST, f)));
  if (missing.length) throw new Error(`sw.js precaches missing files: ${missing.join(', ')}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
  const icons = manifest.icons.map((i) => i.src).filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (icons.length) throw new Error(`manifest icons missing: ${icons.join(', ')}`);

  const kb = (f) => `${(fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0)} KB`;
  console.log(`built Riftline ${m.version} (${m.build}) in ${Date.now() - t0}ms  ${m.gameFile} ${kb(m.gameFile)}, index.html ${kb('index.html')}`);
}

await build();

if (watch) {
  let timer = null;
  fs.watch(r('src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  const { url } = await serve(DIST, 8124);
  console.log(`serving ${url} (rebuilds on change)`);
}
