import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/reminder-core.js';
import { addMonths, periodKey, periodRange } from '../js/core/dates.js';
import { validateGoal, validateFocusSession, ValidationError } from '../js/core/validate.js';
import { validateBackup, makeBackup } from '../js/logic/backup-schema.js';

const R = globalThis.DisiplinReminders;

/* ───────────── dönemler ───────────── */

test('addMonths yıl sınırında', () => {
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

test('hedef doğrulama', () => {
  assert.deepEqual(validateGoal({ title: ' 4 kitap ', period: 'month', periodKey: '2026-10' }), {
    title: '4 kitap',
    period: 'month',
    periodKey: '2026-10',
    done: false,
  });
  assert.throws(() => validateGoal({ title: 'x', period: 'week', periodKey: '2026-10' }), ValidationError);
  assert.throws(() => validateGoal({ title: '', period: 'week', periodKey: '2026-W41' }), /başlık/);
});

test('odak oturumu doğrulama', () => {
  const ok = validateFocusSession({ start: 1, end: 1500001, minutes: 25, date: '2026-10-09', habitId: '' });
  assert.equal(ok.habitId, null);
  assert.throws(() => validateFocusSession({ start: 10, end: 5, minutes: 25, date: '2026-10-09' }), ValidationError);
  assert.throws(() => validateFocusSession({ start: 1, end: 2, minutes: 0, date: '2026-10-09' }), ValidationError);
});

/* ───────────── hatırlatıcılar ───────────── */

const at = (hhmm) => new Date(`2026-10-09T${hhmm}:00`); // Cuma
const base = {
  habits: [
    { id: 'a', name: 'Kitap', kind: 'build', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-01-01', reminder: '20:00', archivedAt: null },
    { id: 'b', name: 'Spor', kind: 'build', days: [5, 6], createdAt: '2026-01-01', reminder: '20:00', archivedAt: null },
  ],
  doneToday: new Set(),
  day: null,
  settings: { remindersEnabled: true, morningTime: '08:30', eveningTime: '21:30' },
  fired: new Set(),
};

test('kapalıyken hiçbir şey dönmez', () => {
  assert.deepEqual(R.dueReminders({ ...base, settings: { ...base.settings, remindersEnabled: false }, now: at('20:05') }), []);
});

test('saati gelen ve bugün planlı alışkanlık hatırlatılır', () => {
  const due = R.dueReminders({ ...base, now: at('20:05') });
  assert.deepEqual(due.map((d) => d.id), ['h:a']); // b cuma planlı değil
});

test('saatten önce ve pencere geçtikten sonra hatırlatılmaz', () => {
  assert.deepEqual(R.dueReminders({ ...base, now: at('19:59') }), []);
  assert.deepEqual(R.dueReminders({ ...base, now: at('21:31') }).map((d) => d.id), ['evening']);
  assert.deepEqual(R.dueReminders({ ...base, now: at('23:10') }), []);
});

test('yapılmış ya da daha önce gösterilmiş olan tekrar gelmez', () => {
  assert.deepEqual(R.dueReminders({ ...base, doneToday: new Set(['a']), now: at('20:05') }), []);
  assert.deepEqual(R.dueReminders({ ...base, fired: new Set(['h:a']), now: at('20:05') }), []);
});

test('öncelik ve değerlendirme varsa sabah/akşam hatırlatması susar', () => {
  assert.deepEqual(R.dueReminders({ ...base, now: at('08:40') }).map((d) => d.id), ['morning']);
  assert.deepEqual(R.dueReminders({ ...base, day: { priorities: [{ text: 'x' }] }, now: at('08:40') }), []);
  assert.deepEqual(R.dueReminders({ ...base, day: { review: { score: 7 } }, now: at('21:40') }), []);
});

test('firedSet gün değişince sıfırlanır', () => {
  assert.equal(R.firedSet({ date: '2026-10-08', ids: ['x'] }, '2026-10-09').size, 0);
  assert.ok(R.firedSet({ date: '2026-10-09', ids: ['x'] }, '2026-10-09').has('x'));
  assert.equal(R.firedSet(null, '2026-10-09').size, 0);
});

/* ───────────── yedek ───────────── */

const validators = { theme: (v) => ['system', 'dark', 'light'].includes(v), focusMinutes: (v) => Number.isInteger(v) };
const ctx = { today: '2026-10-09', settingValidators: validators };

function sample() {
  return makeBackup(
    {
      habits: [
        { id: 'h1', name: 'Kitap', kind: 'build', color: 'deniz', days: [0, 1, 2], createdAt: '2026-09-01', reminder: null, order: 0, archivedAt: null },
        { id: 'h2', name: 'Şeker', kind: 'quit', color: 'gul', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-09-01', reminder: null, order: 1, archivedAt: null },
      ],
      checks: [
        { id: '2026-10-01|h1', habitId: 'h1', date: '2026-10-01', type: 'done', at: 1 },
        { id: 'x', habitId: 'h2', date: '2026-10-02', type: 'done', at: 1 }, // tür düzeltilmeli → slip
        { id: 'y', habitId: 'yok', date: '2026-10-02', type: 'done' }, // bilinmeyen alışkanlık → atla
        { id: 'z', habitId: 'h1', date: '2030-01-01', type: 'done' }, // gelecek → atla
      ],
      days: [
        { date: '2026-10-01', note: 'Not', priorities: [{ text: 'a', done: true }], review: { score: 8, mood: 4 } },
        { date: '2026-10-02', note: '', review: { score: 99 } }, // bozuk değerlendirme, boş gün → atla
      ],
      quotes: [{ id: 'u-1', text: 'Benim sözüm', author: '' }, { id: 'b01', text: 'yerleşik', author: '' }],
      settings: [{ key: 'theme', value: 'light' }, { key: 'theme2', value: 1 }, { key: 'focusMinutes', value: 'çok' }],
      focus: [{ id: 'f1', start: 1, end: 2, minutes: 25, date: '2026-10-01', habitId: 'silinmiş' }],
      goals: [{ id: 'g1', title: 'Hedef', period: 'week', periodKey: '2026-W41', done: true, createdAt: 1 }],
    },
    { version: '3.0.0', schema: 2, now: new Date('2026-10-09T10:00:00Z') },
  );
}

test('yedek: geçerli kayıtlar alınır, bozuklar atlanır ve sayılır', () => {
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
  // atlananlar: 2 işaret + 1 bozuk değerlendirme + 1 boş gün + 1 söz + 2 ayar = 7
  assert.equal(skipped, 7);
});

test('yedek: yanlış dosya reddedilir', () => {
  assert.throws(() => validateBackup({ hello: 1 }, ctx), /BOSS yedeği değil/);
  assert.throws(() => validateBackup(null, ctx), ValidationError);
  assert.throws(() => validateBackup({ app: 'disiplin', format: 99, data: {} }, ctx), /daha yeni/);
  assert.throws(() => validateBackup({ app: 'disiplin', format: 1, data: { habits: 'x' } }, ctx), /bozuk/);
});

test('yedek: tekrar eden işaret tek sayılır', () => {
  const b = sample();
  b.data.checks.push({ ...b.data.checks[0] });
  assert.equal(validateBackup(b, ctx).counts.checks, 2);
});

test('yedek: dışa aktarılan yedek aynen geri alınabilir (tur testi)', () => {
  const first = validateBackup(sample(), ctx).data;
  const again = validateBackup(makeBackup(first, { version: '3.0.0', schema: 2 }), ctx);
  assert.equal(again.skipped, 0);
  assert.deepEqual(again.data, first);
});
