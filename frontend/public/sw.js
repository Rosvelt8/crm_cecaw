/*
 * Service worker CECAW.
 * Rôle volontairement limité : rendre l'application installable et afficher une page claire hors connexion.
 * Il ne met JAMAIS en cache les pages connectées ni les réponses de l'API : un CRM de crédit manipule des
 * données de clients, qui ne doivent pas rester sur l'appareil ni apparaître périmées.
 * Seuls les fichiers statiques de l'interface (scripts, styles, polices, icônes) sont gardés pour aller plus vite.
 */
const VERSION = 'cecaw-v1';
const CACHE = `${VERSION}-statique`;
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const estStatique = (url) =>
  url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/logo.png' || /\.(?:woff2?|ttf)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // L'API (autre origine) et tout ce qui n'est pas à nous passent sans intermédiaire.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (estStatique(url)) {
    event.respondWith(
      caches.match(req).then((enCache) => enCache || fetch(req).then((rep) => {
        if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
        return rep;
      })),
    );
  }
});
