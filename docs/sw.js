const ROOT = new URL('./', self.location.href);
const PREFIX = 'lyric-player-' + ROOT.pathname + '-';
const CACHE = PREFIX + '1362c08f85aa6107';
const ASSETS = ["./","assets/index-BUMq2mY0.js","assets/index-CJLC8IAS.css","icon-192.png","icon-512.png","index.html","manifest.webmanifest"].map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
