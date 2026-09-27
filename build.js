// Build: bundles the game into single HTML files.
//   dist/riftdeck.html  artifact fragment (no <html>/<head>/<body>, the host wraps it)
//   dist/index.html     standalone page for local play, tests and GitHub Pages
//   dist/manifest.webmanifest, dist/sw.js, dist/icons/
//                       make the standalone page installable as an app (PWA)
// Usage: node build.js [--watch]   (watch also serves dist/ on http://localhost:5173)

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { serve } from './tools/serve.js';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const r = (...p) => path.join(ROOT, ...p);
const DIST = r('dist');
const watch = process.argv.includes('--watch');

const TITLE = 'Riftdeck';
const DESCRIPTION = 'Riftdeck – a roguelite deckbuilder in the Riftline universe with a 3D diorama battlefield.';

const COLOR = '#06070d';

// Rendered from tools/icons.js into assets/icons/ (committed).
const ICONS = ['icon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

const MANIFEST = {
  name: TITLE,
  short_name: TITLE,
  description: DESCRIPTION,
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: COLOR,
  theme_color: COLOR,
  categories: ['games'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// Installed-app setup for the standalone page only; the artifact fragment stays a plain page.
const APP_HEAD = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  // Full screen on iOS: the game draws under the status bar and keeps clear of it via safe-area insets.
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  `<meta name="apple-mobile-web-app-title" content="${TITLE}">`,
].join('\n');

const FONTS = [
  ['Chakra Petch', 600, 'node_modules/@fontsource/chakra-petch/files/chakra-petch-latin-600-normal.woff2'],
  ['Chakra Petch', 700, 'node_modules/@fontsource/chakra-petch/files/chakra-petch-latin-700-normal.woff2'],
  ['Barlow Semi Condensed', 500, 'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff2'],
  ['Barlow Semi Condensed', 700, 'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2'],
];

function fontCss() {
  return FONTS.map(([family, weight, file]) => {
    const b64 = fs.readFileSync(r(file)).toString('base64');
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join('\n');
}

async function build() {
  const t0 = Date.now();
  fs.mkdirSync(DIST, { recursive: true });
  const js = await esbuild.build({
    entryPoints: [r('src/main.js')],
    bundle: true,
    format: 'iife',
    minify: !watch,
    sourcemap: false,
    write: false,
    target: ['es2020'],
    legalComments: 'none',
    logLevel: 'warning',
  });
  const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = (await esbuild.transform(fs.readFileSync(r('src/ui/style.css'), 'utf8'), { loader: 'css', minify: true })).code;
  const fonts = fontCss();
  const head = `<title>${TITLE}</title>\n<meta name="description" content="${DESCRIPTION}">\n<meta name="theme-color" content="${COLOR}">`;
  const body = '<div id="app"></div>';

  const fragment = `${head}\n<style>${fonts}\n${css}</style>\n${body}\n<script>${code}</script>\n`;
  fs.writeFileSync(path.join(DIST, 'riftdeck.html'), fragment);

  const full = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n${APP_HEAD}\n<style>${fonts}\n${css}</style></head><body>${body}<script>${code}</script></body></html>\n`;
  fs.writeFileSync(path.join(DIST, 'index.html'), full);
  writeAppFiles(full);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`built in ${Date.now() - t0}ms  riftdeck.html ${kb(fragment)}  (js ${kb(code)}, css ${kb(css)}, fonts ${kb(fonts)})`);
}

/** Manifest, icons and the service worker. Its version changes with the page, so installs update. */
function writeAppFiles(page) {
  const manifest = `${JSON.stringify(MANIFEST, null, 2)}\n`;
  fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), manifest);
  fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
  for (const f of ICONS) fs.copyFileSync(r('assets/icons', f), path.join(DIST, 'icons', f));
  const version = crypto.createHash('sha256').update(page).update(manifest).digest('hex').slice(0, 12);
  const files = ['./', 'manifest.webmanifest', ...ICONS.map((f) => `icons/${f}`)];
  const sw = fs.readFileSync(r('src/sw.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(version))
    .replace('__FILES__', JSON.stringify(files));
  fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
}

await build();

if (watch) {
  let timer = null;
  fs.watch(r('src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  await serve(DIST, 5173);
  console.log('serving http://localhost:5173 (rebuilds on change)');
}
