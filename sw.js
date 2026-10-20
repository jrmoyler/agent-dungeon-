/* Agent Dungeon service worker.
   Shell + shared atlases are precached; per-agent atlases, Three.js modules and fonts are cached on first use,
   so any agent you've played once works offline. Bump VERSION whenever atlases or index.html change. */
const VERSION = 'ad-v2-1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'atlas/manifest.json', 'atlas/batch.json',
  'atlas/thumbs.webp', 'atlas/bosses.webp', 'atlas/enemies.webp',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  ...['antigravity', 'claude', 'cursor', 'devin', 'dots', 'gemini', 'glm', 'grok', 'hermes', 'kimi', 'manus', 'meta', 'minimax', 'openclaw'].map(id => `atlas/${id}.webp`),
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // the page itself: network first so deploys land immediately, cache as the offline fallback
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/index.html'))) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return res; }).catch(() => caches.match('index.html')));
    return;
  }
  const cacheable = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
