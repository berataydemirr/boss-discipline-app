/**
 * Tarih yardımcıları. SAF modül — DOM'a dokunmaz, Node testlerinde de çalışır.
 *
 * Tüm uygulama günleri 'YYYY-MM-DD' biçiminde YEREL tarih anahtarlarıyla tutar.
 * Dikkat: Date#toISOString() UTC'ye çevirdiği için gece yarısına yakın saatlerde
 * yanlış güne kayar — burada asla kullanılmaz. Gün aritmetiği UTC gün sayısı
 * üzerinden yapılır, böylece yaz saati geçişleri sonucu etkilemez.
 */

export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
/** Pazartesi = 0 … Pazar = 6 */
export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WEEKDAYS_MIN = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');

function parts(key) {
  const m = KEY_RE.exec(key);
  if (!m) throw new TypeError(`Geçersiz tarih anahtarı: ${key}`);
  return [+m[1], +m[2], +m[3]];
}

function utcDays(key) {
  const [y, m, d] = parts(key);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromUtcDays(n) {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function toKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('toKey: geçersiz tarih');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidKey(key) {
  if (typeof key !== 'string') return false;
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Anahtarı yerel öğlen saatine çevirir (DST kaymalarına karşı güvenli). */
export function fromKey(key) {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d, 12);
}

export const todayKey = (now = new Date()) => toKey(now);
export const addDays = (key, n) => fromUtcDays(utcDays(key) + n);
/** b - a, gün olarak. diffDays('2026-01-01','2026-01-03') === 2 */
export const diffDays = (a, b) => utcDays(b) - utcDays(a);
/** Pazartesi = 0 … Pazar = 6 */
export const weekday = (key) => (new Date(utcDays(key) * DAY_MS).getUTCDay() + 6) % 7;
export const startOfWeek = (key) => addDays(key, -weekday(key));
export const monthKey = (key) => key.slice(0, 7);

export function* eachDay(from, to) {
  for (let n = utcDays(from), end = utcDays(to); n <= end; n++) yield fromUtcDays(n);
}

export function daysBetween(from, to) {
  return [...eachDay(from, to)];
}

export function startOfMonth(key) {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key) {
  const [y, m] = parts(key);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(last)}`;
}

/** ISO 8601 hafta numarası. */
export function isoWeek(key) {
  const n = utcDays(key);
  const thursday = n - weekday(key) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - utcDays(`${year}-01-01`)) / 7) + 1;
  return { year, week };
}

export function weekKey(key) {
  const { year, week } = isoWeek(key);
  return `${year}-W${pad(week)}`;
}

export function formatLong(key) {
  const [, m, d] = parts(key);
  return `${d} ${MONTHS[m - 1]} ${WEEKDAYS[weekday(key)]}`;
}

export function formatDayMonth(key) {
  const [, m, d] = parts(key);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatShort(key) {
  const [, m, d] = parts(key);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function formatMonthYear(key) {
  const [y, m] = parts(key);
  return `${MONTHS[m - 1]} ${y}`;
}

export function relativeLabel(key, today) {
  const d = diffDays(key, today);
  if (d === 0) return 'Bugün';
  if (d === 1) return 'Dün';
  if (d === -1) return 'Yarın';
  if (d > 1 && d < 7) return `${d} gün önce`;
  return '';
}

/** Ayın ilk günü, n ay ileri/geri. addMonths('2026-10-09', -1) === '2026-09-01' */
export function addMonths(key, n) {
  const [y, m] = parts(key);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

/** Hedef dönemi anahtarı: hafta → '2026-W41', ay → '2026-10'. */
export function periodKey(period, key) {
  return period === 'month' ? monthKey(key) : weekKey(key);
}

/** Dönemin ilk ve son günü. */
export function periodRange(period, key) {
  if (period === 'month') return { start: startOfMonth(key), end: endOfMonth(key) };
  const start = startOfWeek(key);
  return { start, end: addDays(start, 6) };
}

export const isValidTime = (s) => typeof s === 'string' && TIME_RE.test(s);

/** 'HH:MM' → gün içindeki dakika; geçersizse null. */
export function parseTime(s) {
  const m = TIME_RE.exec(s ?? '');
  return m ? +m[1] * 60 + +m[2] : null;
}

export const minutesOfDay = (now = new Date()) => now.getHours() * 60 + now.getMinutes();
