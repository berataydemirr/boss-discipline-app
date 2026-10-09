/**
 * Computes every statistic in one pass. PURE module.
 * Screens cache it per store version (see store.summary()).
 *
 * @param {{habits:object[], isDone:Function, datesFor:Function, days:object[], focusMinutes?:number, today:string}} data
 */
import { addDays, diffDays } from '../core/dates.js';
import { currentStreak, bestStreak, completionRate, quitStats } from './streaks.js';
import { perfectDays, isActiveOn } from './stats.js';
import { computePoints, levelFor, evaluateBadges } from './gamification.js';

export function buildSummary({ habits, isDone, datesFor, days, focusMinutes = 0, today }) {
  const build = habits.filter((h) => h.kind === 'build');
  const quit = habits.filter((h) => h.kind === 'quit');
  const earliest = habits.reduce((m, h) => (h.createdAt < m ? h.createdAt : m), today);
  const from30 = addDays(today, -29);

  let checks = 0;
  const perHabit = new Map();

  for (const h of build) {
    const set = datesFor(h.id);
    // An archived habit keeps its history in the points, but its streaks stop on the archive day.
    const end = h.archivedAt ? addDays(h.archivedAt, -1) : today;
    const doneCount = [...set].filter((d) => d >= h.createdAt && d <= end).length;
    checks += doneCount;
    perHabit.set(h.id, {
      kind: 'build',
      current: h.archivedAt ? 0 : currentStreak(h, set, today),
      best: end >= h.createdAt ? bestStreak(h, set, end) : 0,
      rate30: completionRate(h, set, from30, end, today),
      rateAll: completionRate(h, set, h.createdAt, end, today),
      total: doneCount,
    });
  }

  let cleanDays = 0;
  let quitBest = 0;
  for (const h of quit) {
    const end = h.archivedAt ?? today;
    const s = quitStats(h, [...datesFor(h.id)], end);
    // clean days = full days since the start − slip days
    cleanDays += Math.max(0, diffDays(h.createdAt, end) - s.slips);
    if (s.best > quitBest) quitBest = s.best;
    perHabit.set(h.id, { kind: 'quit', ...s });
  }

  const perfect = perfectDays(habits, isDone, earliest, today);
  const reviews = days.filter((d) => d.review).length;
  const notes = days.filter((d) => d.note?.trim()).length;
  const bestStreakAny = Math.max(0, ...[...perHabit.values()].filter((p) => p.kind === 'build').map((p) => p.best));

  const points = computePoints({ checks, perfectDays: perfect.count, reviews, cleanDays, focusMinutes });
  const ctx = { checks, bestStreak: bestStreakAny, perfectDays: perfect.count, perfectRun: perfect.bestRun, reviews, notes, quitBest, focusMinutes };

  return {
    today,
    earliest,
    perHabit,
    totals: ctx,
    activeCount: habits.filter((h) => isActiveOn(h, today) && !h.archivedAt).length,
    level: levelFor(points),
    badges: evaluateBadges(ctx),
  };
}
