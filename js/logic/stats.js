/**
 * Günlük ve dönemsel istatistikler. SAF modül.
 *
 * "Aktif" alışkanlık: o gün başlamış ve o gün itibarıyla arşivlenmemiş.
 * Oranlarda bugün özel davranır: henüz yapılmamış alışkanlıklar paydaya girmez
 * (gün bitmeden oranı düşürmek adil olmaz) — streaks.completionRate ile aynı kural.
 */
import { isScheduled } from './streaks.js';
import { addDays, eachDay, startOfWeek, weekday } from '../core/dates.js';

export function isActiveOn(habit, key) {
  return habit.createdAt <= key && (!habit.archivedAt || key < habit.archivedAt);
}

/**
 * @param {object[]} habits tüm alışkanlıklar
 * @param {(habitId:string, key:string)=>boolean} isDone
 */
export function dayCompletion(habits, isDone, key) {
  let done = 0;
  let total = 0;
  for (const h of habits) {
    if (h.kind !== 'build' || !isActiveOn(h, key) || !isScheduled(h, key)) continue;
    total++;
    if (isDone(h.id, key)) done++;
  }
  return { done, total, ratio: total ? done / total : null };
}

/** Bugün için adil sayım: yapılmamışlar paydaya eklenmez. */
function fairDay(habits, isDone, key, today) {
  const d = dayCompletion(habits, isDone, key);
  if (key === today) return { done: d.done, total: d.done };
  return d;
}

/** Her gün için { key, done, total, ratio } — ısı haritası. */
export function dailySeries(habits, isDone, from, to) {
  const out = [];
  for (const key of eachDay(from, to)) out.push({ key, ...dayCompletion(habits, isDone, key) });
  return out;
}

/** Son `weeks` haftanın (bu hafta dahil) tamamlanma oranı. */
export function weeklyRates(habits, isDone, today, weeks = 12) {
  const thisWeek = startOfWeek(today);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(thisWeek, -7 * w);
    const end = addDays(start, 6) > today ? today : addDays(start, 6);
    let done = 0;
    let total = 0;
    for (const key of eachDay(start, end)) {
      const d = fairDay(habits, isDone, key, today);
      done += d.done;
      total += d.total;
    }
    out.push({ start, done, total, rate: total ? done / total : null });
  }
  return out;
}

/** Haftanın günlerine göre başarı oranı (Pzt=0 … Paz=6). */
export function weekdayPattern(habits, isDone, from, today) {
  const acc = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
  for (const key of eachDay(from, today)) {
    const d = fairDay(habits, isDone, key, today);
    const wd = acc[weekday(key)];
    wd.done += d.done;
    wd.total += d.total;
  }
  return acc.map((a, i) => ({ weekday: i, ...a, rate: a.total ? a.done / a.total : null }));
}

/** Tüm planlı alışkanlıkların yapıldığı günler: sayı ve en uzun ardışık seri. */
export function perfectDays(habits, isDone, from, today) {
  let count = 0;
  let run = 0;
  let bestRun = 0;
  for (const key of eachDay(from, today)) {
    const { done, total } = dayCompletion(habits, isDone, key);
    if (total > 0 && done === total) {
      count++;
      run++;
      if (run > bestRun) bestRun = run;
    } else if (total > 0 && key !== today) {
      run = 0;
    }
  }
  return { count, bestRun };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Alışkanlık yapılan ve yapılmayan (planlı) günlerde ortalama ruh hali farkı.
 * Yalnızca her iki tarafta da en az `minSamples` değerlendirme varsa raporlanır.
 * @param {{date:string, review?:{mood?:number}}[]} days
 */
export function moodCorrelation(habits, isDone, days, { minSamples = 4, metric = 'mood' } = {}) {
  const rated = days.filter((d) => d.review?.[metric] != null);
  const out = [];
  for (const h of habits) {
    if (h.kind !== 'build') continue;
    const withIt = [];
    const without = [];
    for (const d of rated) {
      if (!isActiveOn(h, d.date) || !isScheduled(h, d.date)) continue;
      (isDone(h.id, d.date) ? withIt : without).push(d.review[metric]);
    }
    if (withIt.length < minSamples || without.length < minSamples) continue;
    const a = avg(withIt);
    const b = avg(without);
    out.push({ habitId: h.id, withAvg: a, withoutAvg: b, delta: a - b, nWith: withIt.length, nWithout: without.length });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/** Son `n` günün değerlendirme ortalamaları. */
export function reviewAverages(days, from, to) {
  const inRange = days.filter((d) => d.review && d.date >= from && d.date <= to);
  const pick = (k) => avg(inRange.map((d) => d.review[k]).filter((v) => v != null));
  return { count: inRange.length, score: pick('score'), mood: pick('mood'), energy: pick('energy') };
}
