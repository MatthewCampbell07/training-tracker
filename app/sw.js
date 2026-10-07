// Offline support. Online: always fetch the latest files (and refresh the saved copy).
// Offline: fall back to the saved copy. Bump VERSION when the file list changes.
const VERSION = 'tt-v10';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'store.js', 'views.js', 'stats-views.js',
  'badges.js', 'charts.js', 'cloud.js', 'plan.json', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  // Only this app's own files. Sign in and cloud requests go straight to Google.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
