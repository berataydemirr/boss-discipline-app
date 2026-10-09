import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, bestStreak, completionRate, quitStats, isScheduled } from '../js/logic/streaks.js';
import { addDays } from '../js/core/dates.js';

const every = { createdAt: '2026-09-01', days: [0, 1, 2, 3, 4, 5, 6] };
const weekdays = { createdAt: '2026-09-01', days: [0, 1, 2, 3, 4] };
const set = (...d) => new Set(d);
const range = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));

// 2026-10-09 Cuma
const TODAY = '2026-10-09';

test('bugün henüz yapılmadıysa seri bozulmaz', () => {
  assert.equal(currentStreak(every, set('2026-10-07', '2026-10-08'), TODAY), 2);
});

test('bugün yapıldıysa seriye eklenir', () => {
  assert.equal(currentStreak(every, set('2026-10-07', '2026-10-08', TODAY), TODAY), 3);
});

test('dün kaçırıldıysa seri 0', () => {
  assert.equal(currentStreak(every, set('2026-10-06', '2026-10-07'), TODAY), 0);
});

test('planlı olmayan günler (hafta sonu) seriyi bozmaz', () => {
  // Pazartesi 2026-10-12 itibarıyla: Perşembe ve Cuma yapılmış, hafta sonu boş
  assert.equal(currentStreak(weekdays, set('2026-10-08', '2026-10-09'), '2026-10-12'), 2);
  assert.equal(currentStreak(weekdays, set('2026-10-08', '2026-10-09', '2026-10-12'), '2026-10-12'), 3);
});

test('başlangıçtan önce durur', () => {
  const h = { createdAt: '2026-10-08', days: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(currentStreak(h, set('2026-10-08', TODAY, '2026-10-01'), TODAY), 2);
});

test('hiç işaret yoksa 0', () => {
  assert.equal(currentStreak(every, set(), TODAY), 0);
  assert.equal(bestStreak(every, set(), TODAY), 0);
});

test('en iyi seri', () => {
  const done = set(...range('2026-09-01', 5), ...range('2026-09-10', 9), '2026-10-08');
  assert.equal(bestStreak(every, done, TODAY), 9);
});

test('en iyi seri bugünü bekleyen seriyi sıfırlamaz', () => {
  const done = set(...range('2026-10-01', 8)); // 10-01..10-08
  assert.equal(bestStreak({ createdAt: '2026-10-01', days: every.days }, done, TODAY), 8);
});

test('başarı oranı: bugün yapılmadıysa paydaya girmez', () => {
  const h = { createdAt: '2026-10-05', days: [0, 1, 2, 3, 4, 5, 6] };
  const r = completionRate(h, set('2026-10-05', '2026-10-06', '2026-10-08'), '2026-10-01', TODAY, TODAY);
  assert.deepEqual(r, { done: 3, total: 4, rate: 0.75 });
  const r2 = completionRate(h, set('2026-10-05', TODAY), '2026-10-01', TODAY, TODAY);
  assert.equal(r2.total, 5);
  assert.equal(r2.done, 2);
});

test('başarı oranı: aralık başlangıçtan önceyse null', () => {
  const r = completionRate({ createdAt: TODAY, days: every.days }, set(), '2026-10-01', '2026-10-05', TODAY);
  assert.equal(r.rate, null);
});

test('isScheduled', () => {
  assert.ok(isScheduled(weekdays, '2026-10-09'));
  assert.ok(!isScheduled(weekdays, '2026-10-10'));
});

test('bırakma: kayma yoksa başlangıçtan bu yana tamamlanan gün', () => {
  const h = { createdAt: '2026-10-01' };
  assert.deepEqual(quitStats(h, [], TODAY), { current: 8, best: 8, slips: 0, slippedToday: false });
  assert.equal(quitStats({ createdAt: TODAY }, [], TODAY).current, 0);
});

test('bırakma: kaymadan sonra sayaç sıfırlanır, en iyi korunur', () => {
  const h = { createdAt: '2026-09-01' };
  // 09-01..09-20 temiz (20 gün), 09-21 kayma, 09-22..10-04 temiz (13), 10-05 kayma
  const s = quitStats(h, ['2026-10-05', '2026-09-21'], TODAY);
  assert.equal(s.slips, 2);
  assert.equal(s.best, 20);
  assert.equal(s.current, 3); // 10-06, 10-07, 10-08
  assert.equal(s.slippedToday, false);
});

test('bırakma: bugün kayma', () => {
  const s = quitStats({ createdAt: '2026-10-01' }, [TODAY], TODAY);
  assert.equal(s.current, 0);
  assert.ok(s.slippedToday);
  assert.equal(s.best, 8);
});

test('bırakma: başlangıç öncesi ve gelecek kaymaları yok sayılır', () => {
  const s = quitStats({ createdAt: '2026-10-01' }, ['2026-09-15', '2026-12-01'], TODAY);
  assert.equal(s.slips, 0);
  assert.equal(s.current, 8);
});
