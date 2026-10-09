import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCompletion, weeklyRates, weekdayPattern, perfectDays, moodCorrelation, isActiveOn, reviewAverages } from '../js/logic/stats.js';
import { computePoints, levelFor, pointsForLevel, evaluateBadges } from '../js/logic/gamification.js';
import { buildSummary } from '../js/logic/summary.js';
import { validatePriorities, validateReview, ValidationError } from '../js/core/validate.js';
import { addDays } from '../js/core/dates.js';

const TODAY = '2026-10-09'; // Friday
const all = [0, 1, 2, 3, 4, 5, 6];

function fixture() {
  const habits = [
    { id: 'a', kind: 'build', days: all, createdAt: '2026-10-01', archivedAt: null },
    { id: 'b', kind: 'build', days: [0, 1, 2, 3, 4], createdAt: '2026-10-01', archivedAt: null },
    { id: 'q', kind: 'quit', days: all, createdAt: '2026-10-01', archivedAt: null },
  ];
  const done = new Map([
    ['a', new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])],
    ['b', new Set(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'])],
    ['q', new Set(['2026-10-04'])],
  ]);
  const isDone = (id, k) => done.get(id)?.has(k) ?? false;
  const datesFor = (id) => done.get(id) ?? new Set();
  return { habits, isDone, datesFor };
}

test('dayCompletion counts only scheduled, active build habits', () => {
  const { habits, isDone } = fixture();
  assert.deepEqual(dayCompletion(habits, isDone, '2026-10-03'), { done: 1, total: 1, ratio: 1 }); // Saturday: b not scheduled
  assert.deepEqual(dayCompletion(habits, isDone, '2026-10-07'), { done: 1, total: 2, ratio: 0.5 });
  assert.equal(dayCompletion(habits, isDone, '2026-09-30').ratio, null); // before the start
});

test('an archived habit stops counting on its archive day', () => {
  const h = { createdAt: '2026-10-01', archivedAt: '2026-10-05' };
  assert.ok(isActiveOn(h, '2026-10-04'));
  assert.ok(!isActiveOn(h, '2026-10-05'));
});

test('perfectDays count and longest run', () => {
  const { habits, isDone } = fixture();
  // perfect days: 01, 02, 03 (Sat), 04 (Sun), 05, 06 → 6 in a row; 07 and 08 incomplete
  assert.deepEqual(perfectDays(habits, isDone, '2026-10-01', TODAY), { count: 6, bestRun: 6 });
});

test('weeklyRates: unchecked habits today are not in the denominator', () => {
  const { habits, isDone } = fixture();
  const w = weeklyRates(habits, isDone, TODAY, 2);
  assert.equal(w.length, 2);
  assert.equal(w[1].start, '2026-10-05');
  // 05: 2/2, 06: 2/2, 07: 1/2, 08: 1/2, 09 (today, nothing done): 0/0 → 6/8
  assert.equal(w[1].done, 6);
  assert.equal(w[1].total, 8);
  // previous week: 01 (Thu) 2/2, 02 2/2, 03 1/1, 04 1/1 → 6/6
  assert.equal(w[0].rate, 1);
});

test('weekdayPattern returns 7 days', () => {
  const { habits, isDone } = fixture();
  const p = weekdayPattern(habits, isDone, '2026-10-01', TODAY);
  assert.equal(p.length, 7);
  assert.equal(p[5].rate, 1); // Saturday
  assert.equal(p[2].rate, 0.5); // Wednesday 10-07: 1/2
});

test('moodCorrelation is empty without enough samples', () => {
  const { habits, isDone } = fixture();
  assert.deepEqual(moodCorrelation(habits, isDone, [{ date: '2026-10-01', review: { mood: 5 } }]), []);
});

test('moodCorrelation computes the difference', () => {
  const habits = [{ id: 'a', kind: 'build', days: all, createdAt: '2026-01-01' }];
  const doneDays = new Set();
  const days = [];
  for (let i = 0; i < 10; i++) {
    const k = addDays('2026-01-01', i);
    if (i % 2 === 0) doneDays.add(k);
    days.push({ date: k, review: { mood: i % 2 === 0 ? 5 : 3 } });
  }
  const r = moodCorrelation(habits, (id, k) => doneDays.has(k), days);
  assert.equal(r.length, 1);
  assert.equal(r[0].delta, 2);
  assert.equal(r[0].nWith, 5);
});

test('reviewAverages', () => {
  const r = reviewAverages(
    [
      { date: '2026-10-01', review: { score: 8, mood: 4, energy: null } },
      { date: '2026-10-02', review: { score: 6, mood: 2, energy: 3 } },
      { date: '2026-09-01', review: { score: 1, mood: 1, energy: 1 } },
    ],
    '2026-10-01',
    TODAY,
  );
  assert.deepEqual(r, { count: 2, score: 7, mood: 3, energy: 3 });
});

test('level thresholds', () => {
  assert.equal(pointsForLevel(1), 0);
  assert.equal(pointsForLevel(2), 300);
  assert.equal(pointsForLevel(3), 750);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(299).level, 1);
  assert.equal(levelFor(300).level, 2);
  assert.equal(levelFor(760).level, 3);
  assert.ok(Math.abs(levelFor(525).progress - 0.5) < 1e-9);
  assert.equal(levelFor(1e7).title, 'Boss');
});

test('points', () => {
  assert.equal(computePoints({ checks: 3, perfectDays: 1, reviews: 2, cleanDays: 4, focusMinutes: 25 }), 30 + 5 + 6 + 8 + 2);
});

test('badges', () => {
  const b = evaluateBadges({ checks: 1, bestStreak: 8, perfectDays: 0, perfectRun: 0, reviews: 0, notes: 0, quitBest: 0, focusMinutes: 0 });
  assert.ok(b.find((x) => x.id === 'first-step').earned);
  assert.ok(b.find((x) => x.id === 'streak-7').earned);
  assert.ok(!b.find((x) => x.id === 'streak-30').earned);
  assert.ok(Math.abs(b.find((x) => x.id === 'streak-30').progress - 8 / 30) < 1e-9);
});

test('summary: totals are consistent', () => {
  const { habits, isDone, datesFor } = fixture();
  const days = [{ date: '2026-10-08', note: 'x', review: { score: 7 } }];
  const s = buildSummary({ habits, isDone, datesFor, days, today: TODAY });
  assert.equal(s.totals.checks, 12);
  assert.equal(s.totals.perfectDays, 6);
  assert.equal(s.totals.reviews, 1);
  assert.equal(s.perHabit.get('a').current, 8);
  assert.equal(s.perHabit.get('q').current, 4); // 10-05..10-08
  assert.equal(s.perHabit.get('q').slips, 1);
  // clean days: 8 full days − 1 slip = 7 → 14 points; 12*10 + 6*5 + 3 + 14 = 167
  assert.equal(s.level.points, 167);
  assert.equal(s.level.level, 1);
});

test('priority validation', () => {
  assert.deepEqual(validatePriorities([{ text: ' a ' }, { text: '' }, { text: 'b', done: 1 }, { text: 'c' }]), [
    { text: 'a', done: false },
    { text: 'b', done: true },
  ]);
});

test('review validation', () => {
  assert.equal(validateReview(null), null);
  assert.throws(() => validateReview({ score: 11 }), ValidationError);
  assert.throws(() => validateReview({ mood: 3 }), /Rate your day/);
  assert.deepEqual(validateReview({ score: '7', mood: 4, good: ' good ', improve: '' }), { score: 7, mood: 4, energy: null, good: 'good', improve: '' });
});
