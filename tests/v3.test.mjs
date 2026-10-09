import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/reminder-core.js';
import { addMonths, periodKey, periodRange } from '../js/core/dates.js';
import { validateGoal, validateFocusSession, ValidationError } from '../js/core/validate.js';
import { validateBackup, makeBackup } from '../js/logic/backup-schema.js';

const R = globalThis.BossReminders;

/* ───────────── periods ───────────── */

test('addMonths across year boundaries', () => {
  assert.equal(addMonths('2026-10-09', -1), '2026-09-01');
  assert.equal(addMonths('2026-01-31', -1), '2025-12-01');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-01');
  assert.equal(addMonths('2026-03-01', -14), '2025-01-01');
});

test('periodKey / periodRange', () => {
  assert.equal(periodKey('week', '2026-10-09'), '2026-W41');
  assert.equal(periodKey('month', '2026-10-09'), '2026-10');
  assert.deepEqual(periodRange('week', '2026-10-09'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(periodRange('month', '2024-02-10'), { start: '2024-02-01', end: '2024-02-29' });
});

test('goal validation', () => {
  assert.deepEqual(validateGoal({ title: ' Finish 4 books ', period: 'month', periodKey: '2026-10' }), {
    title: 'Finish 4 books',
    period: 'month',
    periodKey: '2026-10',
    done: false,
  });
  assert.throws(() => validateGoal({ title: 'x', period: 'week', periodKey: '2026-10' }), ValidationError);
  assert.throws(() => validateGoal({ title: '', period: 'week', periodKey: '2026-W41' }), /title/);
});

test('focus session validation', () => {
  const ok = validateFocusSession({ start: 1, end: 1500001, minutes: 25, date: '2026-10-09', habitId: '' });
  assert.equal(ok.habitId, null);
  assert.throws(() => validateFocusSession({ start: 10, end: 5, minutes: 25, date: '2026-10-09' }), ValidationError);
  assert.throws(() => validateFocusSession({ start: 1, end: 2, minutes: 0, date: '2026-10-09' }), ValidationError);
});

/* ───────────── reminders ───────────── */

const at = (hhmm) => new Date(`2026-10-09T${hhmm}:00`); // Friday
const base = {
  habits: [
    { id: 'a', name: 'Read', kind: 'build', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-01-01', reminder: '20:00', archivedAt: null },
    { id: 'b', name: 'Workout', kind: 'build', days: [5, 6], createdAt: '2026-01-01', reminder: '20:00', archivedAt: null },
  ],
  doneToday: new Set(),
  day: null,
  settings: { remindersEnabled: true, morningTime: '08:30', eveningTime: '21:30' },
  fired: new Set(),
};

test('nothing when reminders are off', () => {
  assert.deepEqual(R.dueReminders({ ...base, settings: { ...base.settings, remindersEnabled: false }, now: at('20:05') }), []);
});

test('a due habit scheduled today is reminded', () => {
  const due = R.dueReminders({ ...base, now: at('20:05') });
  assert.deepEqual(
    due.map((d) => d.id),
    ['h:a'],
  ); // b is not scheduled on Friday
});

test('not before the time and not after the window', () => {
  assert.deepEqual(R.dueReminders({ ...base, now: at('19:59') }), []);
  assert.deepEqual(
    R.dueReminders({ ...base, now: at('21:31') }).map((d) => d.id),
    ['evening'],
  );
  assert.deepEqual(R.dueReminders({ ...base, now: at('23:10') }), []);
});

test('done or already shown reminders do not repeat', () => {
  assert.deepEqual(R.dueReminders({ ...base, doneToday: new Set(['a']), now: at('20:05') }), []);
  assert.deepEqual(R.dueReminders({ ...base, fired: new Set(['h:a']), now: at('20:05') }), []);
});

test('morning/evening reminders stay quiet once priorities/review exist', () => {
  assert.deepEqual(
    R.dueReminders({ ...base, now: at('08:40') }).map((d) => d.id),
    ['morning'],
  );
  assert.deepEqual(R.dueReminders({ ...base, day: { priorities: [{ text: 'x' }] }, now: at('08:40') }), []);
  assert.deepEqual(R.dueReminders({ ...base, day: { review: { score: 7 } }, now: at('21:40') }), []);
});

test('firedSet resets when the day changes', () => {
  assert.equal(R.firedSet({ date: '2026-10-08', ids: ['x'] }, '2026-10-09').size, 0);
  assert.ok(R.firedSet({ date: '2026-10-09', ids: ['x'] }, '2026-10-09').has('x'));
  assert.equal(R.firedSet(null, '2026-10-09').size, 0);
});

/* ───────────── backup ───────────── */

const validators = { theme: (v) => ['system', 'dark', 'light'].includes(v), focusMinutes: (v) => Number.isInteger(v) };
const ctx = { today: '2026-10-09', settingValidators: validators };

function sample() {
  return makeBackup(
    {
      habits: [
        { id: 'h1', name: 'Read', kind: 'build', color: 'ocean', days: [0, 1, 2], createdAt: '2026-09-01', reminder: null, order: 0, archivedAt: null },
        { id: 'h2', name: 'Sugar', kind: 'quit', color: 'rose', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-09-01', reminder: null, order: 1, archivedAt: null },
      ],
      checks: [
        { id: '2026-10-01|h1', habitId: 'h1', date: '2026-10-01', type: 'done', at: 1 },
        { id: 'x', habitId: 'h2', date: '2026-10-02', type: 'done', at: 1 }, // type corrected → slip
        { id: 'y', habitId: 'unknown', date: '2026-10-02', type: 'done' }, // unknown habit → skipped
        { id: 'z', habitId: 'h1', date: '2030-01-01', type: 'done' }, // future → skipped
      ],
      days: [
        { date: '2026-10-01', note: 'Note', priorities: [{ text: 'a', done: true }], review: { score: 8, mood: 4 } },
        { date: '2026-10-02', note: '', review: { score: 99 } }, // broken review, empty day → skipped
      ],
      quotes: [
        { id: 'u-1', text: 'My own quote', author: '' },
        { id: 'b01', text: 'built-in', author: '' },
      ],
      settings: [
        { key: 'theme', value: 'light' },
        { key: 'theme2', value: 1 },
        { key: 'focusMinutes', value: 'lots' },
      ],
      focus: [{ id: 'f1', start: 1, end: 2, minutes: 25, date: '2026-10-01', habitId: 'deleted' }],
      goals: [{ id: 'g1', title: 'Goal', period: 'week', periodKey: '2026-W41', done: true, createdAt: 1 }],
    },
    { version: '4.0.0', schema: 2, now: new Date('2026-10-09T10:00:00Z') },
  );
}

test('backup: valid records are kept, broken ones skipped and counted', () => {
  const { data, skipped, counts } = validateBackup(sample(), ctx);
  assert.equal(counts.habits, 2);
  assert.equal(counts.checks, 2);
  assert.equal(data.checks.find((c) => c.habitId === 'h2').type, 'slip');
  assert.equal(data.checks.find((c) => c.habitId === 'h2').id, '2026-10-02|h2');
  assert.equal(counts.days, 1);
  assert.equal(counts.quotes, 1);
  assert.deepEqual(data.settings, [{ key: 'theme', value: 'light' }]);
  assert.equal(data.focus[0].habitId, null);
  assert.equal(counts.goals, 1);
  // skipped: 2 checks + 1 broken review + 1 empty day + 1 quote + 2 settings = 7
  assert.equal(skipped, 7);
});

test('backup: wrong files are rejected', () => {
  assert.throws(() => validateBackup({ hello: 1 }, ctx), /not a BOSS backup/);
  assert.throws(() => validateBackup(null, ctx), ValidationError);
  assert.throws(() => validateBackup({ app: 'boss', format: 99, data: {} }, ctx), /newer version/);
  assert.throws(() => validateBackup({ app: 'boss', format: 1, data: { habits: 'x' } }, ctx), /corrupted/);
});

test('backup: duplicate check-ins count once', () => {
  const b = sample();
  b.data.checks.push({ ...b.data.checks[0] });
  assert.equal(validateBackup(b, ctx).counts.checks, 2);
});

test('backup: an exported backup round-trips unchanged', () => {
  const first = validateBackup(sample(), ctx).data;
  const again = validateBackup(makeBackup(first, { version: '4.0.0', schema: 2 }), ctx);
  assert.equal(again.skipped, 0);
  assert.deepEqual(again.data, first);
});
