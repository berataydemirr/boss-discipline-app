import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_QUOTES, pickForDate, quotePool } from '../js/logic/quotes.js';
import { addDays } from '../js/core/dates.js';

test('built-in quote ids are unique and texts are non-empty', () => {
  const ids = BUILTIN_QUOTES.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  BUILTIN_QUOTES.forEach((q) => {
    assert.ok(q.text.length > 3, q.id);
    assert.ok(q.author.length > 1, q.id);
  });
});

test('same day, same quote', () => {
  assert.equal(pickForDate(BUILTIN_QUOTES, '2026-10-09').id, pickForDate(BUILTIN_QUOTES, '2026-10-09').id);
});

test('no quote repeats within a cycle', () => {
  const n = BUILTIN_QUOTES.length;
  const start = addDays('2024-01-01', n * 7); // first day of a cycle
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(pickForDate(BUILTIN_QUOTES, addDays(start, i)).id);
  assert.equal(seen.size, n);
});

test('pool order does not affect the result', () => {
  const rev = [...BUILTIN_QUOTES].reverse();
  assert.equal(pickForDate(rev, '2026-03-14').id, pickForDate(BUILTIN_QUOTES, '2026-03-14').id);
});

test('an empty pool returns null; a single quote is shown every day', () => {
  assert.equal(pickForDate([], '2026-10-09'), null);
  const one = [{ id: 'x', text: 'a', author: '' }];
  assert.equal(pickForDate(one, '2020-01-01').id, 'x');
});

test('an empty source falls back to all quotes', () => {
  const mine = [{ id: 'u-1', text: 'Mine', author: '' }];
  assert.equal(quotePool([], 'mine', []).length, BUILTIN_QUOTES.length);
  assert.deepEqual(quotePool(mine, 'mine', []), mine);
  assert.equal(quotePool(mine, 'favorites', ['b01', 'u-1']).length, 2);
  assert.equal(quotePool(mine, 'favorites', []).length, BUILTIN_QUOTES.length + 1);
});
