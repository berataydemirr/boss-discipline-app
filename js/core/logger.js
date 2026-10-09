/**
 * Central logging.
 *
 * - Debug mode: add ?debug=1 to the URL or enable it in Settings > Developer (?debug=0 disables).
 * - The last MAX_ENTRIES records are kept in a ring buffer and flushed to localStorage
 *   periodically, so they can be inspected in Settings > Logs even after a crash.
 * - With debug off, only warn/error reach the console and debug records are dropped.
 * - From the console: window.boss.logs()
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const DEBUG_KEY = 'boss:debug';
const BUFFER_KEY = 'boss:logs';
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

/** Writes the buffer to localStorage immediately. Also called when the page closes. */
export function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!hasStorage) return;
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
  } catch {
    // Quota may be full: halve the buffer and try once more.
    buffer = buffer.slice(-Math.floor(MAX_ENTRIES / 2));
    try {
      localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
    } catch {
      /* give up — logging must never break the app */
    }
  }
}

function scheduleFlush() {
  if (!hasStorage || flushTimer) return;
  flushTimer = setTimeout(flush, 1500);
}

/** Turns any value into safe, truncated JSON text (Error, Set, Map, circular refs). */
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
      if (typeof v === 'function') return `[fn ${v.name || 'anonymous'}]`;
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
    if (s === undefined) return String(data);
    return s.length > MAX_DATA_CHARS ? `${s.slice(0, MAX_DATA_CHARS)}…` : s;
  } catch (e) {
    return `[unserializable: ${e.message}]`;
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
      /* a listener error must not break logging */
    }
  });
}

/**
 * Creates a per-module logger.
 * @example const log = createLogger('store'); log.info('loaded', { habits: 3 });
 */
export function createLogger(mod) {
  return {
    debug: (msg, data) => write('debug', mod, msg, data),
    info: (msg, data) => write('info', mod, msg, data),
    warn: (msg, data) => write('warn', mod, msg, data),
    error: (msg, data) => write('error', mod, msg, data),
    /** Timer: const end = log.time('render'); ... end(); */
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
    /* ignore */
  }
  write('info', 'logger', `Debug mode ${on ? 'on' : 'off'}`);
}

export function getLogs() {
  return buffer.slice();
}

export function clearLogs() {
  buffer = [];
  flush();
}

/** Subscribe to new log entries live. Returns an unsubscribe function. */
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

/** Plain-text report suitable for the clipboard. */
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
