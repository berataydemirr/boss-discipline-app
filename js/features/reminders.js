/**
 * Reminders.
 *
 * Realistic limits (PWA, no server):
 * - While the app is open: checked every 30 s; due reminders are shown as notifications.
 * - While the app is closed: on Android with the app installed via Chrome, if Periodic
 *   Background Sync is available the service worker checks roughly hourly (the browser decides).
 * - iPhone has no background checks; reminders appear when the app is opened.
 * Exact-time notifications while the app is closed require a push server.
 */
import { store } from '../core/store.js';
import { createLogger } from '../core/logger.js';
import { todayKey } from '../core/dates.js';
import { toast } from '../ui/toast.js';

const log = createLogger('reminders');
const META_KEY = 'reminderLog';
const SYNC_TAG = 'boss-reminders';
let timer = null;
let running = false;

const core = () => self.BossReminders;

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function permission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** Must be called from a user gesture (button). Resolves to 'granted' | 'denied' | 'default' | 'unsupported'. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    log.info('Notification permission', { result });
    if (result === 'granted') await registerPeriodicSync();
    return result;
  } catch (e) {
    log.error('Could not request notification permission', e);
    return 'denied';
  }
}

/** Background checks (where supported). Silently skipped otherwise. */
export async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('periodicSync' in reg)) {
      log.info('No Periodic Background Sync; reminders only while the app is open');
      return false;
    }
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') {
      log.info('No background sync permission', { state: status.state });
      return false;
    }
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 60 * 60 * 1000 });
    log.info('Background reminder check registered');
    return true;
  } catch (e) {
    log.warn('Could not register background checks', e);
    return false;
  }
}

export async function unregisterPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.periodicSync?.unregister(SYNC_TAG);
  } catch {
    /* ignore */
  }
}

async function show(n) {
  if (permission() === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(n.title, {
        body: n.body,
        tag: `boss-${n.id}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { url: n.url },
      });
      return;
    } catch (e) {
      log.warn('Could not show notification, falling back to in-app toast', e);
    }
  }
  toast(`${n.title} — ${n.body}`, { duration: 6000 });
}

/** Checks for due reminders and shows them. */
export async function check(now = new Date()) {
  if (running || !store.settings.remindersEnabled || !core()) return [];
  running = true;
  try {
    const today = todayKey(now);
    const logRec = await store.getMeta(META_KEY);
    const fired = core().firedSet(logRec, today);
    const habits = store.habits();
    const doneToday = new Set(habits.filter((h) => store.isDone(h.id, today)).map((h) => h.id));
    const due = core().dueReminders({ habits, doneToday, day: store.day(today), settings: store.settings, fired, now });
    if (!due.length) return [];
    log.info('Reminders', { ids: due.map((d) => d.id) });
    for (const n of due) {
      await show(n);
      fired.add(n.id);
    }
    await store.setMeta(META_KEY, { date: today, ids: [...fired] });
    return due;
  } catch (e) {
    log.error('Reminder check failed', e);
    return [];
  } finally {
    running = false;
  }
}

export function startReminders() {
  stopReminders();
  if (!store.settings.remindersEnabled) return;
  const tick = () => {
    if (document.visibilityState === 'visible') check();
  };
  tick();
  timer = setInterval(tick, 30000);
  document.addEventListener('visibilitychange', tick);
  stopReminders.cleanup = () => document.removeEventListener('visibilitychange', tick);
  log.debug('reminder timer started');
}

export function stopReminders() {
  clearInterval(timer);
  timer = null;
  stopReminders.cleanup?.();
  stopReminders.cleanup = null;
}
