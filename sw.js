// Çevrimdışı çalışma için basit servis çalışanı.
// Uygulama dosyalarında değişiklik yaptığında VERSION'ı artır.
const VERSION = 'v7';
const CACHE = `harcama-agaci-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/period.js',
  'js/parser.js',
  'js/categorizer.js',
  'js/format.js',
  'js/ui.js',
  'js/universe.js',
  'js/sheets.js',
  'js/icons.js',
  'js/cloud.js',
  'js/auth.js',
  'js/firebase-config.js',
  'js/receipts.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Önce ağ, olmazsa önbellek: güncellemeler hemen gelir, internet yoksa yine açılır.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (req.method !== 'GET' || (url.origin !== self.location.origin && !sdk)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
