// Service worker for the installed app (not bundled; build.js fills in the
// placeholders and writes it to dist/sw.js).
// The game is a single HTML file plus manifest and icons. Online it always loads
// the newest version from the network (and keeps a copy); offline, or when the
// network hangs, it starts the copy it saw last.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `riftdeck-${VERSION}`;
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Bypass the HTTP cache so a new version never stores a stale copy.
    await cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('riftdeck-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(networkFirst(e));
});

async function networkFirst(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  // Every page load is the same single-file game, stored under './'.
  const key = req.mode === 'navigate' ? './' : req;
  const network = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(key, res.clone());
    return res;
  });
  // Keep refreshing the copy even when the cached one is served below.
  e.waitUntil(network.catch(() => {}));
  const cached = await cache.match(key, { ignoreSearch: true });
  if (!cached) return network;
  // Prefer the network, but a failing or hanging connection must not block the start.
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
  return Promise.race([network.catch(() => cached), slow]);
}
