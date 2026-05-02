// Build output rewrites this value so each deploy uses a fresh cache bucket.
const CACHE = 'equation21-dev';
const APP_SHELL = './';
const FILES = [
  './',
  './style.css',
  './manifest.json',
  './js/i18n.js',
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

const DEPLOY_CONFIG_PATH = '/js/deploy-config.js';
const EMPTY_DEPLOY_CONFIG = '"use strict";\nwindow.EQ21_ONLINE_URL = window.EQ21_ONLINE_URL || "";\n';
const PRECACHE_PATHS = new Set(FILES.map(file => new URL(file, self.location.href).pathname));

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.all(FILES.map(file => {
        const req = new Request(file, { cache: 'reload' });
        return fetch(req).then(res => {
          if (res && res.ok && res.type === 'basic') {
            return cache.put(file, res);
          }
          return res;
        }, () => cache.match(file));
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.indexOf('equation21-') === 0 && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('reset-sw')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetchAndCache(e.request)
        .catch(() => caches.match(APP_SHELL))
    );
    return;
  }

  if (url.pathname === DEPLOY_CONFIG_PATH) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => new Response(EMPTY_DEPLOY_CONFIG, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
        }))
    );
    return;
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
});

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetchAndCache(request);
  });
}

function networkFirst(request) {
  return fetchAndCache(request).catch(() => caches.match(request));
}

function fetchAndCache(request) {
  return fetch(request).then(response => {
    if (response && response.ok && response.type === 'basic') {
      const clone = response.clone();
      caches.open(CACHE).then(c => c.put(request, clone));
    }
    return response;
  });
}
