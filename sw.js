// Service worker for BankIA demo (offline cache)
const CACHE="bankia-cache-v1";
const ASSETS=["./","./index.html","./app.js","./manifest.json","./assets/icon-192.png","./assets/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>{e.waitUntil(self.clients.claim())});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
