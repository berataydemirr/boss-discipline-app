/**
 * Hatırlatıcılar.
 *
 * Gerçekçi sınırlar (PWA, sunucusuz):
 * - Uygulama açıkken: her 30 sn kontrol edilir, zamanı gelen hatırlatma bildirim olarak gösterilir.
 * - Uygulama kapalıyken: Android'de Chrome ile kurulmuş uygulamada "Periodic Background Sync"
 *   destekleniyorsa service worker yaklaşık saatlik kontrol yapar (zamanlamayı tarayıcı belirler).
 * - iPhone'da arka plan kontrolü yok; hatırlatma uygulama açıldığında gösterilir.
 * Kesin saatli, uygulama kapalıyken gelen bildirim için bir push sunucusu gerekir.
 */
import { store } from '../core/store.js';
import { createLogger } from '../core/logger.js';
import { todayKey } from '../core/dates.js';
import { toast } from '../ui/toast.js';

const log = createLogger('reminders');
const META_KEY = 'reminderLog';
const SYNC_TAG = 'disiplin-reminders';
let timer = null;
let running = false;

const core = () => self.DisiplinReminders;

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

/** Kullanıcı hareketiyle (düğme) çağrılmalı. 'granted' | 'denied' | 'default' | 'unsupported' döner. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    log.info('Bildirim izni', { result });
    if (result === 'granted') await registerPeriodicSync();
    return result;
  } catch (e) {
    log.error('Bildirim izni istenemedi', e);
    return 'denied';
  }
}

/** Arka plan kontrolü (destekleyen tarayıcılarda). Desteklenmiyorsa sessizce geçer. */
export async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('periodicSync' in reg)) {
      log.info('Periodic Background Sync yok; hatırlatmalar yalnızca uygulama açıkken');
      return false;
    }
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') {
      log.info('Arka plan senkron izni yok', { state: status.state });
      return false;
    }
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 60 * 60 * 1000 });
    log.info('Arka plan hatırlatma kontrolü kayıtlı');
    return true;
  } catch (e) {
    log.warn('Arka plan kontrolü kaydedilemedi', e);
    return false;
  }
}

export async function unregisterPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.periodicSync?.unregister(SYNC_TAG);
  } catch {
    /* yok say */
  }
}

async function show(n) {
  if (permission() === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(n.title, {
        body: n.body,
        tag: `disiplin-${n.id}`,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { url: n.url },
      });
      return;
    } catch (e) {
      log.warn('Bildirim gösterilemedi, uygulama içi uyarıya düşülüyor', e);
    }
  }
  toast(`${n.title} — ${n.body}`, { duration: 6000 });
}

/** Zamanı gelen hatırlatmaları kontrol edip gösterir. */
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
    log.info('Hatırlatmalar', { ids: due.map((d) => d.id) });
    for (const n of due) {
      await show(n);
      fired.add(n.id);
    }
    await store.setMeta(META_KEY, { date: today, ids: [...fired] });
    return due;
  } catch (e) {
    log.error('Hatırlatma kontrolü başarısız', e);
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
  log.debug('hatırlatıcı zamanlayıcı başladı');
}

export function stopReminders() {
  clearInterval(timer);
  timer = null;
  stopReminders.cleanup?.();
  stopReminders.cleanup = null;
}
