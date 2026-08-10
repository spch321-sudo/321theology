/* 321系統神學 Service Worker */
const CACHE_VERSION = 'g321theo-v1.4.0';
const CORE = ['./', './index.html', './manifest.json', './data/index.json', './data/lexicon.json', './data/verses.json', './logo.png', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // index.html：網路優先，離線回落
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    e.respondWith(fetch(req).then(r => {
      caches.open(CACHE_VERSION).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // 其餘：快取優先 + 背景更新
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => {
      if (r && r.status === 200) caches.open(CACHE_VERSION).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
