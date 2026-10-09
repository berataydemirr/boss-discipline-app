/**
 * IndexedDB sarmalayıcı + bellek içi yedek.
 *
 * Şema değişiklikleri MIGRATIONS'a yeni bir sürüm olarak eklenir; eski sürümden gelen
 * kullanıcıda sırayla çalıştırılır. Mevcut bir migration'ı asla değiştirme — yenisini ekle.
 *
 * IndexedDB açılamazsa (bazı gizli sekmeler, kısıtlı tarayıcılar) MemoryBackend devreye girer:
 * uygulama çalışır ama veri kalıcı olmaz; UI bunu kullanıcıya bildirir.
 */
import { createLogger } from './logger.js';

const log = createLogger('db');

export const DB_NAME = 'disiplin';
export const DB_VERSION = 2;

export const MIGRATIONS = {
  1(db) {
    db.createObjectStore('habits', { keyPath: 'id' });
    const checks = db.createObjectStore('checks', { keyPath: 'id' });
    checks.createIndex('byHabit', 'habitId');
    checks.createIndex('byDate', 'date');
    db.createObjectStore('days', { keyPath: 'date' });
    db.createObjectStore('quotes', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'key' });
  },
  // v3: odak oturumları, hedefler, iç kayıtlar (hatırlatıcı günlüğü vb.)
  2(db) {
    const focus = db.createObjectStore('focus', { keyPath: 'id' });
    focus.createIndex('byDate', 'date');
    db.createObjectStore('goals', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
};

export const STORES = ['habits', 'checks', 'days', 'quotes', 'settings', 'focus', 'goals', 'meta'];

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('İşlem iptal edildi'));
  });
}

function openIDB(onVersionChange) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    const timeout = setTimeout(() => reject(new Error('IndexedDB açılışı zaman aşımına uğradı')), 8000);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const from = e.oldVersion;
      log.info(`Şema yükseltiliyor: v${from} → v${DB_VERSION}`);
      for (let v = from + 1; v <= DB_VERSION; v++) {
        const migrate = MIGRATIONS[v];
        if (!migrate) throw new Error(`Eksik migration: v${v}`);
        migrate(db, req.transaction);
        log.info(`Migration v${v} uygulandı`);
      }
    };
    req.onblocked = () => {
      log.warn('Veritabanı yükseltmesi başka bir sekme tarafından engelleniyor');
    };
    req.onsuccess = () => {
      clearTimeout(timeout);
      const db = req.result;
      db.onversionchange = () => {
        log.warn('Veritabanı başka bir sekmede yükseltildi; bağlantı kapatılıyor');
        db.close();
        onVersionChange?.();
      };
      resolve(db);
    };
    req.onerror = () => {
      clearTimeout(timeout);
      reject(req.error);
    };
  });
}

class IdbBackend {
  constructor(db) {
    this.db = db;
    this.kind = 'idb';
    this.persistent = true;
  }

  async getAll(store) {
    const tx = this.db.transaction(store, 'readonly');
    return reqToPromise(tx.objectStore(store).getAll());
  }

  async get(store, key) {
    const tx = this.db.transaction(store, 'readonly');
    return reqToPromise(tx.objectStore(store).get(key));
  }

  async put(store, value) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await txDone(tx);
  }

  async putMany(store, values) {
    if (!values.length) return;
    const tx = this.db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    values.forEach((v) => os.put(v));
    await txDone(tx);
  }

  async delete(store, key) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await txDone(tx);
  }

  async deleteMany(store, keys) {
    if (!keys.length) return;
    const tx = this.db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    keys.forEach((k) => os.delete(k));
    await txDone(tx);
  }

  /** Verilen tüm store'ları tek, atomik işlemde temizleyip yeniden doldurur (içe aktarma/sıfırlama). */
  async replaceAll(data) {
    const names = Object.keys(data);
    const tx = this.db.transaction(names, 'readwrite');
    for (const name of names) {
      const os = tx.objectStore(name);
      os.clear();
      data[name].forEach((v) => os.put(v));
    }
    await txDone(tx);
  }
}

class MemoryBackend {
  constructor(stores) {
    this.kind = 'memory';
    this.persistent = false;
    this.data = new Map(stores.map((s) => [s, new Map()]));
    this.keyPaths = { days: 'date', settings: 'key', meta: 'key' };
  }

  keyOf(store, v) {
    return v[this.keyPaths[store] ?? 'id'];
  }

  async getAll(store) {
    return [...this.data.get(store).values()].map((v) => structuredClone(v));
  }

  async get(store, key) {
    const v = this.data.get(store).get(key);
    return v === undefined ? undefined : structuredClone(v);
  }

  async put(store, value) {
    this.data.get(store).set(this.keyOf(store, value), structuredClone(value));
  }

  async putMany(store, values) {
    values.forEach((v) => this.data.get(store).set(this.keyOf(store, v), structuredClone(v)));
  }

  async delete(store, key) {
    this.data.get(store).delete(key);
  }

  async deleteMany(store, keys) {
    keys.forEach((k) => this.data.get(store).delete(k));
  }

  async replaceAll(data) {
    for (const [name, values] of Object.entries(data)) {
      const m = new Map();
      values.forEach((v) => m.set(this.keyOf(name, v), structuredClone(v)));
      this.data.set(name, m);
    }
  }
}

export async function openDatabase({ onVersionChange } = {}) {
  if (typeof indexedDB === 'undefined') {
    log.error('IndexedDB yok; bellek içi depolama kullanılıyor (veriler kalıcı olmayacak)');
    return new MemoryBackend(STORES);
  }
  try {
    const db = await openIDB(onVersionChange);
    log.info('IndexedDB açıldı', { version: db.version, stores: [...db.objectStoreNames] });
    return new IdbBackend(db);
  } catch (e) {
    log.error('IndexedDB açılamadı; bellek içi depolamaya geçiliyor', e);
    return new MemoryBackend(STORES);
  }
}
