/**
 * Uygulama durumu ve tek veri erişim noktası.
 *
 * Tasarım:
 * - Açılışta tüm veri belleğe alınır (kişisel kullanım için küçük), okuma senkron ve hızlıdır.
 * - Yazmalar önce veritabanına, BAŞARILI olursa belleğe uygulanır: ekran ile disk asla ayrışmaz.
 * - Tüm yazmalar tek bir kuyrukta sırayla çalışır: hızlı çift dokunuşlar yarış durumu yaratmaz.
 * - Her değişiklik sonrası abonelere { type, silent } olayı yayılır. silent=true olaylar
 *   (ör. not yazarken otomatik kayıt) ekranı yeniden çizdirmez; odak kaybolmaz.
 */
import { openDatabase, DB_VERSION } from './db.js';
import { createLogger } from './logger.js';
import { todayKey, isValidKey, isValidTime } from './dates.js';
import * as V from './validate.js';
import { buildSummary } from '../logic/summary.js';
import { makeBackup, validateBackup } from '../logic/backup-schema.js';

const log = createLogger('store');

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system', // 'system' | 'dark' | 'light'
  accent: 'ember', // 'ember' | 'moss' | 'ochre' | 'tide'
  quoteSource: 'all', // 'all' | 'favorites' | 'mine'
  favQuotes: [],
  // v3
  remindersEnabled: false,
  morningTime: '08:30', // öncelik hatırlatması
  eveningTime: '21:30', // akşam değerlendirmesi hatırlatması
  focusMinutes: 25,
  shortBreak: 5,
  longBreak: 15,
  longEvery: 4, // kaç odaktan sonra uzun mola
  focusAutoCheck: true, // odak bitince bağlı alışkanlığı işaretle
  lastExportAt: null,
});

const minutes = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;

const SETTING_VALIDATORS = {
  theme: (v) => ['system', 'dark', 'light'].includes(v),
  accent: (v) => ['ember', 'moss', 'ochre', 'tide'].includes(v),
  quoteSource: (v) => ['all', 'favorites', 'mine'].includes(v),
  favQuotes: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  remindersEnabled: (v) => typeof v === 'boolean',
  morningTime: (v) => v === null || isValidTime(v),
  eveningTime: (v) => v === null || isValidTime(v),
  focusMinutes: minutes(1, 180),
  shortBreak: minutes(1, 60),
  longBreak: minutes(1, 90),
  longEvery: minutes(2, 8),
  focusAutoCheck: (v) => typeof v === 'boolean',
  lastExportAt: (v) => v === null || Number.isFinite(v),
};
export { SETTING_VALIDATORS };

const state = {
  ready: false,
  backend: null,
  habits: [],
  checks: new Map(), // id `${date}|${habitId}` → { id, habitId, date, type: 'done'|'slip', at }
  days: new Map(), // date → { date, note, ... }
  quotes: [], // kullanıcının kendi sözleri
  settings: { ...DEFAULT_SETTINGS },
  focus: [], // odak oturumları, eskiden yeniye
  goals: [],
};

const index = {
  byHabit: new Map(), // habitId → Set<date>
};

const subscribers = new Set();
let queue = Promise.resolve();
/** Her değişiklikte artar; özet önbelleği bununla geçersizlenir. */
let version = 0;
let summaryCache = { key: null, value: null };

/* ───────────────────────── iç yardımcılar ───────────────────────── */

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertReady() {
  if (!state.ready) throw new Error('Store henüz hazır değil (init çağrılmadı)');
}

/** Yazma işlemlerini sıraya sokar; bir hata kuyruğu kilitlemez. */
function enqueue(label, fn) {
  const run = async () => {
    const end = log.time(label);
    try {
      const result = await fn();
      end();
      return result;
    } catch (e) {
      if (e instanceof V.ValidationError) log.warn(`${label}: ${e.message}`);
      else log.error(`${label} başarısız`, e);
      throw e;
    }
  };
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}

function emit(type, detail = {}) {
  version++;
  log.debug(`değişiklik: ${type}`, detail);
  subscribers.forEach((fn) => {
    try {
      fn({ type, ...detail });
    } catch (e) {
      log.error('Abone hatası', e);
    }
  });
}

function indexAdd(rec) {
  if (!index.byHabit.has(rec.habitId)) index.byHabit.set(rec.habitId, new Set());
  index.byHabit.get(rec.habitId).add(rec.date);
}

function indexRemove(rec) {
  index.byHabit.get(rec.habitId)?.delete(rec.date);
}

function rebuildIndex() {
  index.byHabit.clear();
  state.checks.forEach(indexAdd);
}

function sortHabits() {
  state.habits.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function getHabitOrThrow(id) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) throw new V.ValidationError('Alışkanlık bulunamadı.');
  return h;
}

function isEmptyDay(rec) {
  return !rec.note?.trim() && !rec.priorities?.length && !rec.review;
}

/** Tüm veriyi veritabanından belleğe alır. */
async function loadAll() {
  const [habits, checks, days, quotes, settings, focus, goals] = await Promise.all(
    ['habits', 'checks', 'days', 'quotes', 'settings', 'focus', 'goals'].map((s) => state.backend.getAll(s)),
  );
  state.habits = habits;
  sortHabits();
  state.checks = new Map(checks.map((c) => [c.id, c]));
  state.days = new Map(days.map((d) => [d.date, d]));
  state.quotes = quotes.sort((a, b) => a.createdAt - b.createdAt);
  state.settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of settings) {
    if (key in DEFAULT_SETTINGS && SETTING_VALIDATORS[key]?.(value)) state.settings[key] = value;
    else log.warn('Geçersiz/eski ayar yok sayıldı', { key, value });
  }
  state.focus = focus.sort((a, b) => a.start - b.start);
  state.goals = goals.sort((a, b) => a.createdAt - b.createdAt);
  rebuildIndex();
  return { habits: habits.length, checks: checks.length, days: days.length, focus: focus.length, goals: goals.length };
}

/* ───────────────────────── genel API ───────────────────────── */

export const store = {
  /* —— yaşam döngüsü —— */

  async init() {
    const end = log.time('init');
    state.backend = await openDatabase({
      onVersionChange: () => emit('db-closed'),
    });
    const counts = await loadAll();
    state.ready = true;
    end({ ...counts, backend: state.backend.kind });
  },

  /* —— okuma: v3 —— */

  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  get backendKind() {
    return state.backend?.kind ?? 'none';
  },

  get isPersistent() {
    return !!state.backend?.persistent;
  },

  get version() {
    return version;
  },

  /* —— okuma —— */

  /** Arşivlenmemiş alışkanlıklar (sıralı). */
  habits() {
    return state.habits.filter((h) => !h.archivedAt);
  },

  archivedHabits() {
    return state.habits.filter((h) => h.archivedAt);
  },

  allHabits() {
    return state.habits.slice();
  },

  habit(id) {
    return state.habits.find((h) => h.id === id) ?? null;
  },

  /** O gün başlamış, arşivlenmemiş alışkanlıklar. */
  habitsOn(date) {
    return state.habits.filter((h) => !h.archivedAt && h.createdAt <= date);
  },

  isDone(habitId, date) {
    return index.byHabit.get(habitId)?.has(date) ?? false;
  },

  /** Alışkanlığın işaretlendiği günler (build için "yapıldı", quit için "kaydı"). */
  datesFor(habitId) {
    return index.byHabit.get(habitId) ?? new Set();
  },

  day(date) {
    return state.days.get(date) ?? { date, note: '', priorities: [], review: null };
  },

  allDays() {
    return [...state.days.values()];
  },

  /**
   * Tüm istatistik/puan/rozet özeti. Veri değişmedikçe yeniden hesaplanmaz.
   * Hesap ağırsa bile (yıllarca veri) ekran başına bir kez çalışır.
   */
  summary() {
    const today = todayKey();
    const key = `${version}|${today}`;
    if (summaryCache.key === key) return summaryCache.value;
    const end = log.time('summary');
    const value = buildSummary({
      habits: state.habits,
      isDone: (id, d) => this.isDone(id, d),
      datesFor: (id) => this.datesFor(id),
      days: [...state.days.values()],
      focusMinutes: this.focusMinutesTotal?.() ?? 0,
      today,
    });
    summaryCache = { key, value };
    end({ level: value.level.level, points: value.level.points });
    return value;
  },

  /** İçeriği olan günler, yeniden eskiye. */
  daysWithContent() {
    return [...state.days.values()].filter((d) => !isEmptyDay(d)).sort((a, b) => b.date.localeCompare(a.date));
  },

  get settings() {
    return state.settings;
  },

  userQuotes() {
    return state.quotes.slice();
  },

  focusSessions(date = null) {
    return date ? state.focus.filter((f) => f.date === date) : state.focus.slice();
  },

  focusMinutesTotal() {
    return state.focus.reduce((a, f) => a + f.minutes, 0);
  },

  focusMinutesOn(date) {
    return state.focus.reduce((a, f) => (f.date === date ? a + f.minutes : a), 0);
  },

  goals(period, key) {
    return state.goals.filter((g) => g.period === period && g.periodKey === key);
  },

  /** Konsoldan inceleme için: window.disiplin.store.debugSnapshot() */
  debugSnapshot() {
    return {
      backend: state.backend?.kind,
      habits: state.habits,
      checks: state.checks.size,
      days: state.days.size,
      quotes: state.quotes.length,
      focus: state.focus.length,
      goals: state.goals.length,
      settings: state.settings,
    };
  },

  /* —— alışkanlıklar —— */

  addHabit(input) {
    assertReady();
    return enqueue('addHabit', async () => {
      const data = V.validateHabit(input, { today: todayKey() });
      const maxOrder = state.habits.reduce((m, h) => Math.max(m, h.order), -1);
      const habit = { id: uid(), ...data, order: maxOrder + 1, archivedAt: null, updatedAt: Date.now() };
      await state.backend.put('habits', habit);
      state.habits.push(habit);
      sortHabits();
      log.info('Alışkanlık eklendi', { id: habit.id, name: habit.name });
      emit('habits', { id: habit.id });
      return habit;
    });
  },

  updateHabit(id, input) {
    assertReady();
    return enqueue('updateHabit', async () => {
      const current = getHabitOrThrow(id);
      const data = V.validateHabit({ ...current, ...input }, { today: todayKey() });
      if (data.kind !== current.kind) {
        const hasHistory = (index.byHabit.get(id)?.size ?? 0) > 0;
        if (hasHistory) throw new V.ValidationError('Geçmişi olan bir alışkanlığın türü değiştirilemez.');
      }
      const next = { ...current, ...data, updatedAt: Date.now() };
      await state.backend.put('habits', next);
      Object.assign(current, next);
      log.info('Alışkanlık güncellendi', { id, name: next.name });
      emit('habits', { id });
      return next;
    });
  },

  archiveHabit(id, archived = true) {
    assertReady();
    return enqueue('archiveHabit', async () => {
      const current = getHabitOrThrow(id);
      const next = { ...current, archivedAt: archived ? todayKey() : null, updatedAt: Date.now() };
      await state.backend.put('habits', next);
      Object.assign(current, next);
      log.info(archived ? 'Arşivlendi' : 'Arşivden çıkarıldı', { id });
      emit('habits', { id });
    });
  },

  /** Alışkanlığı ve tüm geçmişini kalıcı olarak siler. */
  deleteHabit(id) {
    assertReady();
    return enqueue('deleteHabit', async () => {
      getHabitOrThrow(id);
      const checkIds = [...state.checks.values()].filter((c) => c.habitId === id).map((c) => c.id);
      await state.backend.deleteMany('checks', checkIds);
      await state.backend.delete('habits', id);
      checkIds.forEach((cid) => state.checks.delete(cid));
      state.habits = state.habits.filter((h) => h.id !== id);
      index.byHabit.delete(id);
      log.info('Alışkanlık silindi', { id, removedChecks: checkIds.length });
      emit('habits', { id });
    });
  },

  /** Aktif listede bir yukarı (-1) / aşağı (+1) taşır. */
  moveHabit(id, dir) {
    assertReady();
    return enqueue('moveHabit', async () => {
      const list = state.habits.filter((h) => !h.archivedAt);
      const i = list.findIndex((h) => h.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const updates = list.map((h, order) => ({ ...h, order }));
      await state.backend.putMany('habits', updates);
      updates.forEach((u) => Object.assign(state.habits.find((h) => h.id === u.id), u));
      sortHabits();
      emit('habits', { id });
    });
  },

  /* —— işaretlemeler —— */

  /** İşareti açar/kapatır. Yeni durumu (true = işaretli) döner. */
  toggleCheck(habitId, date) {
    assertReady();
    return enqueue('toggleCheck', async () => {
      const habit = getHabitOrThrow(habitId);
      if (!isValidKey(date)) throw new V.ValidationError('Geçersiz tarih.');
      if (date > todayKey()) throw new V.ValidationError('Gelecek günler işaretlenemez.');
      if (date < habit.createdAt) throw new V.ValidationError('Bu tarih alışkanlığın başlangıcından önce.');

      const id = `${date}|${habitId}`;
      const existing = state.checks.get(id);
      if (existing) {
        await state.backend.delete('checks', id);
        state.checks.delete(id);
        indexRemove(existing);
      } else {
        const rec = { id, habitId, date, type: habit.kind === 'quit' ? 'slip' : 'done', at: Date.now() };
        await state.backend.put('checks', rec);
        state.checks.set(id, rec);
        indexAdd(rec);
      }
      const on = !existing;
      log.info(on ? 'İşaretlendi' : 'İşaret kaldırıldı', { habit: habit.name, date });
      emit('checks', { habitId, date, on });
      return on;
    });
  },

  /* —— günlük kayıtlar —— */

  /**
   * Günün kaydını kısmi olarak günceller. Kayıt tamamen boşalırsa silinir.
   * @param {{silent?: boolean}} opts silent: yazarken otomatik kayıt — ekranı yeniden çizdirme
   */
  updateDay(date, patch, { silent = false } = {}) {
    assertReady();
    return enqueue('updateDay', async () => {
      if (!isValidKey(date)) throw new V.ValidationError('Geçersiz tarih.');
      if (date > todayKey()) throw new V.ValidationError('Gelecek günler için kayıt tutulamaz.');
      const current = state.days.get(date) ?? { date, note: '', priorities: [], review: null };
      const next = { ...current, updatedAt: Date.now() };
      if ('note' in patch) next.note = V.cleanMultiline(patch.note, 5000);
      if ('priorities' in patch) next.priorities = V.validatePriorities(patch.priorities);
      if ('review' in patch) next.review = V.validateReview(patch.review);

      if (isEmptyDay(next)) {
        if (state.days.has(date)) await state.backend.delete('days', date);
        state.days.delete(date);
      } else {
        await state.backend.put('days', next);
        state.days.set(date, next);
      }
      emit('days', { date, silent });
      return next;
    });
  },

  /* —— sözler —— */

  addQuote(input) {
    assertReady();
    return enqueue('addQuote', async () => {
      const data = V.validateQuote(input);
      const q = { id: `u-${uid()}`, ...data, createdAt: Date.now() };
      await state.backend.put('quotes', q);
      state.quotes.push(q);
      emit('quotes', { id: q.id });
      return q;
    });
  },

  deleteQuote(id) {
    assertReady();
    return enqueue('deleteQuote', async () => {
      await state.backend.delete('quotes', id);
      state.quotes = state.quotes.filter((q) => q.id !== id);
      emit('quotes', { id });
    });
  },

  async toggleFavoriteQuote(id) {
    const fav = new Set(state.settings.favQuotes);
    if (fav.has(id)) fav.delete(id);
    else fav.add(id);
    await this.setSetting('favQuotes', [...fav]);
    return fav.has(id);
  },

  /* —— ayarlar —— */

  setSetting(key, value) {
    assertReady();
    return enqueue('setSetting', async () => {
      if (!(key in DEFAULT_SETTINGS)) throw new Error(`Bilinmeyen ayar: ${key}`);
      if (SETTING_VALIDATORS[key] && !SETTING_VALIDATORS[key](value)) {
        throw new V.ValidationError(`Geçersiz ayar değeri: ${key}`);
      }
      await state.backend.put('settings', { key, value });
      state.settings = { ...state.settings, [key]: value };
      log.info('Ayar değişti', { key, value });
      emit('settings', { key });
    });
  },

  /* —— odak oturumları (v3) —— */

  addFocusSession(input) {
    assertReady();
    return enqueue('addFocusSession', async () => {
      const rec = { id: uid(), ...V.validateFocusSession(input) };
      await state.backend.put('focus', rec);
      state.focus.push(rec);
      log.info('Odak oturumu kaydedildi', { minutes: rec.minutes, habitId: rec.habitId });
      emit('focus', { id: rec.id });
      return rec;
    });
  },

  deleteFocusSession(id) {
    assertReady();
    return enqueue('deleteFocusSession', async () => {
      await state.backend.delete('focus', id);
      state.focus = state.focus.filter((f) => f.id !== id);
      emit('focus', { id });
    });
  },

  /* —— hedefler (v3) —— */

  addGoal(input) {
    assertReady();
    return enqueue('addGoal', async () => {
      const g = { id: uid(), ...V.validateGoal(input), createdAt: Date.now() };
      await state.backend.put('goals', g);
      state.goals.push(g);
      emit('goals', { id: g.id });
      return g;
    });
  },

  updateGoal(id, patch) {
    assertReady();
    return enqueue('updateGoal', async () => {
      const cur = state.goals.find((g) => g.id === id);
      if (!cur) throw new V.ValidationError('Hedef bulunamadı.');
      const next = { ...cur, ...V.validateGoal({ ...cur, ...patch }) };
      await state.backend.put('goals', next);
      Object.assign(cur, next);
      emit('goals', { id });
      return next;
    });
  },

  deleteGoal(id) {
    assertReady();
    return enqueue('deleteGoal', async () => {
      await state.backend.delete('goals', id);
      state.goals = state.goals.filter((g) => g.id !== id);
      emit('goals', { id });
    });
  },

  /* —— iç kayıtlar (hatırlatıcı günlüğü vb.; ekranı yeniden çizdirmez) —— */

  async getMeta(key) {
    assertReady();
    try {
      return (await state.backend.get('meta', key))?.value ?? null;
    } catch (e) {
      log.warn('meta okunamadı', { key, e });
      return null;
    }
  },

  setMeta(key, value) {
    assertReady();
    return enqueue('setMeta', () => state.backend.put('meta', { key, value }));
  },

  /* —— yedekleme (v3) —— */

  /** Tüm kullanıcı verisini yedek nesnesi olarak döner (JSON'a hazır). */
  exportAll() {
    assertReady();
    const data = {
      habits: state.habits,
      checks: [...state.checks.values()],
      days: [...state.days.values()],
      quotes: state.quotes,
      settings: Object.entries(state.settings).map(([key, value]) => ({ key, value })),
      focus: state.focus,
      goals: state.goals,
    };
    return makeBackup(structuredClone(data), { version: self.DISIPLIN_VERSION, schema: DB_VERSION });
  },

  /** Yedeği doğrular; geçerliyse mevcut verinin YERİNE koyar. { counts, skipped } döner. */
  importAll(backup) {
    assertReady();
    return enqueue('importAll', async () => {
      const { data, skipped, counts } = validateBackup(backup, { today: todayKey(), settingValidators: SETTING_VALIDATORS });
      await state.backend.replaceAll({ ...data, meta: [] });
      await loadAll();
      log.info('İçe aktarıldı', { counts, skipped });
      emit('import', { counts });
      return { counts, skipped };
    });
  },

  /** Her şeyi siler. */
  resetAll() {
    assertReady();
    return enqueue('resetAll', async () => {
      const empty = Object.fromEntries(['habits', 'checks', 'days', 'quotes', 'settings', 'focus', 'goals', 'meta'].map((k) => [k, []]));
      await state.backend.replaceAll(empty);
      await loadAll();
      log.warn('Tüm veriler silindi');
      emit('import', { reset: true });
    });
  },
};
