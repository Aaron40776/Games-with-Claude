// Riftline service worker – build __RL_VERSION__ (__RL_BUILD__)
const CACHE = 'riftline-v__RL_VERSION_DASHED__-__RL_BUILD__';
const FILES = ["./","index.html","__RL_GAME_FILE__","manifest.webmanifest","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-48.png","build-info.json","fonts/chakra-petch-latin-600-normal.woff2","fonts/chakra-petch-latin-700-normal.woff2","fonts/barlow-semi-condensed-latin-500-normal.woff2","fonts/barlow-semi-condensed-latin-600-normal.woff2","fonts/barlow-semi-condensed-latin-700-normal.woff2"];
const CORE = ['./', 'index.html', '__RL_GAME_FILE__'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => {
    const p = c.add(new Request(f, { cache: 'reload' }));
    return CORE.includes(f) ? p : p.catch(() => null);
  }))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('riftline-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok && res.type === 'basic') caches.open(CACHE).then(c => c.put('index.html', res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match('index.html').then((hit) => hit || c.match('./')))));
    return;
  }
  if (url.pathname.endsWith('/build-info.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok && res.type === 'basic') caches.open(CACHE).then(c => c.put('build-info.json', res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.open(CACHE).then(c => c.match('build-info.json'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  }))));
});
