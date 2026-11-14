/* Dados da API nunca vão para o cache. Para publicar uma versão nova do site, troque o número do CACHE. */

const CACHE = 'trifarmas-v2';

const SHELL = [
  './',
  'index.html',
  'pharmacy.html',
  'styles.css',
  'config.js',
  'api.js',
  'app.js',
  'location.js',
  'medicine.js',
  'cart.js',
  'orders.js',
  'scan-select.js',
  'pwa.js',
  'pharmacy.js',
  'manifest.webmanifest',
  'assets/logo.png',
  'assets/favicon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    // addAll falha inteiro se um arquivo faltar: guarda um por um.
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(file => cache.add(file).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/') || url.pathname === '/health';
  const sameOrigin = url.origin === self.location.origin;

  if (isApi || !sameOrigin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => {
      const fromNetwork = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || fromNetwork;
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if (client.url.includes('index.html') || client.url.endsWith('/')) return client.focus();
      }
      return self.clients.openWindow('index.html');
    })
  );
});
