import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/core/dates.js';

test('toKey yerel tarihi kullanır (UTC kaymasına düşmez)', () => {
  assert.equal(D.toKey(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
  assert.equal(D.toKey(new Date(2026, 9, 9, 0, 1)), '2026-10-09');
  assert.throws(() => D.toKey(new Date('x')));
});

test('isValidKey', () => {
  assert.ok(D.isValidKey('2024-02-29'));
  assert.ok(!D.isValidKey('2025-02-29'));
  assert.ok(!D.isValidKey('2026-13-01'));
  assert.ok(!D.isValidKey('2026-1-01'));
  assert.ok(!D.isValidKey(null));
});

test('addDays / diffDays ay, yıl ve artık yıl sınırlarında doğru', () => {
  assert.equal(D.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(D.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(D.addDays('2026-03-29', 1), '2026-03-30'); // AB yaz saati geçişi
  assert.equal(D.diffDays('2026-01-01', '2026-01-03'), 2);
  assert.equal(D.diffDays('2026-01-03', '2026-01-01'), -2);
  assert.equal(D.diffDays('2025-01-01', '2026-01-01'), 365);
});

test('weekday Pazartesi=0', () => {
  assert.equal(D.weekday('2026-10-05'), 0); // Pazartesi
  assert.equal(D.weekday('2026-10-09'), 4); // Cuma
  assert.equal(D.weekday('2026-10-11'), 6); // Pazar
  assert.equal(D.startOfWeek('2026-10-11'), '2026-10-05');
  assert.equal(D.startOfWeek('2026-10-05'), '2026-10-05');
});

test('ISO hafta numarası', () => {
  assert.equal(D.weekKey('2026-10-09'), '2026-W41');
  assert.equal(D.weekKey('2021-01-03'), '2020-W53');
  assert.equal(D.weekKey('2024-12-30'), '2025-W01');
  assert.equal(D.weekKey('2026-01-01'), '2026-W01');
});

test('ay sınırları ve biçimler', () => {
  assert.equal(D.endOfMonth('2024-02-10'), '2024-02-29');
  assert.equal(D.endOfMonth('2026-12-01'), '2026-12-31');
  assert.equal(D.startOfMonth('2026-10-09'), '2026-10-01');
  assert.equal(D.formatLong('2026-10-09'), '9 Ekim Cuma');
  assert.equal(D.formatMonthYear('2026-02-01'), 'Şubat 2026');
  assert.equal(D.relativeLabel('2026-10-08', '2026-10-09'), 'Dün');
  assert.equal(D.relativeLabel('2026-10-09', '2026-10-09'), 'Bugün');
});

test('eachDay kapsayıcı aralık', () => {
  assert.deepEqual(D.daysBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(D.daysBetween('2026-01-02', '2026-01-01'), []);
});

test('saat ayrıştırma', () => {
  assert.equal(D.parseTime('08:30'), 510);
  assert.equal(D.parseTime('24:00'), null);
  assert.equal(D.parseTime('8:30'), null);
  assert.ok(D.isValidTime('23:59'));
});
