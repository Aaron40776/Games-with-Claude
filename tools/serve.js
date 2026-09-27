// Static file server for dist/, used by `npm run dev` and the PWA test. It sends
// proper content types: browsers refuse a service worker that isn't served as
// JavaScript and expect the manifest as application/manifest+json.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Serves dir on port (0 = any free port). Resolves with { server, url }. */
export function serve(dir, port = 0) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, url: `http://localhost:${server.address().port}/` }));
  });
}
