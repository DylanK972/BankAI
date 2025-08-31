// sw.js — mode DEV: réseau d’abord, pas de cache persistant
const SW_VERSION = 'dev-1'; // ↑ incrémente ce numéro quand tu veux forcer une mise à jour

self.addEventListener('install', (event) => {
  self.skipWaiting(); // active immédiatement la nouvelle version
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // purge tous les caches existants
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// réseau d’abord ; si offline, on tente le cache (qui est vide en dev)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
