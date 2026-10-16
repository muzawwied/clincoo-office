// Service worker Clincoo Office
// Halaman utama: network-first (dapat pembaruan), aset lain: cache-first, API tidak pernah di-cache.
const CACHE = 'clincoo-v2';
const CORE = ['./index.html', './office-live.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const isPage = e.request.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('index.html');
  // [16 Okt] office-live.js: NETWORK-FIRST. Cache-first membuat pengguna nyangkut di
  // versi lama saat deploy tanpa bump ?v= (bug "karakter beda + daftar chat kosong").
  if (u.pathname.endsWith('office-live.js')) {
    e.respondWith(
      fetch(e.request).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); } return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  if (isPage) {
    e.respondWith(
      fetch(e.request).then((r) => {
        if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cl)); }
        return r;
      }).catch(() => caches.match('./index.html').then((h) => h || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); }
      return r;
    }))
  );
});
