/**
 * Seri (streak) ve başarı oranı hesapları. SAF modül.
 *
 * Kurallar:
 * - Yalnızca alışkanlığın planlı olduğu günler sayılır; planlı olmayan günler seriyi bozmaz.
 * - Bugün planlıysa ama henüz işaretlenmediyse seri bozulmuş sayılmaz (gün bitmedi).
 * - Başlangıç tarihinden (createdAt) önceki günler hesaba katılmaz.
 *
 * Bırakılacak (quit) alışkanlıklar için "temiz gün" = kayma (slip) olmadan TAMAMLANMIŞ gün sayısı;
 * bugün devam ettiği için sayılmaz.
 */
import { addDays, diffDays, weekday, eachDay } from '../core/dates.js';

const MAX_LOOKBACK = 3700; // ~10 yıl; sonsuz döngüye karşı güvenlik sınırı

export function isScheduled(habit, key) {
  return habit.days.includes(weekday(key));
}

/** @param {Set<string>} doneSet alışkanlığın yapıldığı günler */
export function currentStreak(habit, doneSet, today) {
  let key = today;
  let streak = 0;
  if (isScheduled(habit, key) && !doneSet.has(key)) key = addDays(key, -1);
  for (let i = 0; i < MAX_LOOKBACK && key >= habit.createdAt; i++) {
    if (isScheduled(habit, key)) {
      if (doneSet.has(key)) streak++;
      else break;
    }
    key = addDays(key, -1);
  }
  return streak;
}

export function bestStreak(habit, doneSet, today) {
  if (habit.createdAt > today) return 0;
  let best = 0;
  let run = 0;
  for (const key of eachDay(habit.createdAt, today)) {
    if (!isScheduled(habit, key)) continue;
    if (doneSet.has(key)) {
      run++;
      if (run > best) best = run;
    } else if (key !== today) {
      run = 0;
    }
  }
  return best;
}

/**
 * [from, to] aralığında planlı günlerin kaçında yapıldığı.
 * Bugün henüz yapılmadıysa paydaya eklenmez (adaletsiz düşüşü önler).
 */
export function completionRate(habit, doneSet, from, to, today) {
  const start = from > habit.createdAt ? from : habit.createdAt;
  let done = 0;
  let total = 0;
  if (start > to) return { done, total, rate: null };
  for (const key of eachDay(start, to)) {
    if (!isScheduled(habit, key)) continue;
    const isDone = doneSet.has(key);
    if (key === today && !isDone) continue;
    total++;
    if (isDone) done++;
  }
  return { done, total, rate: total ? done / total : null };
}

/**
 * @param {string[]} slipDates kayma günleri (sırasız olabilir)
 * @returns {{current:number, best:number, slips:number, slippedToday:boolean}}
 */
export function quitStats(habit, slipDates, today) {
  const start = habit.createdAt;
  const slips = [...new Set(slipDates)].filter((d) => d >= start && d <= today).sort();
  if (start > today) return { current: 0, best: 0, slips: 0, slippedToday: false };

  const last = slips[slips.length - 1];
  const current = last ? Math.max(0, diffDays(last, today) - 1) : diffDays(start, today);

  let best = current;
  let prev = null;
  for (const s of slips) {
    const gap = prev === null ? diffDays(start, s) : diffDays(prev, s) - 1;
    if (gap > best) best = gap;
    prev = s;
  }
  return { current, best, slips: slips.length, slippedToday: last === today };
}
