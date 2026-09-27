// Minimal static file server for dist/ (tests, `npm run dev`, `npm run serve`).
// The game needs http(s) rather than file:// (service worker, build-info fetch, fonts).
// `base` mounts the folder under a sub-path, e.g. '/Games-with-Claude/riftline/' like GitHub Pages.
// CLI: node tools/serve.js [port] [base]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function serve(dir, port = 8124, { base = '/', quiet = true } = {}) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (base !== '/' && p === base.replace(/\/$/, '')) { res.writeHead(301, { location: base }); res.end(); return; }
    if (!p.startsWith(base)) { res.writeHead(404); res.end('not found'); return; }
    p = p.slice(base.length);
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const file = path.join(root, path.normalize('/' + p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); if (!quiet) console.log('404', req.url); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, url: `http://localhost:${server.address().port}${base}` }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
  const { url } = await serve(dist, +(process.argv[2] || 8124), { base: process.argv[3] || '/', quiet: false });
  console.log(`serving ${dist} at ${url}`);
}
