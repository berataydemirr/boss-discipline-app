/**
 * Odak zamanlayıcısı (Pomodoro) motoru.
 *
 * Zaman "kalan saniye" değil, BİTİŞ ZAMANI (endAt) olarak tutulur ve localStorage'a yazılır:
 * telefon kilitlense, sekme uyusa ya da uygulama kapatılsa bile süre doğru kalır.
 * Uygulama yeniden açıldığında süre dolmuşsa oturum kaydedilir.
 *
 * Durum: { mode: 'focus'|'short'|'long', status: 'idle'|'running'|'paused',
 *          endAt, remainingMs, plannedMin, startedAt, habitId, cycle }
 */
import { store } from '../core/store.js';
import { createLogger } from '../core/logger.js';
import { toKey } from '../core/dates.js';
import { toast } from '../ui/toast.js';
import { vibrate } from '../ui/dom.js';

const log = createLogger('focus');
const KEY = 'disiplin:focus';
const listeners = new Set();
let ticker = null;

export const MODES = {
  focus: { label: 'Odak', setting: 'focusMinutes' },
  short: { label: 'Kısa mola', setting: 'shortBreak' },
  long: { label: 'Uzun mola', setting: 'longBreak' },
};

function fresh() {
  return { mode: 'focus', status: 'idle', endAt: null, remainingMs: null, plannedMin: null, startedAt: null, habitId: null, cycle: 0 };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && MODES[s.mode] && ['idle', 'running', 'paused'].includes(s.status)) return { ...fresh(), ...s };
  } catch (e) {
    log.warn('Kayıtlı odak durumu okunamadı', e);
  }
  return fresh();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* kota/gizli mod — zamanlayıcı bellek içinde çalışmaya devam eder */
  }
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(snapshot());
    } catch (e) {
      log.error('Odak dinleyicisi hatası', e);
    }
  });
}

function set(patch) {
  state = { ...state, ...patch };
  save();
  syncTicker();
  emit();
}

export function durationMin(mode = state.mode) {
  return store.settings[MODES[mode].setting];
}

/** Ekrana hazır anlık görüntü. */
export function snapshot(now = Date.now()) {
  const totalMs = (state.plannedMin ?? durationMin()) * 60000;
  let remainingMs;
  if (state.status === 'running') remainingMs = Math.max(0, state.endAt - now);
  else if (state.status === 'paused') remainingMs = state.remainingMs;
  else remainingMs = durationMin() * 60000;
  return { ...state, remainingMs, totalMs, progress: totalMs ? 1 - remainingMs / totalMs : 0 };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function syncTicker() {
  if (state.status === 'running' && !ticker) {
    ticker = setInterval(tick, 1000);
  } else if (state.status !== 'running' && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick() {
  if (state.status === 'running' && Date.now() >= state.endAt) complete();
  else emit();
}

/* ───────────────────────── eylemler ───────────────────────── */

export function start() {
  const plannedMin = durationMin();
  const now = Date.now();
  log.info('Başladı', { mode: state.mode, plannedMin });
  set({ status: 'running', plannedMin, startedAt: now, endAt: now + plannedMin * 60000, remainingMs: null });
}

export function pause() {
  if (state.status !== 'running') return;
  set({ status: 'paused', remainingMs: Math.max(0, state.endAt - Date.now()), endAt: null });
}

export function resume() {
  if (state.status !== 'paused') return;
  set({ status: 'running', endAt: Date.now() + state.remainingMs, remainingMs: null });
}

export function reset() {
  log.info('Sıfırlandı', { mode: state.mode });
  set({ status: 'idle', endAt: null, remainingMs: null, plannedMin: null, startedAt: null });
}

export function setMode(mode) {
  if (!MODES[mode]) throw new Error(`Bilinmeyen mod: ${mode}`);
  set({ mode, status: 'idle', endAt: null, remainingMs: null, plannedMin: null, startedAt: null });
}

export function setHabit(habitId) {
  set({ habitId: habitId || null });
}

/** Oturumu beklemeden bitir (kayıt yok, sonraki moda geç). */
export function skip() {
  advance(false);
}

function nextMode(cycle) {
  if (state.mode !== 'focus') return 'focus';
  return cycle % store.settings.longEvery === 0 ? 'long' : 'short';
}

function advance(countFocus) {
  const cycle = state.mode === 'focus' && countFocus ? state.cycle + 1 : state.cycle;
  const mode = nextMode(cycle || 1);
  set({ mode, cycle: mode === 'focus' && state.mode === 'long' ? 0 : cycle, status: 'idle', endAt: null, remainingMs: null, plannedMin: null, startedAt: null });
}

async function complete() {
  const finished = { ...state };
  const endAt = finished.endAt;
  log.info('Tamamlandı', { mode: finished.mode, plannedMin: finished.plannedMin });
  // Durumu ÖNCE (senkron) ilerlet: kayıt sürerken gelen bir sonraki tik aynı oturumu ikinci kez kaydetmesin.
  advance(true);

  if (finished.mode === 'focus') {
    try {
      const date = toKey(new Date(finished.startedAt));
      await store.addFocusSession({ start: finished.startedAt, end: endAt, minutes: finished.plannedMin, date, habitId: finished.habitId });
      const habit = finished.habitId && store.habit(finished.habitId);
      if (habit && store.settings.focusAutoCheck && habit.kind === 'build' && !store.isDone(habit.id, date) && date >= habit.createdAt) {
        await store.toggleCheck(habit.id, date);
        log.info('Bağlı alışkanlık işaretlendi', { habit: habit.name });
      }
    } catch (e) {
      log.error('Odak oturumu kaydedilemedi', e);
    }
  }
  notify(finished.mode);
}

async function notify(mode) {
  const msg = mode === 'focus' ? 'Odak bitti. Kısa bir mola ver.' : 'Mola bitti. Hazırsan devam.';
  vibrate([120, 80, 120]);
  beep();
  if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Disiplin', { body: msg, tag: 'disiplin-focus', icon: './icons/icon-192.png', data: { url: './#/focus' } });
      return;
    } catch (e) {
      log.warn('Bildirim gösterilemedi', e);
    }
  }
  toast(msg, { duration: 5000 });
}

/** Kısa, yumuşak bir zil (WebAudio; dosya gerektirmez). */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* ses kapalı olabilir */
  }
}

/** Açılışta: kapalıyken süre dolduysa oturumu kaydet, çalışıyorsa sayacı sürdür. */
export function initFocus() {
  if (state.status === 'running' && Date.now() >= state.endAt) {
    log.info('Uygulama kapalıyken odak tamamlanmış');
    complete();
  }
  syncTicker();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

/** Testler için. */
export function _resetForTests() {
  state = fresh();
  save();
  syncTicker();
}
