self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Network-first passthrough so live data always stays fresh
  event.respondWith(fetch(event.request));
});
