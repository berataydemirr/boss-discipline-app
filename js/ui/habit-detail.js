/**
 * Alışkanlık ayrıntısı: seri, oranlar, son 6 ayın takvimi, düzenleme.
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
          statTile('Temiz', String(s?.current ?? 0), 'gün'),
          statTile('En uzun', String(s?.best ?? 0), 'gün'),
          statTile('Kayma', String(s?.slips ?? 0), 'kez'),
        ];
        // Kayma yaşanan gün tam dolu değil "boş" görünsün: temiz gün = 1, kayma = 0.
        series = [];
        for (let k = start; k <= today; k = addDays(k, 1)) {
          const slipped = dates.has(k);
          series.push({ key: k, done: slipped ? 0 : 1, total: 1, ratio: k === today && !slipped ? null : slipped ? 0 : 1 });
        }
      } else {
        tiles = [
          statTile('Seri', String(s?.current ?? 0), 'gün'),
          statTile('En iyi', String(s?.best ?? 0), 'gün'),
          statTile('Son 30 gün', pct(s?.rate30?.rate), s?.rate30?.total ? `${s.rate30.done}/${s.rate30.total}` : null),
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
          ? `${formatLong(d.key)} · ${d.done ? 'temiz' : 'kayma'}`
          : `${formatLong(d.key)} · ${d.done ? 'yapıldı' : d.total ? 'yapılmadı' : 'plan yok'}`;

      const age = diffDays(habit.createdAt, today);
      return h(
        'div',
        { class: 'detail', style: { '--c': color } },
        h(
          'p',
          { class: 'detail-meta' },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          habit.kind === 'quit' ? 'Bırakılacak' : scheduleLabel(habit.days),
          ` · ${formatShort(habit.createdAt)} tarihinden beri (${age} gün)`,
        ),
        h('div', { class: 'stat-row' }, tiles),
        h('div', { class: 'section-head' }, h('h3', { class: 'section-title' }, 'Son 6 ay')),
        heatmap(series, { color, label }),
        habit.kind === 'build' &&
          s?.rateAll?.total > 0 &&
          h('p', { class: 'muted small detail-foot' }, `Başlangıçtan beri ${s.rateAll.total} planlı günün ${s.rateAll.done} tanesinde yaptın (${pct(s.rateAll.rate)}).`),
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
          'Düzenle',
        ),
      );
    },
  });
}
