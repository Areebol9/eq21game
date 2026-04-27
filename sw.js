const CACHE = 'equation21-v1';
const FILES = [
  './index.html',
  './style.css',
  './js/config.js',
  './js/expression.js',
  './js/history.js',
  './js/ui.js',
  './js/game.js',
  './js/main.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
