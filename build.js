// Build: bundles the game into single HTML files.
//   dist/riftdeck.html  artifact fragment (no <html>/<head>/<body>, the host wraps it)
//   dist/index.html     standalone page for local play and tests
// Usage: node build.js [--watch]   (watch also serves dist/ on http://localhost:5173)

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const r = (...p) => path.join(ROOT, ...p);
const DIST = r('dist');
const watch = process.argv.includes('--watch');

const TITLE = 'Riftdeck';
const DESCRIPTION = 'Riftdeck – a roguelite deckbuilder in the Riftline universe with a 3D diorama battlefield.';

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
  const head = `<title>${TITLE}</title>\n<meta name="description" content="${DESCRIPTION}">\n<meta name="theme-color" content="#06070d">`;
  const body = '<div id="app"></div>';

  const fragment = `${head}\n<style>${fonts}\n${css}</style>\n${body}\n<script>${code}</script>\n`;
  fs.writeFileSync(path.join(DIST, 'riftdeck.html'), fragment);

  const full = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${head}\n<style>${fonts}\n${css}</style></head><body>${body}<script>${code}</script></body></html>\n`;
  fs.writeFileSync(path.join(DIST, 'index.html'), full);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`built in ${Date.now() - t0}ms  riftdeck.html ${kb(fragment)}  (js ${kb(code)}, css ${kb(css)}, fonts ${kb(fonts)})`);
}

await build();

if (watch) {
  let timer = null;
  fs.watch(r('src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  http.createServer((req, res) => {
    const file = path.join(DIST, req.url === '/' ? 'index.html' : path.normalize(req.url).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(data);
    });
  }).listen(5173, () => console.log('serving http://localhost:5173 (rebuilds on change)'));
}
