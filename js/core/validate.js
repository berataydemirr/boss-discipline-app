/**
 * Input validation and normalization. PURE module.
 * Everything written to the store passes through here; the UI receives a readable error message.
 */
import { isValidKey, isValidTime } from './dates.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Habit colors. The order is deliberate: neighbors stay distinguishable for normal and
 * color-blind vision (checked with a palette validator). Color never carries identity
 * alone; it is always shown next to the habit name.
 */
export const HABIT_COLORS = [
  { id: 'ember', name: 'Ember', hex: '#d65f34' },
  { id: 'ocean', name: 'Ocean', hex: '#5592da' },
  { id: 'ochre', name: 'Ochre', hex: '#bd8a28' },
  { id: 'teal', name: 'Teal', hex: '#2fa38e' },
  { id: 'plum', name: 'Plum', hex: '#a679d4' },
  { id: 'olive', name: 'Olive', hex: '#879c38' },
  { id: 'rose', name: 'Rose', hex: '#d96c86' },
];

export function colorHex(id) {
  return (HABIT_COLORS.find((c) => c.id === id) ?? HABIT_COLORS[0]).hex;
}

/** Single-line text: collapses whitespace and truncates. */
export function cleanText(v, max) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Multi-line text: keeps line breaks, strips trailing spaces. */
export function cleanMultiline(v, max) {
  return String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .slice(0, max);
}

export function validateHabit(input, { today }) {
  if (!input || typeof input !== 'object') throw new ValidationError('Invalid habit data.');

  const name = cleanText(input.name, 60);
  if (!name) throw new ValidationError('Give the habit a name.');

  if (input.kind != null && input.kind !== 'build' && input.kind !== 'quit') {
    throw new ValidationError(`Unknown habit type: ${input.kind}`);
  }
  const kind = input.kind === 'quit' ? 'quit' : 'build';

  const color = HABIT_COLORS.some((c) => c.id === input.color) ? input.color : HABIT_COLORS[0].id;

  let days = Array.isArray(input.days)
    ? [...new Set(input.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if (kind === 'quit') days = [0, 1, 2, 3, 4, 5, 6];
  if (!days.length) throw new ValidationError('Pick at least one day.');

  const createdAt = input.createdAt ?? today;
  if (!isValidKey(createdAt)) throw new ValidationError('Invalid start date.');
  if (createdAt > today) throw new ValidationError('The start date cannot be in the future.');

  let reminder = null;
  if (input.reminder) {
    if (!isValidTime(input.reminder)) throw new ValidationError('Reminder time must be in HH:MM format.');
    reminder = input.reminder;
  }

  return { name, kind, color, days, createdAt, reminder };
}

export function validateQuote(input) {
  const text = cleanText(input?.text, 400);
  if (text.length < 3) throw new ValidationError('A quote must be at least 3 characters.');
  const author = cleanText(input?.author, 80);
  return { text, author };
}

export const MAX_PRIORITIES = 3;

const PERIOD_KEY_RE = { week: /^\d{4}-W\d{2}$/, month: /^\d{4}-\d{2}$/ };

export function validateGoal(input) {
  const title = cleanText(input?.title, 120);
  if (!title) throw new ValidationError('Give the goal a title.');
  const period = input?.period === 'month' ? 'month' : input?.period === 'week' ? 'week' : null;
  if (!period) throw new ValidationError('A goal period must be a week or a month.');
  if (!PERIOD_KEY_RE[period].test(input?.periodKey ?? '')) throw new ValidationError('Invalid goal period.');
  return { title, period, periodKey: input.periodKey, done: !!input.done };
}

export function validateFocusSession(input) {
  const start = Number(input?.start);
  const end = Number(input?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new ValidationError('Invalid focus session time.');
  const minutes = Math.round(Number(input?.minutes));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new ValidationError('Focus length must be 1–600 minutes.');
  if (!isValidKey(input?.date)) throw new ValidationError('Invalid focus session date.');
  const habitId = typeof input?.habitId === 'string' && input.habitId ? input.habitId : null;
  return { start, end, minutes, date: input.date, habitId };
}

/** Daily priorities: at most 3, empty entries are dropped. */
export function validatePriorities(list) {
  if (!Array.isArray(list)) throw new ValidationError('Priorities must be a list.');
  return list
    .slice(0, MAX_PRIORITIES)
    .map((p) => ({ text: cleanText(p?.text, 120), done: !!p?.done }))
    .filter((p) => p.text);
}

function scale(v, min, max, label) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${label} must be between ${min} and ${max}.`);
  return n;
}

/** Evening review. null → delete the review. */
export function validateReview(input) {
  if (input == null) return null;
  const review = {
    score: scale(input.score, 1, 10, 'Day score'),
    mood: scale(input.mood, 1, 5, 'Mood'),
    energy: scale(input.energy, 1, 5, 'Energy'),
    good: cleanMultiline(input.good, 1000).trim(),
    improve: cleanMultiline(input.improve, 1000).trim(),
  };
  if (review.score == null) throw new ValidationError('Rate your day from 1 to 10.');
  return review;
}
