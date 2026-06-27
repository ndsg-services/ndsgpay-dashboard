// pos-sw.js — Service Worker NDSGPay POS
const CACHE = 'ndsgpay-pos-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Ne pas cacher — toujours aller sur le réseau
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});

