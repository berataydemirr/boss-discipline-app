/**
 * Bugün ekranı: tarih, hafta şeridi, günün sözü, alışkanlıklar, günlük not.
 * #/today            → bugün
 * #/today/2026-10-08 → geçmiş bir gün (doldurmayı unuttuğun günler için)
 */
import { h, autosize, vibrate, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, showError } from '../ui/toast.js';
import { openHabitForm } from '../ui/habit-form.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createLogger } from '../core/logger.js';
import { colorHex } from '../core/validate.js';
import {
  todayKey,
  addDays,
  isValidKey,
  startOfWeek,
  weekday,
  formatDayMonth,
  relativeLabel,
  WEEKDAYS,
  WEEKDAYS_MIN,
} from '../core/dates.js';
import { currentStreak, isScheduled } from '../logic/streaks.js';
import { dayCompletion } from '../logic/stats.js';
import { pickForDate, quotePool } from '../logic/quotes.js';

const log = createLogger('today');

/** Son işaretlenen (animasyon için) — `${habitId}|${date}` */
let lastToggled = null;
/** Henüz kaydedilmemiş not taslakları: yeniden çizimde yazılan metin kaybolmasın. */
const noteDrafts = new Map();
/** "Plan dışı" bölümü açık mı — yeniden çizimde kapanmasın. */
let offPlanOpen = false;

const SUGGESTIONS = ['Spor', '20 sayfa kitap', 'Erken kalk', '2 litre su', 'Meditasyon', 'İngilizce çalış'];

const dayHref = (key, today) => (key === today ? 'today' : `today/${key}`);

export function render({ params, onCleanup }) {
  const today = todayKey();
  let date = params[0] ?? today;
  if (!isValidKey(date) || date > today) {
    log.warn('Geçersiz gün parametresi, bugüne dönülüyor', { date });
    date = today;
  }

  return h(
    'div',
    { class: 'page today' },
    header(date, today),
    weekStrip(date, today),
    quoteBlock(date),
    habitsSection(date, today),
    noteSection(date, onCleanup),
  );
}

/* ───────────────────────── başlık ───────────────────────── */

function header(date, today) {
  const rel = relativeLabel(date, today);
  return h(
    'header',
    { class: 'today-head' },
    h(
      'div',
      { class: 'today-head-text' },
      h('p', { class: 'eyebrow' }, WEEKDAYS[weekday(date)], rel && rel !== 'Bugün' ? h('span', { class: 'eyebrow-rel' }, ` · ${rel}`) : null),
      h('h1', { class: 'display' }, formatDayMonth(date)),
    ),
    h(
      'div',
      { class: 'head-actions' },
      date !== today &&
        h('button', { class: 'chip chip-accent', onclick: () => navigate('today') }, 'Bugüne dön'),
      h('a', { class: 'btn-icon', href: '#/settings', 'aria-label': 'Ayarlar' }, icon('settings')),
    ),
  );
}

/* ───────────────────────── hafta şeridi ───────────────────────── */

function weekStrip(date, today) {
  const start = startOfWeek(date);
  const isDone = (id, k) => store.isDone(id, k);
  const habits = store.allHabits();

  const cells = Array.from({ length: 7 }, (_, i) => {
    const k = addDays(start, i);
    const future = k > today;
    const { ratio } = future ? { ratio: null } : dayCompletion(habits, isDone, k);
    const pct = ratio == null ? 0 : Math.round(ratio * 100);
    return h(
      'button',
      {
        class: ['ws-day', k === date && 'is-selected', k === today && 'is-today', ratio === 1 && 'is-full'],
        disabled: future,
        'aria-label': `${formatDayMonth(k)}${ratio != null ? `, %${pct} tamamlandı` : ''}`,
        'aria-current': k === date ? 'date' : null,
        onclick: () => navigate(dayHref(k, today)),
      },
      h('span', { class: 'ws-wd' }, WEEKDAYS_MIN[i]),
      h('span', { class: 'ws-num num' }, String(Number(k.slice(8)))),
      h('span', { class: 'ws-ring', style: { '--p': `${pct}%` }, 'aria-hidden': 'true' }),
    );
  });

  const prevWeek = addDays(start, -7);
  const nextWeek = addDays(start, 7);
  return h(
    'nav',
    { class: 'week-strip', 'aria-label': 'Hafta' },
    h(
      'button',
      { class: 'btn-icon ws-arrow', 'aria-label': 'Önceki hafta', onclick: () => navigate(dayHref(addDays(prevWeek, 6), today)) },
      icon('chevron-left', { size: 18 }),
    ),
    h('div', { class: 'ws-days' }, cells),
    h(
      'button',
      {
        class: 'btn-icon ws-arrow',
        'aria-label': 'Sonraki hafta',
        disabled: nextWeek > today,
        onclick: () => {
          const target = addDays(nextWeek, 6) > today ? today : addDays(nextWeek, 6);
          navigate(dayHref(target, today));
        },
      },
      icon('chevron-right', { size: 18 }),
    ),
  );
}

/* ───────────────────────── günün sözü ───────────────────────── */

function quoteBlock(date) {
  const { quoteSource, favQuotes } = store.settings;
  const pool = quotePool(store.userQuotes(), quoteSource, favQuotes);
  const q = pickForDate(pool, date);
  if (!q) return null;
  const isFav = favQuotes.includes(q.id);

  return h(
    'figure',
    { class: 'quote' },
    h('span', { class: 'quote-mark', 'aria-hidden': 'true' }, '“'),
    h('blockquote', { class: 'quote-text' }, q.text),
    h(
      'figcaption',
      { class: 'quote-foot' },
      h('span', { class: 'quote-author' }, q.author || 'Anonim'),
      h(
        'span',
        { class: 'quote-actions' },
        h(
          'button',
          {
            class: ['btn-icon btn-icon-sm', isFav && 'is-fav'],
            'aria-label': isFav ? 'Favorilerden çıkar' : 'Favorilere ekle',
            'aria-pressed': String(isFav),
            onclick: () => store.toggleFavoriteQuote(q.id).catch(showError),
          },
          icon('heart', { size: 17 }),
        ),
        h(
          'button',
          {
            class: 'btn-icon btn-icon-sm',
            'aria-label': 'Kopyala',
            onclick: async () => {
              const ok = await copyText(`“${q.text}” — ${q.author || 'Anonim'}`);
              toast(ok ? 'Kopyalandı' : 'Kopyalanamadı', { type: ok ? 'info' : 'warn' });
            },
          },
          icon('copy', { size: 17 }),
        ),
      ),
    ),
  );
}

/* ───────────────────────── alışkanlıklar ───────────────────────── */

function habitsSection(date, today) {
  const habits = store.habitsOn(date).filter((x) => x.kind === 'build');
  const planned = habits.filter((x) => isScheduled(x, date));
  const offPlan = habits.filter((x) => !isScheduled(x, date));
  const doneCount = planned.filter((x) => store.isDone(x.id, date)).length;

  if (!store.habits().length) return emptyHabits();

  const allDone = planned.length > 0 && doneCount === planned.length;

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Alışkanlıklar'),
      h(
        'div',
        { class: 'section-meta' },
        planned.length > 0 && h('span', { class: ['num', allDone && 'text-accent'] }, `${doneCount}/${planned.length}`),
        h('a', { class: 'link', href: '#/habits' }, 'Düzenle'),
      ),
    ),
    planned.length > 0 &&
      h(
        'div',
        { class: 'progress-seg', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': planned.length, 'aria-valuenow': doneCount },
        planned.map((x) =>
          h('i', { class: store.isDone(x.id, date) ? 'on' : '', style: { '--c': colorHex(x.color) } }),
        ),
      ),
    planned.length === 0 && h('p', { class: 'muted small pad-y' }, 'Bu gün için planlı alışkanlık yok.'),
    planned.length > 0 && h('ul', { class: 'habit-list' }, planned.map((x) => habitRow(x, date, today))),
    offPlan.length > 0 &&
      h(
        'details',
        { class: 'offplan', open: offPlanOpen, ontoggle: (e) => (offPlanOpen = e.target.open) },
        h('summary', null, `Plan dışı (${offPlan.length})`),
        h('ul', { class: 'habit-list' }, offPlan.map((x) => habitRow(x, date, today, true))),
      ),
    h(
      'button',
      { class: 'btn btn-quiet add-row', onclick: () => openHabitForm() },
      icon('plus', { size: 18 }),
      'Alışkanlık ekle',
    ),
  );
}

function emptyHabits() {
  return h(
    'section',
    { class: 'section empty' },
    h('p', { class: 'empty-title' }, 'Bir şeyle başla.'),
    h('p', { class: 'muted' }, 'Her gün yapmak istediğin küçük bir şey seç. Önerilerden birine dokun ya da kendin yaz.'),
    h(
      'div',
      { class: 'chip-row' },
      SUGGESTIONS.map((name) => h('button', { class: 'chip', onclick: () => openHabitForm(null, { name }) }, name)),
    ),
    h('button', { class: 'btn btn-primary', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'Alışkanlık ekle'),
  );
}

function habitRow(habit, date, today, offPlan = false) {
  const done = store.isDone(habit.id, date);
  const streak = currentStreak(habit, store.datesFor(habit.id), today);
  const color = colorHex(habit.color);
  const justNow = lastToggled === `${habit.id}|${date}`;

  return h(
    'li',
    { class: ['habit', done && 'is-done', offPlan && 'is-offplan'], style: { '--c': color } },
    h(
      'button',
      {
        class: ['check', justNow && done && 'pop'],
        'aria-pressed': String(done),
        'aria-label': `${habit.name}: ${done ? 'yapıldı, geri al' : 'yapıldı olarak işaretle'}`,
        onclick: () => toggle(habit, date),
      },
      icon('check', { size: 18, cls: 'check-icon' }),
    ),
    h(
      'button',
      { class: 'habit-body', onclick: () => openHabitForm(habit), 'aria-label': `${habit.name} ayrıntıları` },
      h('span', { class: 'habit-name' }, habit.name),
      h(
        'span',
        { class: 'habit-meta' },
        streak > 0
          ? [icon('flame', { size: 13, cls: 'meta-flame' }), h('span', { class: 'num' }, String(streak)), ' gün seri']
          : 'Seri yok',
        offPlan ? ' · plan dışı' : '',
      ),
    ),
    weekDots(habit, date),
  );
}

function weekDots(habit, date) {
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(date, -i);
    let cls = 'wd';
    if (k < habit.createdAt || (!isScheduled(habit, k) && !store.isDone(habit.id, k))) cls += ' wd-off';
    else if (store.isDone(habit.id, k)) cls += ' wd-done';
    else cls += ' wd-miss';
    cells.push(h('i', { class: cls }));
  }
  return h('div', { class: 'wdots', 'aria-hidden': 'true' }, cells);
}

async function toggle(habit, date) {
  lastToggled = `${habit.id}|${date}`;
  try {
    const on = await store.toggleCheck(habit.id, date);
    if (on) {
      vibrate(10);
      celebrateIfComplete(date);
    }
  } catch (e) {
    showError(e, 'İşaretlenemedi.');
  } finally {
    setTimeout(() => {
      if (lastToggled === `${habit.id}|${date}`) lastToggled = null;
    }, 600);
  }
}

function celebrateIfComplete(date) {
  const { done, total } = dayCompletion(store.allHabits(), (id, k) => store.isDone(id, k), date);
  if (total > 0 && done === total) {
    log.info('Tam gün', { date, total });
    toast(total > 1 ? `Tam gün. ${total} alışkanlığın hepsi tamam.` : 'Tam gün.');
  }
}

/* ───────────────────────── not ───────────────────────── */

function noteSection(date, onCleanup) {
  const saved = store.day(date).note ?? '';
  const initial = noteDrafts.has(date) ? noteDrafts.get(date) : saved;
  const status = h('span', { class: 'save-status' }, saved ? 'Kaydedildi' : '');
  let timer = null;

  async function save() {
    clearTimeout(timer);
    timer = null;
    if (!noteDrafts.has(date)) return;
    const value = noteDrafts.get(date);
    try {
      await store.updateDay(date, { note: value }, { silent: true });
      // Kaydederken yeni bir şey yazılmadıysa taslağı temizle.
      if (noteDrafts.get(date) === value) noteDrafts.delete(date);
      if (status.isConnected) {
        status.textContent = value.trim() ? 'Kaydedildi' : '';
        status.classList.remove('is-busy');
      }
    } catch (e) {
      showError(e, 'Not kaydedilemedi.');
      if (status.isConnected) status.textContent = 'Kaydedilemedi';
    }
  }

  const ta = h('textarea', {
    class: 'note-input',
    rows: 3,
    maxlength: 5000,
    placeholder: 'Bugün ne yaptın? Neyi iyi yaptın, neye dikkat etmelisin?',
    'data-fk': `note-${date}`,
    oninput: (e) => {
      noteDrafts.set(date, e.target.value);
      status.textContent = 'Yazılıyor…';
      status.classList.add('is-busy');
      autosize(e.target);
      clearTimeout(timer);
      timer = setTimeout(save, 700);
    },
    onblur: () => save(),
  });
  ta.value = initial;
  requestAnimationFrame(() => autosize(ta));
  onCleanup(() => save());

  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Not'), status),
    h('div', { class: 'note-card' }, ta),
  );
}
