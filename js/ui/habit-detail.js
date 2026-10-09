/**
 * Habit detail: streaks, rates, the last 6 months as a calendar, edit.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { openHabitForm, scheduleLabel } from './habit-form.js';
import { heatmap, statTile, pct } from './charts.js';
import { store } from '../core/store.js';
import { colorHex } from '../core/validate.js';
import { todayKey, addDays, formatShort, formatLong, diffDays } from '../core/dates.js';
import { isScheduled } from '../logic/streaks.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function openHabitDetail(habitId) {
  const habit = store.habit(habitId);
  if (!habit) return null;
  const today = todayKey();
  const s = store.summary().perHabit.get(habitId);
  const color = colorHex(habit.color);

  return openSheet({
    title: habit.name,
    className: 'sheet-tall',
    build: ({ close }) => {
      const from = addDays(today, -7 * 26);
      const start = habit.createdAt > from ? habit.createdAt : from;
      const dates = store.datesFor(habitId);

      let tiles;
      let series;
      if (habit.kind === 'quit') {
        tiles = [
          statTile('Clean', String(s?.current ?? 0), 'days'),
          statTile('Longest', String(s?.best ?? 0), 'days'),
          statTile('Slips', String(s?.slips ?? 0), 'total'),
        ];
        // A slip day should look "empty", not full: clean day = 1, slip = 0.
        series = [];
        for (let k = start; k <= today; k = addDays(k, 1)) {
          const slipped = dates.has(k);
          series.push({ key: k, done: slipped ? 0 : 1, total: 1, ratio: k === today && !slipped ? null : slipped ? 0 : 1 });
        }
      } else {
        tiles = [
          statTile('Streak', String(s?.current ?? 0), 'days'),
          statTile('Best', String(s?.best ?? 0), 'days'),
          statTile('Last 30 days', pct(s?.rate30?.rate), s?.rate30?.total ? `${s.rate30.done}/${s.rate30.total}` : null),
        ];
        series = [];
        for (let k = start; k <= today; k = addDays(k, 1)) {
          const planned = isScheduled(habit, k);
          const done = dates.has(k);
          series.push({ key: k, done: done ? 1 : 0, total: planned ? 1 : 0, ratio: planned ? (done ? 1 : k === today ? null : 0) : done ? 1 : null });
        }
      }

      const label = (d) =>
        habit.kind === 'quit'
          ? `${formatLong(d.key)} · ${d.done ? 'clean' : 'slip'}`
          : `${formatLong(d.key)} · ${d.done ? 'done' : d.total ? 'missed' : 'not planned'}`;

      const age = diffDays(habit.createdAt, today);
      return h(
        'div',
        { class: 'detail', style: { '--c': color } },
        h(
          'p',
          { class: 'detail-meta' },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          habit.kind === 'quit' ? 'Quit' : scheduleLabel(habit.days),
          ` · since ${formatShort(habit.createdAt)} (${plural(age, 'day')})`,
        ),
        h('div', { class: 'stat-row' }, tiles),
        h('div', { class: 'section-head' }, h('h3', { class: 'section-title' }, 'Last 6 months')),
        heatmap(series, { color, label }),
        habit.kind === 'build' &&
          s?.rateAll?.total > 0 &&
          h('p', { class: 'muted small detail-foot' }, `Since you started: done on ${s.rateAll.done} of ${s.rateAll.total} planned days (${pct(s.rateAll.rate)}).`),
        h(
          'button',
          {
            class: 'btn btn-ghost btn-block',
            onclick: async () => {
              await close();
              openHabitForm(store.habit(habitId));
            },
          },
          icon('edit', { size: 18 }),
          'Edit',
        ),
      );
    },
  });
}
