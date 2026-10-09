/**
 * Merkezi loglama.
 *
 * - Debug modu: URL'ye ?debug=1 ekle ya da Ayarlar > Geliştirici'den aç (?debug=0 kapatır).
 * - Son MAX_ENTRIES kayıt halka tamponda tutulur ve localStorage'a periyodik yazılır;
 *   böylece uygulama çökse bile bir sonraki açılışta Ayarlar > Kayıtlar'dan incelenebilir.
 * - Debug kapalıyken konsola yalnızca warn/error basılır, debug seviyesi hiç tutulmaz.
 * - Konsoldan erişim: window.disiplin.logs()
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEBUG_KEY = 'disiplin:debug';
const BUFFER_KEY = 'disiplin:logs';
const MAX_ENTRIES = 400;
const MAX_DATA_CHARS = 1500;

const STYLES = {
  debug: 'color:#8a8478',
  info: 'color:#7fa6c9',
  warn: 'color:#d9a441',
  error: 'color:#e2673c;font-weight:bold',
};

const hasStorage = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
})();

function readDebugFlag() {
  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search);
      if (q.has('debug')) {
        const on = q.get('debug') !== '0';
        if (hasStorage) localStorage.setItem(DEBUG_KEY, on ? '1' : '0');
        return on;
      }
    }
    return hasStorage && localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function loadBuffer() {
  if (!hasStorage) return [];
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let debugEnabled = readDebugFlag();
let buffer = loadBuffer();
let flushTimer = null;
const listeners = new Set();

/** Tamponu hemen localStorage'a yazar. Sayfa kapanırken de çağrılır. */
export function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!hasStorage) return;
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    // Kota dolmuş olabilir: tamponu yarıya indirip bir kez daha dene.
    buffer = buffer.slice(-Math.floor(MAX_ENTRIES / 2));
    try {
      localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
    } catch {
      /* vazgeç — loglama asla uygulamayı düşürmemeli */
    }
  }
}

function scheduleFlush() {
  if (!hasStorage || flushTimer) return;
  flushTimer = setTimeout(flush, 1500);
}

/** Her türlü veriyi güvenli, kısaltılmış JSON metnine çevirir (Error, Set, Map, döngüsel referans). */
export function serialize(data) {
  if (data === undefined) return undefined;
  try {
    const seen = new WeakSet();
    const s = JSON.stringify(data, (_key, v) => {
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 6).join('\n') };
      }
      if (v instanceof Set) return [...v];
      if (v instanceof Map) return Object.fromEntries(v);
      if (typeof v === 'function') return `[fn ${v.name || 'anonim'}]`;
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[döngüsel]';
        seen.add(v);
      }
      return v;
    });
    if (s === undefined) return String(data);
    return s.length > MAX_DATA_CHARS ? `${s.slice(0, MAX_DATA_CHARS)}…` : s;
  } catch (e) {
    return `[serileştirilemedi: ${e.message}]`;
  }
}

function write(level, mod, msg, data) {
  if (level === 'debug' && !debugEnabled) return;
  const entry = { t: Date.now(), lvl: level, mod, msg: String(msg) };
  const ser = serialize(data);
  if (ser !== undefined) entry.data = ser;

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  scheduleFlush();

  if (debugEnabled || LEVELS[level] >= LEVELS.warn) {
    const fn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info;
    const args = [`%c[${mod}]%c ${msg}`, STYLES[level], 'color:inherit'];
    if (data !== undefined) args.push(data);
    fn.apply(console, args);
  }

  listeners.forEach((l) => {
    try {
      l(entry);
    } catch {
      /* dinleyici hatası loglamayı bozmasın */
    }
  });
}

/**
 * Modül bazlı logger üretir.
 * @example const log = createLogger('store'); log.info('yüklendi', { habits: 3 });
 */
export function createLogger(mod) {
  return {
    debug: (msg, data) => write('debug', mod, msg, data),
    info: (msg, data) => write('info', mod, msg, data),
    warn: (msg, data) => write('warn', mod, msg, data),
    error: (msg, data) => write('error', mod, msg, data),
    /** Süre ölçer: const end = log.time('render'); ... end(); */
    time(label) {
      const t0 = performance.now();
      return (extra) => write('debug', mod, `${label} ${(performance.now() - t0).toFixed(1)}ms`, extra);
    },
  };
}

export function isDebug() {
  return debugEnabled;
}

export function setDebug(on) {
  debugEnabled = !!on;
  try {
    if (hasStorage) localStorage.setItem(DEBUG_KEY, on ? '1' : '0');
  } catch {
    /* yok say */
  }
  write('info', 'logger', `Debug modu ${on ? 'açıldı' : 'kapandı'}`);
}

export function getLogs() {
  return buffer.slice();
}

export function clearLogs() {
  buffer = [];
  flush();
}

/** Yeni log kayıtlarını canlı dinlemek için. Abonelikten çıkma fonksiyonu döner. */
export function onLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function formatTime(t) {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Panoya kopyalanabilir düz metin rapor. */
export function formatLogs(entries = buffer) {
  return entries
    .map((e) => `${new Date(e.t).toISOString()} ${e.lvl.toUpperCase().padEnd(5)} [${e.mod}] ${e.msg}${e.data ? ` ${e.data}` : ''}`)
    .join('\n');
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
