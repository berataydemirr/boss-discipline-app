/**
 * Service worker önbellek listesi ile diskteki dosyalar uyumlu mu?
 * Listede eksik dosya → uygulama çevrimdışı açılmaz.
 * Listede olup diskte olmayan dosya → SW kurulumu tamamen başarısız olur.
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

test('PRECACHE listesindeki her dosya var', () => {
  for (const u of list) {
    if (u === './') continue;
    assert.ok(fs.existsSync(path.join(root, u)), `diskte yok: ${u}`);
  }
});

test('her uygulama dosyası PRECACHE listesinde', () => {
  const files = [...walk('js'), ...walk('css'), ...walk('icons')].map((f) => `./${f}`);
  const missing = files.filter((f) => !list.includes(f));
  assert.deepEqual(missing, [], `PRECACHE listesine eklenmeli: ${missing.join(', ')}`);
});

test('import edilen her modül mevcut', () => {
  for (const f of walk('js')) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      const target = path.join(root, path.dirname(f), m[1]);
      assert.ok(fs.existsSync(target), `${f} → ${m[1]} bulunamadı`);
    }
  }
});

test('manifest geçerli JSON ve ikonları mevcut', () => {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.display, 'standalone');
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
});
