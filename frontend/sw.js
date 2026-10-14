/* Service worker do Trifarmas.
   Guarda a casca do app (HTML, CSS, JS, ícones) para abrir rápido e funcionar
   offline. Dados (API) nunca são guardados: preço e pedido precisam ser atuais.
   Para publicar uma versão nova do site, troque o número do CACHE. */

const CACHE = 'trifarmas-v1';

const SHELL = [
  './',
  'index.html',
  'farmacia.html',
  'styles.css',
  'config.js',
  'api.js',
  'app.js',
  'location.js',
  'medicine.js',
  'cart.js',
  'orders.js',
  'pwa.js',
  'farmacia.js',
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

  // API, mapas e fontes: sempre da rede (nada de preço velho em cache).
  if (isApi || !sameOrigin) return;

  // Navegação: tenta a rede e, sem internet, abre a versão guardada.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  // Arquivos do app: responde do cache e atualiza em segundo plano.
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

// Toque na notificação do lembrete: abre (ou foca) o app.
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
