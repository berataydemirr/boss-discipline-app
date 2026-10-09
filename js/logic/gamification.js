/**
 * Points, levels and badges. PURE module.
 * Points are never stored; they are always derived from the data, so undoing a
 * check-in also undoes its points and nothing can drift out of sync.
 */

export const POINTS = {
  check: 10, // each completed habit
  perfectDay: 5, // a day where everything scheduled was done
  review: 3, // evening review
  cleanDay: 2, // each clean day for a quit habit
  focus10: 1, // every 10 minutes of focus
};

export const LEVEL_TITLES = ['Rookie', 'Apprentice', 'Committed', 'Consistent', 'Relentless', 'Disciplined', 'Master', 'Stoic', 'Boss'];

/**
 * Total points needed to reach level L: 0, 300, 750, 1350, 2100 …
 * Someone doing 4–5 habits a day is "Relentless" by month ~2 and "Boss" by month ~8.
 */
export function pointsForLevel(level) {
  return 75 * (level - 1) * (level + 2);
}

export function computePoints({ checks = 0, perfectDays = 0, reviews = 0, cleanDays = 0, focusMinutes = 0 }) {
  return (
    checks * POINTS.check +
    perfectDays * POINTS.perfectDay +
    reviews * POINTS.review +
    cleanDays * POINTS.cleanDay +
    Math.floor(focusMinutes / 10) * POINTS.focus10
  );
}

export function levelFor(points) {
  let level = 1;
  while (pointsForLevel(level + 1) <= points) level++;
  const floor = pointsForLevel(level);
  const next = pointsForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    points,
    floor,
    next,
    progress: (points - floor) / (next - floor),
  };
}

/**
 * Badges. `value(ctx)` gives progress, `target` the goal.
 * ctx: { checks, bestStreak, perfectDays, perfectRun, reviews, notes, quitBest, focusMinutes }
 */
export const BADGES = [
  { id: 'first-step', title: 'First step', desc: 'Check off your first habit', target: 1, value: (c) => c.checks },
  { id: 'streak-7', title: 'One week', desc: '7-day streak', target: 7, value: (c) => c.bestStreak },
  { id: 'streak-30', title: 'One month', desc: '30-day streak', target: 30, value: (c) => c.bestStreak },
  { id: 'streak-100', title: 'Hundred days', desc: '100-day streak', target: 100, value: (c) => c.bestStreak },
  { id: 'perfect-10', title: 'Perfect ten', desc: '10 perfect days', target: 10, value: (c) => c.perfectDays },
  { id: 'perfect-week', title: 'Flawless week', desc: '7 perfect days in a row', target: 7, value: (c) => c.perfectRun },
  { id: 'checks-100', title: 'Hundred', desc: 'Check off 100 times', target: 100, value: (c) => c.checks },
  { id: 'checks-1000', title: 'Thousand', desc: 'Check off 1000 times', target: 1000, value: (c) => c.checks },
  { id: 'clean-30', title: 'Clean month', desc: '30 days free of something you quit', target: 30, value: (c) => c.quitBest },
  { id: 'reviews-10', title: 'Mirror', desc: '10 evening reviews', target: 10, value: (c) => c.reviews },
  { id: 'notes-30', title: 'Pen', desc: '30 days of notes', target: 30, value: (c) => c.notes },
  { id: 'focus-10h', title: 'Deep work', desc: '10 hours of focus', target: 600, value: (c) => c.focusMinutes ?? 0 },
];

export function evaluateBadges(ctx) {
  return BADGES.map((b) => {
    const current = Math.max(0, b.value(ctx) || 0);
    return { id: b.id, title: b.title, desc: b.desc, target: b.target, current, earned: current >= b.target, progress: Math.min(1, current / b.target) };
  });
}
