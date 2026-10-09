/**
 * Günlük ve dönemsel istatistikler. SAF modül.
 *
 * "Aktif" alışkanlık: o gün başlamış, o gün itibarıyla arşivlenmemiş ve 'build' türünde.
 */
import { isScheduled } from './streaks.js';

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
