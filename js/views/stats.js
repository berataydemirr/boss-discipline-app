/**
 * Analiz: seviye, özet sayılar, yıllık takvim, haftalık oran, gün deseni,
 * alışkanlık tablosu, ruh hali içgörüleri, rozetler.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { heatmap, columns, trendLine, statTile, meter, pct } from '../ui/charts.js';
import { openHabitDetail } from '../ui/habit-detail.js';
import { store } from '../core/store.js';
import { colorHex } from '../core/validate.js';
import { todayKey, addDays, formatShort, WEEKDAYS, WEEKDAYS_SHORT } from '../core/dates.js';
import { dailySeries, weeklyRates, weekdayPattern, moodCorrelation, reviewAverages } from '../logic/stats.js';

export function render() {
  const today = todayKey();
  const habits = store.allHabits();

  if (!habits.length) {
    return h(
      'div',
      { class: 'page' },
      h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Analiz'), h('h1', { class: 'display' }, 'Henüz erken.')),
      h('p', { class: 'muted' }, 'Birkaç gün alışkanlıklarını işaretledikçe burada seriler, oranlar ve takvimin oluşacak.'),
      h('a', { class: 'btn btn-primary', href: '#/today', style: { marginTop: '20px' } }, 'Bugüne git'),
    );
  }

  const sum = store.summary();
  const isDone = (id, k) => store.isDone(id, k);
  const days = store.allDays();

  return h(
    'div',
    { class: 'page stats' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Analiz'), h('h1', { class: 'display' }, 'İlerleme')),
    levelCard(sum.level),
    kpis(sum, habits, isDone, today),
    calendarSection(habits, isDone, today),
    weeklySection(habits, isDone, today),
    weekdaySection(habits, isDone, sum.earliest, today),
    habitTable(sum),
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

/* ───────────────────────── seviye ───────────────────────── */

function levelCard(lv) {
  const left = lv.next - lv.points;
  return h(
    'div',
    { class: 'level-card' },
    h(
      'div',
      { class: 'level-top' },
      h('div', null, h('p', { class: 'eyebrow' }, `Seviye ${lv.level}`), h('p', { class: 'level-title serif' }, lv.title)),
      h('p', { class: 'level-points' }, h('span', { class: 'num' }, lv.points.toLocaleString('tr-TR')), ' puan'),
    ),
    meter(lv.progress),
    h('p', { class: 'level-next' }, `Sonraki seviyeye ${left.toLocaleString('tr-TR')} puan`),
  );
}

/* ───────────────────────── özet sayılar ───────────────────────── */

function kpis(sum, habits, isDone, today) {
  const thisWeek = weeklyRates(habits, isDone, today, 1)[0];
  const t = sum.totals;
  return h(
    'div',
    { class: 'stat-row stat-row-3' },
    statTile('Bu hafta', pct(thisWeek.rate), thisWeek.total ? `${thisWeek.done}/${thisWeek.total}` : null),
    statTile('En iyi seri', String(t.bestStreak), 'gün'),
    statTile('Tam gün', String(t.perfectDays), t.perfectRun > 1 ? `${t.perfectRun} gün üst üste` : null),
  );
}

/* ───────────────────────── takvim ───────────────────────── */

function calendarSection(habits, isDone, today) {
  const from = addDays(today, -7 * 52);
  const series = dailySeries(habits, isDone, from, today).map((d) => (d.key === today && d.done < d.total ? { ...d, ratio: d.done ? d.ratio : null } : d));
  return section('Son 12 ay', null, heatmap(series));
}

/* ───────────────────────── haftalık ───────────────────────── */

function weeklySection(habits, isDone, today) {
  const weeks = weeklyRates(habits, isDone, today, 12);
  const items = weeks.map((w, i) => ({
    label: i === weeks.length - 1 ? 'Bu' : i % 3 === 2 ? formatShort(w.start).split(' ')[0] : '',
    value: w.rate,
    highlight: i === weeks.length - 1,
    tip: `${formatShort(w.start)} haftası · ${w.total ? `${pct(w.rate)} (${w.done}/${w.total})` : 'plan yok'}`,
  }));
  const rated = weeks.filter((w) => w.rate != null);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rate, 0) / rated.length : null;
  return section('Haftalık oran', avg != null ? `12 hafta ort. ${pct(avg)}` : null, columns(items, { valueLabel: (it) => pct(it.value) }));
}

/* ───────────────────────── gün deseni ───────────────────────── */

function weekdaySection(habits, isDone, earliest, today) {
  const from = earliest > addDays(today, -83) ? earliest : addDays(today, -83); // son 12 hafta
  const pattern = weekdayPattern(habits, isDone, from, today);
  const rated = pattern.filter((p) => p.rate != null && p.total >= 2);
  let insight = null;
  if (rated.length >= 3) {
    const best = rated.reduce((a, b) => (b.rate > a.rate ? b : a));
    const worst = rated.reduce((a, b) => (b.rate < a.rate ? b : a));
    if (best.rate - worst.rate >= 0.1) {
      insight = `En güçlü günün ${WEEKDAYS[best.weekday]} (${pct(best.rate)}), en zayıf ${WEEKDAYS[worst.weekday]} (${pct(worst.rate)}).`;
    }
  }
  const items = pattern.map((p) => ({
    label: WEEKDAYS_SHORT[p.weekday],
    value: p.rate,
    tip: `${WEEKDAYS[p.weekday]} · ${p.total ? `${pct(p.rate)} (${p.done}/${p.total})` : 'veri yok'}`,
  }));
  return section('Haftanın günleri', 'son 12 hafta', columns(items), insight && h('p', { class: 'insight' }, insight));
}

/* ───────────────────────── alışkanlık tablosu ───────────────────────── */

function habitTable(sum) {
  const active = store.habits();
  if (!active.length) return null;
  return section(
    'Alışkanlıklar',
    'son 30 gün',
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
                ? h('span', { class: 'hrow-sub' }, `${s?.current ?? 0} gün temiz · en uzun ${s?.best ?? 0}`)
                : h(
                    'span',
                    { class: 'hrow-sub' },
                    icon('flame', { size: 12, cls: 'meta-flame' }),
                    `${s?.current ?? 0} · en iyi ${s?.best ?? 0}`,
                  ),
            ),
            !isQuit && h('span', { class: 'hrow-rate' }, h('span', { class: 'num' }, pct(s?.rate30?.rate)), meter(s?.rate30?.rate, { color: 'var(--text-2)' })),
          ),
        );
      }),
    ),
  );
}

/* ───────────────────────── ruh hali ───────────────────────── */

function moodSection(habits, isDone, days, today) {
  const from = addDays(today, -29);
  const avgs = reviewAverages(days, from, today);
  if (avgs.count === 0) {
    return section(
      'Ruh hali',
      null,
      h('p', { class: 'muted small' }, 'Akşam değerlendirmesi yaptıkça gün puanın, ruh halin ve hangi alışkanlığın sana iyi geldiği burada görünür.'),
    );
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const points = [];
  for (let k = from; k <= today; k = addDays(k, 1)) points.push({ key: k, value: byDate.get(k)?.review?.score ?? null });

  const correlations = moodCorrelation(habits, isDone, days).slice(0, 3);
  const nameOf = (id) => store.habit(id)?.name ?? '?';
  const fmt = (v) => (v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 1 }));

  return section(
    'Ruh hali',
    `son 30 gün · ${avgs.count} kayıt`,
    h(
      'div',
      { class: 'stat-row stat-row-3' },
      statTile('Gün puanı', fmt(avgs.score), 'ortalama / 10'),
      statTile('Ruh hali', fmt(avgs.mood), 'ortalama / 5'),
      statTile('Enerji', fmt(avgs.energy), 'ortalama / 5'),
    ),
    h('p', { class: 'chart-caption' }, 'Gün puanı'),
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
              ? `${nameOf(c.habitId)} yaptığın günlerde ruh halin ortalama ${fmt(c.delta)} puan daha iyi.`
              : `${nameOf(c.habitId)} yaptığın günlerde ruh halin ortalama ${fmt(-c.delta)} puan daha düşük.`,
            h('span', { class: 'faint' }, ` (${c.nWith} / ${c.nWithout} gün)`),
          ),
        ),
      ),
  );
}

/* ───────────────────────── rozetler ───────────────────────── */

function badgeProgress(b) {
  if (b.id === 'odak-10') return `${Math.floor(b.current / 60)}/${b.target / 60} sa`;
  return `${Math.min(b.current, b.target)}/${b.target}`;
}

function badgesSection(badges) {
  const earned = badges.filter((b) => b.earned).length;
  return section(
    'Rozetler',
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
