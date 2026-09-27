// Runs one of the browser test scripts in tests/ against a freshly served dist/.
// dist/ is served on a free port for the duration of the run; the script gets that URL as its
// first argument, followed by all extra arguments.
// Usage: node tools/qa.js <script> [args...]     e.g. node tools/qa.js full-qa run-desktop

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.js';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const [name, ...args] = process.argv.slice(2);
const script = name && path.join(ROOT, 'tests', name.replace(/\.mjs$/, '') + '.mjs');
if (!script || !fs.existsSync(script)) {
  const all = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', ''));
  console.error(`usage: node tools/qa.js <${all.join('|')}> [args...]`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/ is missing, run `npm run build` first');
  process.exit(2);
}

const { server, url } = await serve(path.join(ROOT, 'dist'), 0);
const child = spawn(process.execPath, [script, url, ...args], { cwd: ROOT, stdio: 'inherit' });
child.on('exit', (code, signal) => {
  server.close();
  process.exit(signal ? 1 : code);
});
