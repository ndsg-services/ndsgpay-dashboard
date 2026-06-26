// pos-sw.js — Service Worker NDSGPay POS
const CACHE = 'ndsgpay-pos-v1';
const ASSETS = ['/pos.html', '/pos-manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API calls — toujours réseau (pas de cache)
  if (e.request.url.includes('ndsgpay-backend') || e.request.url.includes('localhost:3000')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('/pos.html')))
  );
});
