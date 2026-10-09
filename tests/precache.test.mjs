/**
 * Is the service worker's precache list in sync with the files on disk?
 * A missing entry → the app won't open offline.
 * An entry with no file → the service worker install fails entirely.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const list = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function walk(dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name).replaceAll('\\', '/')]));
}

test('every PRECACHE entry exists', () => {
  for (const u of list) {
    if (u === './') continue;
    assert.ok(fs.existsSync(path.join(root, u)), `missing on disk: ${u}`);
  }
});

test('every app file is in PRECACHE', () => {
  const files = [...walk('js'), ...walk('css'), ...walk('icons')].map((f) => `./${f}`);
  const missing = files.filter((f) => !list.includes(f));
  assert.deepEqual(missing, [], `add to PRECACHE: ${missing.join(', ')}`);
});

test('every imported module exists', () => {
  for (const f of walk('js')) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      const target = path.join(root, path.dirname(f), m[1]);
      assert.ok(fs.existsSync(target), `${f} → ${m[1]} not found`);
    }
  }
});

test('manifest is valid JSON and its icons exist', () => {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.display, 'standalone');
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
});
