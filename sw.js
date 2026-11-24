// Service worker : l'app fonctionne hors ligne.
// Stratégie « réseau d'abord » : toujours la dernière version quand on est connecté, le cache sinon.

const CACHE = 'proello-v20';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/parser.js',
  'js/summarize.js',
  'js/when.js',
  'js/themes.js',
  'js/profiles.js',
  'js/categorize.js',
  'js/profile-ui.js',
  'js/report.js',
  'js/version.js',
  'js/voice.js',
  'js/tasks.js',
  'js/dates.js',
  'js/util.js',
  'js/views/list.js',
  'js/views/gantt.js',
  'js/views/matrix.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // « no-cache » : toujours revérifier auprès du serveur (GitHub Pages autorise 10 min de cache navigateur,
  // ce qui affichait l'ancienne version juste après une mise à jour). Hors ligne, le cache prend le relais.
  const fresh =
    req.mode === 'navigate'
      ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      : sameOrigin
        ? fetch(req, { cache: 'no-cache' })
        : fetch(req);
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
