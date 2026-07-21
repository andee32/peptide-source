const CACHE = 'lab-standard-v1';

self.addEventListener('install', e => {
  const base = self.registration.scope;
  const STATIC = [base, base + 'shop', base + 'manifest.json'];
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
