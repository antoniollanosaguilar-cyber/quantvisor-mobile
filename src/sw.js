// Service Worker para QuantVisor Pro Mobile
const CACHE_NAME = 'quantvisor-mobile-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/indicators.js',
  '/drawing_canvas.js',
  '/pine_editor.js',
  '/lightweight-charts.standalone.production.js',
  '/manifest.json',
  '/assets/icon-128.png',
  '/assets/icon-192.png',
  '/assets/icon-256.png',
  '/assets/icon-384.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Las llamadas a /api/ siempre van por red viva
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Estrategia Network-First con fallback a cache para recursos de la app
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
