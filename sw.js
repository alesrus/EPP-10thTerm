// Bump this when the app files change so installed apps pick up the new worker.
const APP_VERSION = '20261125a';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // App files from this site: always check with the server (no stale copies
  // from the browser cache, which could mix old and new files).
  if (request.method === 'GET' && new URL(request.url).origin === self.location.origin) {
    event.respondWith(fetch(request, { cache: 'no-cache' }).catch(() => fetch(request)));
    return;
  }
  event.respondWith(fetch(request));
});
