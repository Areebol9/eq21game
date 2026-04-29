const CACHE = 'equation21-v9';
const FILES = [
  './index.html',
  './style.css',
  './manifest.json',
  './js/config.js',
  './js/expression.js',
  './js/solver-worker.js',
  './js/history.js',
  './js/icons.js',
  './js/ui.js',
  './js/online.js',
  './js/game.js',
  './js/main.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
