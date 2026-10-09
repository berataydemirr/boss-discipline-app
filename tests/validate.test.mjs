import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHabit, validateQuote, ValidationError, cleanText, cleanMultiline } from '../js/core/validate.js';

const today = '2026-10-09';

test('geçerli alışkanlık normalleştirilir', () => {
  const h = validateHabit({ name: '  Kitap   oku ', days: [3, 1, 1, '2'], color: 'deniz' }, { today });
  assert.deepEqual(h, { name: 'Kitap oku', kind: 'build', color: 'deniz', days: [1, 2, 3], createdAt: today, reminder: null });
});

test('ad zorunlu', () => {
  assert.throws(() => validateHabit({ name: '   ', days: [1] }, { today }), ValidationError);
});

test('en az bir gün', () => {
  assert.throws(() => validateHabit({ name: 'x', days: [] }, { today }), /En az bir gün/);
  assert.throws(() => validateHabit({ name: 'x', days: [9, -1] }, { today }), ValidationError);
});

test('bırakılacak alışkanlık her gün planlıdır', () => {
  assert.deepEqual(validateHabit({ name: 'Sigara', kind: 'quit', days: [] }, { today }).days, [0, 1, 2, 3, 4, 5, 6]);
});

test('bilinmeyen tür ve renk', () => {
  assert.throws(() => validateHabit({ name: 'x', kind: 'zz', days: [1] }, { today }), ValidationError);
  assert.equal(validateHabit({ name: 'x', color: '#fff', days: [1] }, { today }).color, 'kiremit');
});

test('başlangıç tarihi', () => {
  assert.throws(() => validateHabit({ name: 'x', days: [1], createdAt: '2026-10-10' }, { today }), /gelecekte/);
  assert.throws(() => validateHabit({ name: 'x', days: [1], createdAt: '2026-02-30' }, { today }), ValidationError);
  assert.equal(validateHabit({ name: 'x', days: [1], createdAt: '2026-01-01' }, { today }).createdAt, '2026-01-01');
});

test('hatırlatma saati', () => {
  assert.equal(validateHabit({ name: 'x', days: [1], reminder: '07:15' }, { today }).reminder, '07:15');
  assert.throws(() => validateHabit({ name: 'x', days: [1], reminder: '7:15' }, { today }), ValidationError);
});

test('ad 60 karakterde kırpılır', () => {
  assert.equal(validateHabit({ name: 'a'.repeat(100), days: [1] }, { today }).name.length, 60);
});

test('söz doğrulama', () => {
  assert.deepEqual(validateQuote({ text: '  Az  ama öz ', author: ' Ben ' }), { text: 'Az ama öz', author: 'Ben' });
  assert.throws(() => validateQuote({ text: 'a' }), ValidationError);
});

test('metin temizleme', () => {
  assert.equal(cleanText(null, 10), '');
  assert.equal(cleanMultiline('a  \r\nb\t\nc', 100), 'a\nb\nc');
});
