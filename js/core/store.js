/**
 * Application state and the single data access point.
 *
 * Design:
 * - All data is loaded into memory on startup (small for personal use); reads are synchronous.
 * - Writes go to the database first and are applied in memory only on success,
 *   so the screen and the disk never diverge.
 * - All writes run sequentially in one queue: rapid double taps cannot race.
 * - Every change emits { type, silent } to subscribers. silent=true events
 *   (e.g. autosave while typing) do not re-render, so focus is never lost.
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
  remindersEnabled: false,
  morningTime: '08:30', // priorities reminder
  eveningTime: '21:30', // evening review reminder
  focusMinutes: 25,
  shortBreak: 5,
  longBreak: 15,
  longEvery: 4, // long break after this many focus sessions
  focusAutoCheck: true, // check the linked habit when a focus session ends
  lastExportAt: null,
});

const minutes = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;

export const SETTING_VALIDATORS = {
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

const state = {
  ready: false,
  backend: null,
  habits: [],
  checks: new Map(), // id `${date}|${habitId}` → { id, habitId, date, type: 'done'|'slip', at }
  days: new Map(), // date → { date, note, priorities, review }
  quotes: [], // user's own quotes
  settings: { ...DEFAULT_SETTINGS },
  focus: [], // focus sessions, oldest first
  goals: [],
};

const index = {
  byHabit: new Map(), // habitId → Set<date>
};

const subscribers = new Set();
let queue = Promise.resolve();
/** Incremented on every change; invalidates the summary cache. */
let version = 0;
let summaryCache = { key: null, value: null };

/* ───────────────────────── internals ───────────────────────── */

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertReady() {
  if (!state.ready) throw new Error('Store is not ready (init was not called)');
}

/** Serializes writes; a failure does not block the queue. */
function enqueue(label, fn) {
  const run = async () => {
    const end = log.time(label);
    try {
      const result = await fn();
      end();
      return result;
    } catch (e) {
      if (e instanceof V.ValidationError) log.warn(`${label}: ${e.message}`);
      else log.error(`${label} failed`, e);
      throw e;
    }
  };
  const p = queue.then(run);
  queue = p.catch(() => {});
  return p;
}

function emit(type, detail = {}) {
  version++;
  log.debug(`change: ${type}`, detail);
  subscribers.forEach((fn) => {
    try {
      fn({ type, ...detail });
    } catch (e) {
      log.error('Subscriber error', e);
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
  if (!h) throw new V.ValidationError('Habit not found.');
  return h;
}

function isEmptyDay(rec) {
  return !rec.note?.trim() && !rec.priorities?.length && !rec.review;
}

/** Loads everything from the database into memory. */
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
    else log.warn('Ignored invalid or obsolete setting', { key, value });
  }
  state.focus = focus.sort((a, b) => a.start - b.start);
  state.goals = goals.sort((a, b) => a.createdAt - b.createdAt);
  rebuildIndex();
  return { habits: habits.length, checks: checks.length, days: days.length, focus: focus.length, goals: goals.length };
}

/* ───────────────────────── public API ───────────────────────── */

export const store = {
  /* —— lifecycle —— */

  async init() {
    const end = log.time('init');
    state.backend = await openDatabase({
      onVersionChange: () => emit('db-closed'),
    });
    const counts = await loadAll();
    state.ready = true;
    end({ ...counts, backend: state.backend.kind });
  },

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

  /* —— reads —— */

  /** Non-archived habits, in order. */
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

  /** Non-archived habits that had started by that day. */
  habitsOn(date) {
    return state.habits.filter((h) => !h.archivedAt && h.createdAt <= date);
  },

  isDone(habitId, date) {
    return index.byHabit.get(habitId)?.has(date) ?? false;
  },

  /** Days a habit was marked ("done" for build habits, "slip" for quit habits). */
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
   * Full stats/points/badges summary. Not recomputed until data changes,
   * so even with years of data it runs at most once per render.
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
      focusMinutes: this.focusMinutesTotal(),
      today,
    });
    summaryCache = { key, value };
    end({ level: value.level.level, points: value.level.points });
    return value;
  },

  /** Days with any content, newest first. */
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

  /** For console inspection: window.boss.store.debugSnapshot() */
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

  /* —— habits —— */

  addHabit(input) {
    assertReady();
    return enqueue('addHabit', async () => {
      const data = V.validateHabit(input, { today: todayKey() });
      const maxOrder = state.habits.reduce((m, h) => Math.max(m, h.order), -1);
      const habit = { id: uid(), ...data, order: maxOrder + 1, archivedAt: null, updatedAt: Date.now() };
      await state.backend.put('habits', habit);
      state.habits.push(habit);
      sortHabits();
      log.info('Habit added', { id: habit.id, name: habit.name });
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
        if (hasHistory) throw new V.ValidationError('The type of a habit with history cannot be changed.');
      }
      const next = { ...current, ...data, updatedAt: Date.now() };
      await state.backend.put('habits', next);
      Object.assign(current, next);
      log.info('Habit updated', { id, name: next.name });
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
      log.info(archived ? 'Archived' : 'Restored from archive', { id });
      emit('habits', { id });
    });
  },

  /** Permanently deletes a habit and its entire history. */
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
      log.info('Habit deleted', { id, removedChecks: checkIds.length });
      emit('habits', { id });
    });
  },

  /** Moves a habit up (-1) or down (+1) in the active list. */
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

  /* —— check-ins —— */

  /** Toggles a check-in. Resolves to the new state (true = checked). */
  toggleCheck(habitId, date) {
    assertReady();
    return enqueue('toggleCheck', async () => {
      const habit = getHabitOrThrow(habitId);
      if (!isValidKey(date)) throw new V.ValidationError('Invalid date.');
      if (date > todayKey()) throw new V.ValidationError('Future days cannot be checked.');
      if (date < habit.createdAt) throw new V.ValidationError('This date is before the habit started.');

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
      log.info(on ? 'Checked' : 'Unchecked', { habit: habit.name, date });
      emit('checks', { habitId, date, on });
      return on;
    });
  },

  /* —— daily records —— */

  /**
   * Partially updates a day's record. The record is deleted once it becomes empty.
   * @param {{silent?: boolean}} opts silent: autosave while typing — do not re-render
   */
  updateDay(date, patch, { silent = false } = {}) {
    assertReady();
    return enqueue('updateDay', async () => {
      if (!isValidKey(date)) throw new V.ValidationError('Invalid date.');
      if (date > todayKey()) throw new V.ValidationError('Future days cannot have entries.');
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

  /* —— quotes —— */

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

  /* —— settings —— */

  setSetting(key, value) {
    assertReady();
    return enqueue('setSetting', async () => {
      if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting: ${key}`);
      if (SETTING_VALIDATORS[key] && !SETTING_VALIDATORS[key](value)) {
        throw new V.ValidationError(`Invalid value for setting: ${key}`);
      }
      await state.backend.put('settings', { key, value });
      state.settings = { ...state.settings, [key]: value };
      log.info('Setting changed', { key, value });
      emit('settings', { key });
    });
  },

  /* —— focus sessions —— */

  addFocusSession(input) {
    assertReady();
    return enqueue('addFocusSession', async () => {
      const rec = { id: uid(), ...V.validateFocusSession(input) };
      await state.backend.put('focus', rec);
      state.focus.push(rec);
      log.info('Focus session saved', { minutes: rec.minutes, habitId: rec.habitId });
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

  /* —— goals —— */

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
      if (!cur) throw new V.ValidationError('Goal not found.');
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

  /* —— internal records (reminder log etc.; never re-render) —— */

  async getMeta(key) {
    assertReady();
    try {
      return (await state.backend.get('meta', key))?.value ?? null;
    } catch (e) {
      log.warn('Could not read meta', { key, e });
      return null;
    }
  },

  setMeta(key, value) {
    assertReady();
    return enqueue('setMeta', () => state.backend.put('meta', { key, value }));
  },

  /* —— backup —— */

  /** Returns all user data as a backup object (ready for JSON). */
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
    return makeBackup(structuredClone(data), { version: self.BOSS_VERSION, schema: DB_VERSION });
  },

  /** Validates a backup and, if valid, REPLACES all current data. Resolves to { counts, skipped }. */
  importAll(backup) {
    assertReady();
    return enqueue('importAll', async () => {
      const { data, skipped, counts } = validateBackup(backup, { today: todayKey(), settingValidators: SETTING_VALIDATORS });
      await state.backend.replaceAll({ ...data, meta: [] });
      await loadAll();
      log.info('Imported', { counts, skipped });
      emit('import', { counts });
      return { counts, skipped };
    });
  },

  /** Deletes everything. */
  resetAll() {
    assertReady();
    return enqueue('resetAll', async () => {
      const empty = Object.fromEntries(['habits', 'checks', 'days', 'quotes', 'settings', 'focus', 'goals', 'meta'].map((k) => [k, []]));
      await state.backend.replaceAll(empty);
      await loadAll();
      log.warn('All data deleted');
      emit('import', { reset: true });
    });
  },
};
