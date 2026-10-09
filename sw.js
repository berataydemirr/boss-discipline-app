/*
 * Service worker: makes the app work offline.
 *
 * Strategy:
 * - App files (PRECACHE) are cached at install and served cache-first.
 * - Google Fonts: served from cache, refreshed in the background (stale-while-revalidate).
 * - The version comes from js/version.js; a new version installs a new cache and drops the old one.
 *
 * IMPORTANT: add every new file to PRECACHE.
 * `npm test` (tests/precache.test.mjs) catches missing or extra entries.
 */
importScripts('./js/version.js', './js/reminder-core.js');

const VERSION = self.BOSS_VERSION;
const CACHE = `boss-${VERSION}`;
const RUNTIME = 'boss-runtime';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './css/charts.css',
  './css/insights.css',
  './css/plan-focus.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/version.js',
  './js/reminder-core.js',
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
  './js/logic/gamification.js',
  './js/logic/summary.js',
  './js/logic/backup-schema.js',
  './js/features/focus.js',
  './js/features/reminders.js',
  './js/features/backup.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/toast.js',
  './js/ui/sheet.js',
  './js/ui/theme.js',
  './js/ui/habit-form.js',
  './js/ui/habit-detail.js',
  './js/ui/review-form.js',
  './js/ui/charts.js',
  './js/views/today.js',
  './js/views/journal.js',
  './js/views/habits.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/plan.js',
  './js/views/focus.js',
];

const log = (...args) => console.info('%c[sw]', 'color:#7fa6c9', ...args);

self.addEventListener('install', (event) => {
  log('installing', VERSION);
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .catch((e) => {
        console.error('[sw] precaching failed — check the PRECACHE list', e);
        throw e;
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('boss-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
      await self.clients.claim();
      log('active', VERSION);
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
    // Query strings like ?debug=1 use the same app shell.
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

/* ───────────────────────── notifications ───────────────────────── */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#/today', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all.find((c) => c.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/* ───────────────────── background reminders (Android/Chrome) ───────────────────── */

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'boss-reminders') event.waitUntil(backgroundReminders());
});

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('boss'); // no version: use the schema the page created
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      // The database was never created: do nothing.
      req.transaction.abort();
    };
  });
}

function idbAll(db, store) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbPut(db, store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function backgroundReminders() {
  let db;
  try {
    db = await idbOpen();
    if (!db.objectStoreNames.contains('meta')) return;
    const R = self.BossReminders;
    const now = new Date();
    const today = R.dateKey(now);
    const [habits, checks, days, settingsRows, metaRows] = await Promise.all(['habits', 'checks', 'days', 'settings', 'meta'].map((s) => idbAll(db, s)));
    const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    if (settings.morningTime === undefined) settings.morningTime = '08:30';
    if (settings.eveningTime === undefined) settings.eveningTime = '21:30';
    const logRec = metaRows.find((m) => m.key === 'reminderLog')?.value;
    const fired = R.firedSet(logRec, today);
    const doneToday = new Set(checks.filter((c) => c.date === today).map((c) => c.habitId));
    const day = days.find((d) => d.date === today) || null;
    // Background checks are sparse (~hourly), so the window is wider.
    const due = R.dueReminders({ habits, doneToday, day, settings, fired, now, windowMin: 150 });
    for (const n of due) {
      await self.registration.showNotification(n.title, {
        body: n.body,
        tag: `boss-${n.id}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { url: n.url },
      });
      fired.add(n.id);
    }
    if (due.length) await idbPut(db, 'meta', { key: 'reminderLog', value: { date: today, ids: [...fired] } });
    log('background reminders', due.length);
  } catch (e) {
    console.error('[sw] background reminders failed', e);
  } finally {
    db?.close();
  }
}
