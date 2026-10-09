/**
 * Small, hand-written, dependency-free charts.
 *
 * Rules (dataviz guide):
 * - Magnitude = a single hue (the accent), light to dark; never a rainbow.
 * - Thin marks: columns ≤ 24px, 4px rounded top, square at the baseline; lines 2px.
 * - Grid/axes are faint and 1px; text always uses text colors, never the data color.
 * - Every mark shows its value in a tooltip on hover/tap.
 */
import { h } from './dom.js';
import { addDays, startOfWeek, formatShort, formatLong, MONTHS_SHORT, WEEKDAYS_MIN } from '../core/dates.js';

/* ───────────────────────── tooltip ───────────────────────── */

/**
 * A single tooltip bound to a container. Works on mouse hover and on tap.
 * Target elements must have data-tip="text".
 */
function withTooltip(container) {
  const tip = h('div', { class: 'chart-tip', role: 'status', 'aria-live': 'polite' });
  container.append(tip);
  let active = null;

  function show(target) {
    if (active) active.classList.remove('is-active');
    active = target;
    target.classList.add('is-active');
    tip.textContent = target.dataset.tip;
    const c = container.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    tip.classList.add('show');
    const tw = tip.offsetWidth;
    let x = t.left - c.left + t.width / 2 - tw / 2;
    x = Math.max(0, Math.min(x, c.width - tw));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(t.top - c.top - tip.offsetHeight - 8)}px)`;
  }

  function hide() {
    tip.classList.remove('show');
    active?.classList.remove('is-active');
    active = null;
  }

  const find = (e) => e.target.closest?.('[data-tip]');
  container.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = find(e);
    if (t && container.contains(t)) show(t);
  });
  container.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  // Touch: tap a mark → show; tap empty space → hide.
  // (No toggling: with a mouse the tooltip is already open from hover, so a click would close it.)
  container.addEventListener('click', (e) => {
    const t = find(e);
    if (t && container.contains(t)) show(t);
    else hide();
  });
  return { hide };
}

/* ───────────────────────── heatmap ───────────────────────── */

/** Maps a ratio to an intensity level 0–4. null → nothing planned. */
export function heatLevel(ratio) {
  if (ratio == null) return -1;
  if (ratio <= 0) return 0;
  if (ratio < 0.5) return 1;
  if (ratio < 0.75) return 2;
  if (ratio < 1) return 3;
  return 4;
}

/**
 * GitHub-style calendar. Weeks are columns, days are rows (Monday on top).
 * @param {{key:string, done:number, total:number, ratio:number|null}[]} series chronological
 * @param {{color?:string, label?:(d)=>string}} opts color: hue for a single habit
 */
export function heatmap(series, { color, label } = {}) {
  if (!series.length) return h('p', { class: 'muted small' }, 'No data.');
  const first = startOfWeek(series[0].key);
  const byKey = new Map(series.map((d) => [d.key, d]));
  const last = series[series.length - 1].key;

  const cols = [];
  const months = [];
  let lastMonth = null;
  let lastLabelAt = -9;
  for (let weekStart = first, w = 0; weekStart <= last; weekStart = addDays(weekStart, 7), w++) {
    // Month label on the month's first week; skipped when too close (< 3 columns) to the previous one.
    const m = addDays(weekStart, 6).slice(5, 7);
    if (m !== lastMonth && w - lastLabelAt >= 3) {
      months.push(MONTHS_SHORT[+m - 1]);
      lastLabelAt = w;
    } else {
      months.push('');
    }
    lastMonth = m;
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(weekStart, d);
      const item = byKey.get(key);
      if (!item) {
        cells.push(h('i', { class: 'hm-cell hm-none' }));
        continue;
      }
      const lvl = heatLevel(item.ratio);
      const text = label ? label(item) : item.total ? `${formatLong(key)} · ${item.done}/${item.total}` : `${formatLong(key)} · nothing planned`;
      cells.push(h('i', { class: `hm-cell hm-${lvl < 0 ? 'empty' : lvl}`, 'data-tip': text, 'aria-label': text, role: 'img' }));
    }
    cols.push(h('div', { class: 'hm-col' }, cells));
  }

  const grid = h(
    'div',
    { class: 'hm-scroll' },
    h('div', { class: 'hm-months', 'aria-hidden': 'true' }, months.map((m) => h('span', null, m))),
    h('div', { class: 'hm-grid' }, cols),
  );
  const wrap = h(
    'div',
    { class: 'chart heatmap', style: color ? { '--hm': color } : null },
    h(
      'div',
      { class: 'hm-body' },
      h('div', { class: 'hm-days', 'aria-hidden': 'true' }, WEEKDAYS_MIN.map((d, i) => h('span', null, i % 2 === 0 ? d : ''))),
      grid,
    ),
    h(
      'div',
      { class: 'hm-legend', 'aria-hidden': 'true' },
      h('span', null, 'Less'),
      [0, 1, 2, 3, 4].map((l) => h('i', { class: `hm-cell hm-${l}` })),
      h('span', null, 'All'),
    ),
  );
  withTooltip(wrap);
  // Show the most recent week.
  requestAnimationFrame(() => {
    grid.scrollLeft = grid.scrollWidth;
  });
  return wrap;
}

/* ───────────────────────── columns ───────────────────────── */

/**
 * Vertical columns for a single series (0–100%).
 * @param {{label:string, value:number|null, tip:string, highlight?:boolean}[]} items value: 0..1
 * @param {{valueLabel?:(item)=>string, scale?:[string,string]}} opts label drawn above the highlighted column
 */
export function columns(items, { valueLabel, scale = ['100', '50'] } = {}) {
  const bars = items.map((it) =>
    h(
      'div',
      { class: ['col', it.highlight && 'is-hl'], 'data-tip': it.tip, role: 'img', 'aria-label': it.tip },
      h(
        'div',
        { class: 'col-track' },
        it.value != null && h('div', { class: 'col-bar', style: { height: `${Math.max(2, Math.round(it.value * 100))}%` } }),
        it.value != null && it.highlight && valueLabel && h('span', { class: 'col-value num', style: { bottom: `${Math.round(it.value * 100)}%` } }, valueLabel(it)),
      ),
      h('span', { class: 'col-label' }, it.label),
    ),
  );
  const wrap = h(
    'div',
    { class: 'chart columns' },
    h(
      'div',
      { class: 'col-grid', 'aria-hidden': 'true' },
      h('span', { class: 'gl', style: { bottom: '100%' } }, h('em', null, scale[0])),
      h('span', { class: 'gl', style: { bottom: '50%' } }, h('em', null, scale[1])),
      h('span', { class: 'gl gl-base', style: { bottom: '0%' } }),
    ),
    h('div', { class: 'col-row' }, bars),
  );
  withTooltip(wrap);
  return wrap;
}

/* ───────────────────────── trend line ───────────────────────── */

/**
 * Daily value line (e.g. day score 1–10). The line breaks on missing days.
 * @param {{key:string, value:number|null}[]} points chronological, one per day
 */
export function trendLine(points, { min = 1, max = 10, format = (v) => String(v) } = {}) {
  const W = 320;
  const H = 120;
  const PAD_T = 10;
  const PAD_B = 10;
  const n = points.length;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 12) + 6);
  const y = (v) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  // Broken path: start a new segment after a day without a value.
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (p.value == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `;
    pen = true;
  });

  const lastIdx = points.map((p) => p.value != null).lastIndexOf(true);
  const svg = h(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'trend-svg', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    h('line', { class: 'tr-grid', x1: 0, x2: W, y1: y(max), y2: y(max) }),
    h('line', { class: 'tr-grid', x1: 0, x2: W, y1: y((max + min) / 2), y2: y((max + min) / 2) }),
    h('line', { class: 'tr-grid tr-base', x1: 0, x2: W, y1: y(min), y2: y(min) }),
    h('path', { class: 'tr-line', d: d.trim() }),
  );

  // Dots and hit areas live in HTML so circles don't distort when the SVG stretches.
  const dots = h('div', { class: 'tr-dots' });
  points.forEach((p, i) => {
    if (p.value == null) return;
    dots.append(
      h('i', {
        class: ['tr-dot', i === lastIdx && 'is-last'],
        style: { left: `${(x(i) / W) * 100}%`, top: `${(y(p.value) / H) * 100}%` },
      }),
    );
  });
  const hits = h(
    'div',
    { class: 'tr-hits' },
    points.map((p) => h('i', { class: 'tr-hit', 'data-tip': `${formatShort(p.key)} · ${p.value == null ? 'no entry' : format(p.value)}` })),
  );
  const wrap = h(
    'div',
    { class: 'chart trend' },
    h('div', { class: 'tr-labels', 'aria-hidden': 'true' }, h('span', null, String(max)), h('span', null, String(min))),
    h('div', { class: 'tr-plot' }, svg, dots, hits),
  );
  withTooltip(wrap);
  return wrap;
}

/* ───────────────────────── small pieces ───────────────────────── */

/** A single number tile — for headline values that don't need a chart. */
export function statTile(label, value, sub) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value num' }, value),
    sub && h('span', { class: 'stat-sub' }, sub),
  );
}

/** Thin horizontal progress bar (0..1). */
export function meter(value, { color } = {}) {
  const pct = value == null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return h(
    'span',
    { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, style: color ? { '--c': color } : null },
    h('span', { class: 'meter-fill', style: { width: `${pct}%` } }),
  );
}

export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
