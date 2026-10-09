/**
 * Today screen: date, week strip, quote of the day, priorities, habits, quit habits,
 * evening review and note.
 * #/today            → today
 * #/today/2026-10-08 → a past day (for days you forgot to fill in)
 */
import { h, autosize, vibrate, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, showError } from '../ui/toast.js';
import { openHabitForm } from '../ui/habit-form.js';
import { openHabitDetail } from '../ui/habit-detail.js';
import { openReviewForm, MOOD_LABELS, ENERGY_LABELS } from '../ui/review-form.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createLogger } from '../core/logger.js';
import { colorHex, MAX_PRIORITIES } from '../core/validate.js';
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
import { currentStreak, isScheduled, quitStats } from '../logic/streaks.js';
import { dayCompletion } from '../logic/stats.js';
import { pickForDate, quotePool } from '../logic/quotes.js';

const log = createLogger('today');

/** Last toggled check (for the animation) — `${habitId}|${date}` */
let lastToggled = null;
/** Unsaved note drafts, so text being typed survives a re-render. */
const noteDrafts = new Map();
/** Whether the "Not planned" section is open — keeps it open across re-renders. */
let offPlanOpen = false;
/** Priority slots (date → 3 slots), so empty slots don't shift while typing. */
const prioDrafts = new Map();

/** Called after bulk changes such as an import. */
export function resetTodayDrafts() {
  noteDrafts.clear();
  prioDrafts.clear();
}

const SUGGESTIONS = ['Workout', 'Read 20 pages', 'Wake up early', 'Drink 2L of water', 'Meditate', 'Study a language'];

const dayHref = (key, today) => (key === today ? 'today' : `today/${key}`);

export function render({ params, onCleanup }) {
  const today = todayKey();
  let date = params[0] ?? today;
  if (!isValidKey(date) || date > today) {
    log.warn('Invalid day parameter, falling back to today', { date });
    date = today;
  }

  return h(
    'div',
    { class: 'page today' },
    header(date, today),
    weekStrip(date, today),
    quoteBlock(date),
    prioritiesSection(date, onCleanup),
    habitsSection(date, today),
    quitSection(date),
    reviewSection(date),
    noteSection(date, onCleanup),
  );
}

/* ───────────────────────── header ───────────────────────── */

function header(date, today) {
  const rel = relativeLabel(date, today);
  return h(
    'header',
    { class: 'today-head' },
    h(
      'div',
      { class: 'today-head-text' },
      h('p', { class: 'eyebrow' }, WEEKDAYS[weekday(date)], rel && rel !== 'Today' ? h('span', { class: 'eyebrow-rel' }, ` · ${rel}`) : null),
      h('h1', { class: 'display' }, formatDayMonth(date)),
    ),
    h(
      'div',
      { class: 'head-actions' },
      date !== today && h('button', { class: 'chip chip-accent', onclick: () => navigate('today') }, 'Back to today'),
      levelChip(),
      h('a', { class: 'btn-icon', href: '#/settings', 'aria-label': 'Settings' }, icon('settings')),
    ),
  );
}

function levelChip() {
  if (!store.habits().length) return null;
  const { level, progress, title } = store.summary().level;
  return h(
    'a',
    { class: 'level-chip', href: '#/stats', 'aria-label': `Level ${level}, ${title}. Open stats` },
    h('span', { class: 'level-ring', style: { '--p': `${Math.round(progress * 100)}%` }, 'aria-hidden': 'true' }),
    h('span', { class: 'num' }, String(level)),
  );
}

/* ───────────────────────── week strip ───────────────────────── */

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
        'aria-label': `${formatDayMonth(k)}${ratio != null ? `, ${pct}% complete` : ''}`,
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
    { class: 'week-strip', 'aria-label': 'Week' },
    h(
      'button',
      { class: 'btn-icon ws-arrow', 'aria-label': 'Previous week', onclick: () => navigate(dayHref(addDays(prevWeek, 6), today)) },
      icon('chevron-left', { size: 18 }),
    ),
    h('div', { class: 'ws-days' }, cells),
    h(
      'button',
      {
        class: 'btn-icon ws-arrow',
        'aria-label': 'Next week',
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

/* ───────────────────────── quote of the day ───────────────────────── */

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
      h('span', { class: 'quote-author' }, q.author || 'Anonymous'),
      h(
        'span',
        { class: 'quote-actions' },
        h(
          'button',
          {
            class: ['btn-icon btn-icon-sm', isFav && 'is-fav'],
            'aria-label': isFav ? 'Remove from favorites' : 'Add to favorites',
            'aria-pressed': String(isFav),
            onclick: () => store.toggleFavoriteQuote(q.id).catch(showError),
          },
          icon('heart', { size: 17 }),
        ),
        h(
          'button',
          {
            class: 'btn-icon btn-icon-sm',
            'aria-label': 'Copy',
            onclick: async () => {
              const ok = await copyText(`“${q.text}” — ${q.author || 'Anonymous'}`);
              toast(ok ? 'Copied' : 'Could not copy', { type: ok ? 'info' : 'warn' });
            },
          },
          icon('copy', { size: 17 }),
        ),
      ),
    ),
  );
}

/* ───────────────────────── habits ───────────────────────── */

function habitsSection(date, today) {
  const habits = store.habitsOn(date).filter((x) => x.kind === 'build');
  const planned = habits.filter((x) => isScheduled(x, date));
  const offPlan = habits.filter((x) => !isScheduled(x, date));
  const doneCount = planned.filter((x) => store.isDone(x.id, date)).length;

  if (!store.habits().length) return emptyHabits();
  if (!store.habits().some((x) => x.kind === 'build')) {
    return h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Habits')),
      h('button', { class: 'btn btn-quiet add-row', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'Add a habit to build'),
    );
  }

  const allDone = planned.length > 0 && doneCount === planned.length;

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Habits'),
      h(
        'div',
        { class: 'section-meta' },
        planned.length > 0 && h('span', { class: ['num', allDone && 'text-accent'] }, `${doneCount}/${planned.length}`),
        h('a', { class: 'link', href: '#/habits' }, 'Edit'),
      ),
    ),
    planned.length > 0 &&
      h(
        'div',
        { class: 'progress-seg', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': planned.length, 'aria-valuenow': doneCount },
        planned.map((x) => h('i', { class: store.isDone(x.id, date) ? 'on' : '', style: { '--c': colorHex(x.color) } })),
      ),
    planned.length === 0 && h('p', { class: 'muted small pad-y' }, 'Nothing planned for this day.'),
    planned.length > 0 && h('ul', { class: 'habit-list' }, planned.map((x) => habitRow(x, date, today))),
    offPlan.length > 0 &&
      h(
        'details',
        { class: 'offplan', open: offPlanOpen, ontoggle: (e) => (offPlanOpen = e.target.open) },
        h('summary', null, `Not planned (${offPlan.length})`),
        h('ul', { class: 'habit-list' }, offPlan.map((x) => habitRow(x, date, today, true))),
      ),
    h('button', { class: 'btn btn-quiet add-row', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'Add habit'),
  );
}

function emptyHabits() {
  return h(
    'section',
    { class: 'section empty' },
    h('p', { class: 'empty-title' }, 'Start with one thing.'),
    h('p', { class: 'muted' }, 'Pick something small you want to do every day. Tap a suggestion or write your own.'),
    h(
      'div',
      { class: 'chip-row' },
      SUGGESTIONS.map((name) => h('button', { class: 'chip', onclick: () => openHabitForm(null, { name }) }, name)),
    ),
    h('button', { class: 'btn btn-primary', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'Add habit'),
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
        'aria-label': `${habit.name}: ${done ? 'done, tap to undo' : 'mark as done'}`,
        onclick: () => toggle(habit, date),
      },
      icon('check', { size: 18, cls: 'check-icon' }),
    ),
    h(
      'button',
      { class: 'habit-body', onclick: () => openHabitDetail(habit.id), 'aria-label': `${habit.name} details` },
      h('span', { class: 'habit-name' }, habit.name),
      h(
        'span',
        { class: 'habit-meta' },
        streak > 0
          ? [icon('flame', { size: 13, cls: 'meta-flame' }), h('span', { class: 'num' }, String(streak)), ` day streak`]
          : 'No streak',
        offPlan ? ' · not planned' : '',
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
    showError(e, 'Could not check off.');
  } finally {
    setTimeout(() => {
      if (lastToggled === `${habit.id}|${date}`) lastToggled = null;
    }, 600);
  }
}

function celebrateIfComplete(date) {
  const { done, total } = dayCompletion(store.allHabits(), (id, k) => store.isDone(id, k), date);
  if (total > 0 && done === total) {
    log.info('Perfect day', { date, total });
    toast(total > 1 ? `Perfect day. All ${total} habits done.` : 'Perfect day.');
  }
}

/* ───────────────────────── priorities ───────────────────────── */

function prioritiesSection(date, onCleanup) {
  if (!prioDrafts.has(date)) {
    const saved = store.day(date).priorities ?? [];
    prioDrafts.set(
      date,
      Array.from({ length: MAX_PRIORITIES }, (_, i) => ({ text: saved[i]?.text ?? '', done: !!saved[i]?.done })),
    );
  }
  const slots = prioDrafts.get(date);
  let timer = null;

  async function persist(silent) {
    clearTimeout(timer);
    timer = null;
    try {
      await store.updateDay(date, { priorities: slots.map((x) => ({ ...x })) }, { silent });
    } catch (e) {
      showError(e, 'Could not save priorities.');
    }
  }
  onCleanup(() => {
    if (timer) persist(true);
  });

  const filled = slots.filter((x) => x.text.trim());
  const doneCount = filled.filter((x) => x.done).length;

  const rows = slots.map((slot, i) => {
    const check = h(
      'button',
      {
        class: 'prio-check',
        'aria-pressed': String(slot.done),
        'aria-label': `Priority ${i + 1}: ${slot.done ? 'done, tap to undo' : 'mark as done'}`,
        disabled: !slot.text.trim(),
        onclick: () => {
          slot.done = !slot.done;
          if (slot.done) vibrate(8);
          persist(false);
        },
      },
      icon('check', { size: 14 }),
    );
    const input = h('input', {
      class: 'prio-input',
      type: 'text',
      maxlength: 120,
      enterkeyhint: i < MAX_PRIORITIES - 1 ? 'next' : 'done',
      placeholder: ['The most important thing today', 'Second priority', 'Third priority'][i],
      'data-fk': `prio-${date}-${i}`,
      value: slot.text,
      oninput: (e) => {
        slot.text = e.target.value;
        if (!slot.text.trim()) slot.done = false;
        check.disabled = !slot.text.trim();
        clearTimeout(timer);
        timer = setTimeout(() => persist(true), 600);
      },
      onblur: () => {
        if (timer) persist(true);
      },
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = e.target.closest('.prio-list')?.querySelectorAll('.prio-input')[i + 1];
        if (next) next.focus();
        else e.target.blur();
      },
    });
    return h('li', { class: ['prio', slot.done && 'is-done'] }, h('span', { class: 'prio-num serif' }, String(i + 1)), input, check);
  });

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Priorities'),
      filled.length > 0 && h('span', { class: 'section-meta num' }, `${doneCount}/${filled.length}`),
    ),
    h('ol', { class: 'prio-list' }, rows),
  );
}

/* ───────────────────────── quit habits ───────────────────────── */

function quitSection(date) {
  const quits = store.habitsOn(date).filter((x) => x.kind === 'quit');
  if (!quits.length) return null;
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Quitting')),
    h('ul', { class: 'quit-list' }, quits.map((x) => quitRow(x, date))),
  );
}

function quitRow(habit, date) {
  const s = quitStats(habit, [...store.datesFor(habit.id)], date);
  return h(
    'li',
    { class: ['quit', s.slippedToday && 'is-slipped'], style: { '--c': colorHex(habit.color) } },
    h(
      'button',
      { class: 'quit-main', onclick: () => openHabitDetail(habit.id), 'aria-label': `${habit.name} details` },
      h('span', { class: 'quit-count' }, h('span', { class: 'quit-num serif' }, String(s.current)), h('span', { class: 'quit-unit' }, s.current === 1 ? 'day' : 'days')),
      h(
        'span',
        { class: 'quit-text' },
        h('span', { class: 'quit-name' }, habit.name),
        h('span', { class: 'quit-meta' }, s.slippedToday ? 'Slip logged for this day' : s.best > s.current ? `Longest: ${s.best} days` : 'Going clean'),
      ),
    ),
    h(
      'button',
      {
        class: ['btn btn-sm', s.slippedToday ? 'btn-quiet' : 'btn-ghost'],
        onclick: () => toggleSlip(habit, date, s.slippedToday),
      },
      s.slippedToday ? 'Undo' : 'I slipped',
    ),
  );
}

async function toggleSlip(habit, date, wasSlipped) {
  try {
    await store.toggleCheck(habit.id, date);
    if (!wasSlipped) {
      log.info('Slip logged', { habit: habit.name, date });
      toast('Logged. The counter starts over — tomorrow is what counts.', {
        action: { label: 'Undo', fn: () => store.toggleCheck(habit.id, date).catch(showError) },
      });
    }
  } catch (e) {
    showError(e);
  }
}

/* ───────────────────────── evening review ───────────────────────── */

function reviewSection(date) {
  const r = store.day(date).review;
  const head = h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Evening'));
  if (!r) {
    return h(
      'section',
      { class: 'section' },
      head,
      h(
        'button',
        { class: 'review-cta', onclick: () => openReviewForm(date) },
        h(
          'span',
          { class: 'review-cta-text' },
          h('span', { class: 'review-cta-title serif' }, 'Review your day'),
          h('span', { class: 'review-cta-sub' }, 'A score, your mood and two short questions. Takes a minute.'),
        ),
        icon('arrow-right', { size: 18, cls: 'review-cta-arrow' }),
      ),
    );
  }
  return h(
    'section',
    { class: 'section' },
    head,
    h(
      'button',
      { class: 'review-card', onclick: () => openReviewForm(date), 'aria-label': 'Edit review' },
      h('span', { class: 'review-score' }, h('span', { class: 'serif' }, String(r.score)), h('span', { class: 'review-of num' }, '/10')),
      h(
        'span',
        { class: 'review-body' },
        (r.mood || r.energy) &&
          h(
            'span',
            { class: 'review-tags' },
            r.mood && h('span', null, `Mood: ${MOOD_LABELS[r.mood - 1]}`),
            r.energy && h('span', null, `Energy: ${ENERGY_LABELS[r.energy - 1]}`),
          ),
        r.good && h('span', { class: 'review-line' }, h('b', null, 'Went well: '), r.good),
        r.improve && h('span', { class: 'review-line' }, h('b', null, 'Tomorrow: '), r.improve),
      ),
    ),
  );
}

/* ───────────────────────── note ───────────────────────── */

function noteSection(date, onCleanup) {
  const saved = store.day(date).note ?? '';
  const initial = noteDrafts.has(date) ? noteDrafts.get(date) : saved;
  const status = h('span', { class: 'save-status' }, saved ? 'Saved' : '');
  let timer = null;

  async function save() {
    clearTimeout(timer);
    timer = null;
    if (!noteDrafts.has(date)) return;
    const value = noteDrafts.get(date);
    try {
      await store.updateDay(date, { note: value }, { silent: true });
      // Clear the draft unless something new was typed while saving.
      if (noteDrafts.get(date) === value) noteDrafts.delete(date);
      if (status.isConnected) {
        status.textContent = value.trim() ? 'Saved' : '';
        status.classList.remove('is-busy');
      }
    } catch (e) {
      showError(e, 'Could not save the note.');
      if (status.isConnected) status.textContent = 'Not saved';
    }
  }

  const ta = h('textarea', {
    class: 'note-input',
    rows: 3,
    maxlength: 5000,
    placeholder: 'What did you do today? What went well, what needs attention?',
    'data-fk': `note-${date}`,
    oninput: (e) => {
      noteDrafts.set(date, e.target.value);
      status.textContent = 'Typing…';
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
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Note'), status),
    h('div', { class: 'note-card' }, ta),
  );
}
