/**
 * Stats: level, headline numbers, yearly calendar, weekly rate, weekday pattern,
 * habit table, focus time, mood insights, badges.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { heatmap, columns, trendLine, statTile, meter, pct } from '../ui/charts.js';
import { openHabitDetail } from '../ui/habit-detail.js';
import { store } from '../core/store.js';
import { colorHex } from '../core/validate.js';
import { todayKey, addDays, formatShort, WEEKDAYS, WEEKDAYS_SHORT } from '../core/dates.js';
import { dailySeries, weeklyRates, weekdayPattern, moodCorrelation, reviewAverages } from '../logic/stats.js';

const num = (v, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits });

export function render() {
  const today = todayKey();
  const habits = store.allHabits();

  if (!habits.length) {
    return h(
      'div',
      { class: 'page' },
      h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Stats'), h('h1', { class: 'display' }, 'Too early.')),
      h('p', { class: 'muted' }, 'Check off your habits for a few days and your streaks, rates and calendar will show up here.'),
      h('a', { class: 'btn btn-primary', href: '#/today', style: { marginTop: '20px' } }, 'Go to today'),
    );
  }

  const sum = store.summary();
  const isDone = (id, k) => store.isDone(id, k);
  const days = store.allDays();

  return h(
    'div',
    { class: 'page stats' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Stats'), h('h1', { class: 'display' }, 'Progress')),
    levelCard(sum.level),
    kpis(sum, habits, isDone, today),
    calendarSection(habits, isDone, today),
    weeklySection(habits, isDone, today),
    weekdaySection(habits, isDone, sum.earliest, today),
    habitTable(sum),
    focusSection(today),
    moodSection(habits, isDone, days, today),
    badgesSection(sum.badges),
  );
}

function section(title, meta, ...children) {
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title), meta && h('span', { class: 'section-meta' }, meta)),
    ...children,
  );
}

/* ───────────────────────── level ───────────────────────── */

function levelCard(lv) {
  const left = lv.next - lv.points;
  return h(
    'div',
    { class: 'level-card' },
    h(
      'div',
      { class: 'level-top' },
      h('div', null, h('p', { class: 'eyebrow' }, `Level ${lv.level}`), h('p', { class: 'level-title serif' }, lv.title)),
      h('p', { class: 'level-points' }, h('span', { class: 'num' }, num(lv.points)), ' pts'),
    ),
    meter(lv.progress),
    h('p', { class: 'level-next' }, `${num(left)} points to the next level`),
  );
}

/* ───────────────────────── headline numbers ───────────────────────── */

function kpis(sum, habits, isDone, today) {
  const thisWeek = weeklyRates(habits, isDone, today, 1)[0];
  const t = sum.totals;
  return h(
    'div',
    { class: 'stat-row stat-row-3' },
    statTile('This week', pct(thisWeek.rate), thisWeek.total ? `${thisWeek.done}/${thisWeek.total}` : null),
    statTile('Best streak', String(t.bestStreak), 'days'),
    statTile('Perfect days', String(t.perfectDays), t.perfectRun > 1 ? `${t.perfectRun} in a row` : null),
  );
}

/* ───────────────────────── calendar ───────────────────────── */

function calendarSection(habits, isDone, today) {
  const from = addDays(today, -7 * 52);
  const series = dailySeries(habits, isDone, from, today).map((d) => (d.key === today && d.done < d.total ? { ...d, ratio: d.done ? d.ratio : null } : d));
  return section('Last 12 months', null, heatmap(series));
}

/* ───────────────────────── weekly ───────────────────────── */

function weeklySection(habits, isDone, today) {
  const weeks = weeklyRates(habits, isDone, today, 12);
  const items = weeks.map((w, i) => ({
    label: i === weeks.length - 1 ? 'Now' : i % 3 === 2 ? formatShort(w.start).split(' ')[0] : '',
    value: w.rate,
    highlight: i === weeks.length - 1,
    tip: `Week of ${formatShort(w.start)} · ${w.total ? `${pct(w.rate)} (${w.done}/${w.total})` : 'nothing planned'}`,
  }));
  const rated = weeks.filter((w) => w.rate != null);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rate, 0) / rated.length : null;
  return section('Weekly rate', avg != null ? `12-week avg ${pct(avg)}` : null, columns(items, { valueLabel: (it) => pct(it.value) }));
}

/* ───────────────────────── weekday pattern ───────────────────────── */

function weekdaySection(habits, isDone, earliest, today) {
  const from = earliest > addDays(today, -83) ? earliest : addDays(today, -83); // last 12 weeks
  const pattern = weekdayPattern(habits, isDone, from, today);
  const rated = pattern.filter((p) => p.rate != null && p.total >= 2);
  let insight = null;
  if (rated.length >= 3) {
    const best = rated.reduce((a, b) => (b.rate > a.rate ? b : a));
    const worst = rated.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (best.rate - worst.rate >= 0.1) {
      insight = `Your strongest day is ${WEEKDAYS[best.weekday]} (${pct(best.rate)}), your weakest ${WEEKDAYS[worst.weekday]} (${pct(worst.rate)}).`;
    }
  }
  const items = pattern.map((p) => ({
    label: WEEKDAYS_SHORT[p.weekday],
    value: p.rate,
    tip: `${WEEKDAYS[p.weekday]} · ${p.total ? `${pct(p.rate)} (${p.done}/${p.total})` : 'no data'}`,
  }));
  return section('Days of the week', 'last 12 weeks', columns(items), insight && h('p', { class: 'insight' }, insight));
}

/* ───────────────────────── habit table ───────────────────────── */

function habitTable(sum) {
  const active = store.habits();
  if (!active.length) return null;
  return section(
    'Habits',
    'last 30 days',
    h(
      'ul',
      { class: 'htable' },
      active.map((x) => {
        const s = sum.perHabit.get(x.id);
        const isQuit = x.kind === 'quit';
        return h(
          'li',
          null,
          h(
            'button',
            { class: 'hrow', style: { '--c': colorHex(x.color) }, onclick: () => openHabitDetail(x.id) },
            h('span', { class: 'dot', 'aria-hidden': 'true' }),
            h(
              'span',
              { class: 'hrow-main' },
              h('span', { class: 'hrow-name' }, x.name),
              isQuit
                ? h('span', { class: 'hrow-sub' }, `${s?.current ?? 0} days clean · longest ${s?.best ?? 0}`)
                : h('span', { class: 'hrow-sub' }, icon('flame', { size: 12, cls: 'meta-flame' }), `${s?.current ?? 0} · best ${s?.best ?? 0}`),
            ),
            !isQuit && h('span', { class: 'hrow-rate' }, h('span', { class: 'num' }, pct(s?.rate30?.rate)), meter(s?.rate30?.rate, { color: 'var(--text-2)' })),
          ),
        );
      }),
    ),
  );
}

/* ───────────────────────── focus ───────────────────────── */

function focusSection(today) {
  if (!store.focusSessions().length) return null;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const mins = days.map((d) => store.focusMinutesOn(d));
  const max = Math.max(60, ...mins);
  const week = mins.slice(-7).reduce((a, b) => a + b, 0);
  const total = store.focusMinutesTotal();
  /** Value and unit separately, so the unit sits on the tile's second line (like the other tiles). */
  const dur = (m) => (m >= 60 ? [num(m / 60, 1), 'hours'] : [String(m), 'minutes']);
  const items = days.map((d, i) => ({
    label: i % 2 === 1 ? String(Number(d.slice(8))) : '',
    value: mins[i] ? mins[i] / max : null,
    highlight: d === today,
    tip: `${formatShort(d)} · ${mins[i]} min`,
  }));
  return section(
    'Focus',
    'last 14 days',
    h(
      'div',
      { class: 'stat-row stat-row-3' },
      statTile('This week', ...dur(week)),
      statTile('Daily avg', String(Math.round(week / 7)), 'minutes'),
      statTile('Total', ...dur(total)),
    ),
    columns(items, { valueLabel: () => `${mins[mins.length - 1]} min`, scale: [`${max}`, `${Math.round(max / 2)}`] }),
  );
}

/* ───────────────────────── mood ───────────────────────── */

function moodSection(habits, isDone, days, today) {
  const from = addDays(today, -29);
  const avgs = reviewAverages(days, from, today);
  if (avgs.count === 0) {
    return section('Mood', null, h('p', { class: 'muted small' }, 'Do evening reviews and your day score, mood and which habits are good for you will show up here.'));
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const points = [];
  for (let k = from; k <= today; k = addDays(k, 1)) points.push({ key: k, value: byDate.get(k)?.review?.score ?? null });

  const correlations = moodCorrelation(habits, isDone, days).slice(0, 3);
  const nameOf = (id) => store.habit(id)?.name ?? '?';
  const fmt = (v) => (v == null ? '—' : num(v, 1));

  return section(
    'Mood',
    `last 30 days · ${avgs.count} ${avgs.count === 1 ? 'entry' : 'entries'}`,
    h(
      'div',
      { class: 'stat-row stat-row-3' },
      statTile('Day score', fmt(avgs.score), 'average / 10'),
      statTile('Mood', fmt(avgs.mood), 'average / 5'),
      statTile('Energy', fmt(avgs.energy), 'average / 5'),
    ),
    h('p', { class: 'chart-caption' }, 'Day score'),
    trendLine(points, { min: 1, max: 10 }),
    correlations.length > 0 &&
      h(
        'ul',
        { class: 'insights' },
        correlations.map((c) =>
          h(
            'li',
            { class: 'insight' },
            c.delta >= 0
              ? `On days you do “${nameOf(c.habitId)}”, your mood is ${fmt(c.delta)} points higher on average.`
              : `On days you do “${nameOf(c.habitId)}”, your mood is ${fmt(-c.delta)} points lower on average.`,
            h('span', { class: 'faint' }, ` (${c.nWith} / ${c.nWithout} days)`),
          ),
        ),
      ),
  );
}

/* ───────────────────────── badges ───────────────────────── */

function badgeProgress(b) {
  if (b.id === 'focus-10h') return `${Math.floor(b.current / 60)}/${b.target / 60} h`;
  return `${Math.min(b.current, b.target)}/${b.target}`;
}

function badgesSection(badges) {
  const earned = badges.filter((b) => b.earned).length;
  return section(
    'Badges',
    `${earned}/${badges.length}`,
    h(
      'ul',
      { class: 'badges' },
      badges.map((b) =>
        h(
          'li',
          { class: ['badge', b.earned && 'is-earned'], title: b.desc },
          h('span', { class: 'badge-mark', style: { '--p': `${Math.round(b.progress * 100)}%` }, 'aria-hidden': 'true' }, b.earned ? icon('check', { size: 16 }) : null),
          h('span', { class: 'badge-title' }, b.title),
          h('span', { class: 'badge-desc' }, b.earned ? b.desc : `${b.desc} · ${badgeProgress(b)}`),
        ),
      ),
    ),
  );
}
