/*
 * Service worker: uygulamayı çevrimdışı çalıştırır.
 *
 * Strateji:
 * - Uygulama dosyaları (PRECACHE) kurulumda önbelleğe alınır ve önce önbellekten sunulur.
 * - Google Fonts: önbellekten sun, arka planda tazele (stale-while-revalidate).
 * - Sürüm js/version.js'ten gelir; sürüm değişince yeni önbellek kurulur, eskisi silinir.
 *
 * ÖNEMLİ: Yeni bir dosya eklediğinde PRECACHE listesine de ekle.
 * `npm test` (tests/precache.test.mjs) eksik/fazla dosyayı yakalar.
 */
importScripts('./js/version.js');

const VERSION = self.DISIPLIN_VERSION;
const CACHE = `disiplin-${VERSION}`;
const RUNTIME = 'disiplin-runtime';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/version.js',
  './js/main.js',
  './js/core/logger.js',
  './js/core/dates.js',
  './js/core/db.js',
  './js/core/store.js',
  './js/core/validate.js',
  './js/core/router.js',
  './js/core/sw-register.js',
  './js/logic/streaks.js',
  './js/logic/stats.js',
  './js/logic/quotes.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/toast.js',
  './js/ui/sheet.js',
  './js/ui/theme.js',
  './js/ui/habit-form.js',
  './js/views/today.js',
  './js/views/journal.js',
  './js/views/habits.js',
  './js/views/settings.js',
];

const log = (...args) => console.info('%c[sw]', 'color:#7fa6c9', ...args);

self.addEventListener('install', (event) => {
  log('kuruluyor', VERSION);
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .catch((e) => {
        console.error('[sw] önbelleğe alma başarısız — PRECACHE listesini kontrol et', e);
        throw e;
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('disiplin-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
      await self.clients.claim();
      log('etkin', VERSION);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(fromCache(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function fromCache(req) {
  const cache = await caches.open(CACHE);
  if (req.mode === 'navigate') {
    // ?debug=1 gibi parametreler aynı kabuğu kullanır.
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    return await fetch(req);
  } catch (e) {
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await network) || new Response('', { status: 504 });
}
