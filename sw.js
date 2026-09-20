/* ============================================================
   SINDI — Service Worker

   Estrategia:
   - App shell (HTML/CSS/JS/iconos): precache + "stale-while-revalidate".
     La app abre al instante y se actualiza sola en segundo plano.
   - /api/storage y /api/state (subir/listar/borrar archivos, y el
     estado compartido de la app): siempre por red, nunca cacheado.
   - /api/file (fotos/archivos ya subidos): stale-while-revalidate, como
     el resto del mismo origen — cada archivo tiene una key única, así
     que cachearlo es seguro y ayuda a verlo offline.
   - Fuentes de Google: cache-first (cambian muy poco).
   - Navegaciones sin conexión: se sirve index.html desde el cache.

   Los datos de SINDI viven en localStorage, así que la app sigue
   funcionando sin conexión; solo subir/ver archivos nuevos requiere red.

   IMPORTANTE: al publicar una versión nueva, subí el número de
   CACHE_VERSION para que los navegadores tomen los archivos nuevos.
   ============================================================ */

const CACHE_VERSION = 'sindi-v23';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

// Rutas relativas al scope: así funciona igual en
// usuario.github.io/sindi/ que en sindi.pages.dev/
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/config.js',
  './js/storage.js',
  './js/api.js',
  './js/app-core.js',
  './js/app-users.js',
  './js/app-catalog.js',
  './js/app-needs-projects.js',
  './js/app-milestones.js',
  './js/app-materials-purchases.js',
  './js/app-requests.js',
  './js/app-maintenance.js',
  './js/app-files.js',
  './js/app-audit.js',
  './js/app-export.js',
  './js/app-init.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll falla entero si un archivo falla; se cachea uno por uno
    // para que un 404 puntual no rompa la instalación completa.
    await Promise.all(SHELL_ASSETS.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[SW] No se pudo cachear:', url, err); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Permite que la página pida activar la versión nueva sin recargar a mano.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isGoogleFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}
// Librería de exportación a Excel (SheetJS). Se cachea tras el primer uso
// para que "Exportar a Excel" también funcione sin conexión.
function isVendorLib(url) {
  return url.hostname === 'cdnjs.cloudflare.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Acción de estado/API (no es un archivo): siempre por red, nunca cacheada.
  if (url.pathname === '/api/storage' || url.pathname === '/api/state') return;

  // Fuentes y librerías externas: cache-first.
  if (isGoogleFont(url) || isVendorLib(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Navegación: red primero, y si no hay conexión, el index cacheado.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Mismo origen: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await network) || Response.error();
    })());
  }
});
