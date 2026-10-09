import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHabit, validateQuote, ValidationError, cleanText, cleanMultiline } from '../js/core/validate.js';

const today = '2026-10-09';

test('a valid habit is normalized', () => {
  const h = validateHabit({ name: '  Read   books ', days: [3, 1, 1, '2'], color: 'ocean' }, { today });
  assert.deepEqual(h, { name: 'Read books', kind: 'build', color: 'ocean', days: [1, 2, 3], createdAt: today, reminder: null });
});

test('name is required', () => {
  assert.throws(() => validateHabit({ name: '   ', days: [1] }, { today }), ValidationError);
});

test('at least one day', () => {
  assert.throws(() => validateHabit({ name: 'x', days: [] }, { today }), /at least one day/);
  assert.throws(() => validateHabit({ name: 'x', days: [9, -1] }, { today }), ValidationError);
});

test('quit habits are scheduled every day', () => {
  assert.deepEqual(validateHabit({ name: 'Sugar', kind: 'quit', days: [] }, { today }).days, [0, 1, 2, 3, 4, 5, 6]);
});

test('unknown type and color', () => {
  assert.throws(() => validateHabit({ name: 'x', kind: 'zz', days: [1] }, { today }), ValidationError);
  assert.equal(validateHabit({ name: 'x', color: '#fff', days: [1] }, { today }).color, 'ember');
});

test('start date', () => {
  assert.throws(() => validateHabit({ name: 'x', days: [1], createdAt: '2026-10-10' }, { today }), /future/);
  assert.throws(() => validateHabit({ name: 'x', days: [1], createdAt: '2026-02-30' }, { today }), ValidationError);
  assert.equal(validateHabit({ name: 'x', days: [1], createdAt: '2026-01-01' }, { today }).createdAt, '2026-01-01');
});

test('reminder time', () => {
  assert.equal(validateHabit({ name: 'x', days: [1], reminder: '07:15' }, { today }).reminder, '07:15');
  assert.throws(() => validateHabit({ name: 'x', days: [1], reminder: '7:15' }, { today }), ValidationError);
});

test('name is truncated to 60 characters', () => {
  assert.equal(validateHabit({ name: 'a'.repeat(100), days: [1] }, { today }).name.length, 60);
});

test('quote validation', () => {
  assert.deepEqual(validateQuote({ text: '  Less  but better ', author: ' Me ' }), { text: 'Less but better', author: 'Me' });
  assert.throws(() => validateQuote({ text: 'a' }), ValidationError);
});

test('text cleanup', () => {
  assert.equal(cleanText(null, 10), '');
  assert.equal(cleanMultiline('a  \r\nb\t\nc', 100), 'a\nb\nc');
});
