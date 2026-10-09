/**
 * Plan: weekly and monthly goals.
 * #/plan                 → this week
 * #/plan/month           → this month
 * #/plan/week/2026-10-12 → the week of that date (navigating back/forward)
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, showError } from '../ui/toast.js';
import { meter } from '../ui/charts.js';
import { segmented } from './settings.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createLogger } from '../core/logger.js';
import { todayKey, isValidKey, addDays, addMonths, periodKey, periodRange, isoWeek, formatShort, formatMonthYear } from '../core/dates.js';

const log = createLogger('plan');

function title(period, anchor) {
  if (period === 'month') return formatMonthYear(anchor);
  const { start, end } = periodRange('week', anchor);
  return `${formatShort(start)} – ${formatShort(end)}`;
}

function eyebrow(period, anchor, today) {
  const cur = periodKey(period, today) === periodKey(period, anchor);
  if (period === 'month') return cur ? 'This month' : 'Month';
  return `Week ${isoWeek(anchor).week}${cur ? ' · this week' : ''}`;
}

export function render({ params }) {
  const today = todayKey();
  const period = params[0] === 'month' ? 'month' : 'week';
  let anchor = params[1] ?? today;
  if (!isValidKey(anchor)) {
    log.warn('Invalid plan date', { anchor });
    anchor = today;
  }
  const key = periodKey(period, anchor);
  const isCurrent = key === periodKey(period, today);
  const goals = store.goals(period, key);
  const done = goals.filter((g) => g.done).length;

  const shift = (n) => (period === 'month' ? addMonths(anchor, n) : addDays(anchor, 7 * n));
  const go = (a) => navigate(`plan/${period}/${a}`);

  // Unfinished goals from the previous period: only offered on the current period.
  const prevKey = periodKey(period, shift(-1));
  const leftovers = isCurrent ? store.goals(period, prevKey).filter((g) => !g.done) : [];

  const input = h('input', {
    class: 'goal-input',
    type: 'text',
    maxlength: 120,
    enterkeyhint: 'done',
    placeholder: period === 'month' ? 'What do you want to achieve this month?' : 'What do you want to finish this week?',
    'data-fk': `goal-new-${period}-${key}`,
  });

  async function add(e) {
    e.preventDefault();
    const text = input.value;
    if (!text.trim()) {
      input.focus();
      return;
    }
    try {
      await store.addGoal({ title: text, period, periodKey: key });
      input.value = '';
    } catch (err) {
      showError(err, 'Could not add the goal.');
    }
  }

  async function carryOver() {
    try {
      for (const g of leftovers) await store.updateGoal(g.id, { periodKey: key });
      toast(`Moved ${leftovers.length} ${leftovers.length === 1 ? 'goal' : 'goals'}`);
    } catch (err) {
      showError(err);
    }
  }

  return h(
    'div',
    { class: 'page plan' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Plan'), h('h1', { class: 'display' }, 'Goals')),
    segmented(
      [
        ['week', 'Weekly'],
        ['month', 'Monthly'],
      ],
      period,
      (v) => navigate(v === 'month' ? 'plan/month' : 'plan'),
    ),
    h(
      'div',
      { class: 'period-nav' },
      h('button', { class: 'btn-icon', 'aria-label': 'Previous period', onclick: () => go(shift(-1)) }, icon('chevron-left')),
      h('div', { class: 'period-title' }, h('span', { class: 'eyebrow' }, eyebrow(period, anchor, today)), h('span', { class: 'period-name serif' }, title(period, anchor))),
      h('button', { class: 'btn-icon', 'aria-label': 'Next period', onclick: () => go(shift(1)) }, icon('chevron-right')),
    ),
    !isCurrent &&
      h(
        'button',
        { class: 'chip chip-accent period-back', onclick: () => navigate(period === 'month' ? 'plan/month' : 'plan') },
        period === 'month' ? 'Back to this month' : 'Back to this week',
      ),

    leftovers.length > 0 &&
      h(
        'div',
        { class: 'carry' },
        h('p', null, `${leftovers.length} unfinished ${leftovers.length === 1 ? 'goal' : 'goals'} from last ${period}.`),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: carryOver }, 'Move here'),
      ),

    goals.length > 0 && h('div', { class: 'goal-progress' }, meter(done / goals.length), h('span', { class: 'num' }, `${done}/${goals.length}`)),

    h(
      'ul',
      { class: 'goal-list' },
      goals.map((g) =>
        h(
          'li',
          { class: ['goal', g.done && 'is-done'] },
          h(
            'button',
            {
              class: 'prio-check',
              'aria-pressed': String(g.done),
              'aria-label': `${g.title}: ${g.done ? 'done, tap to undo' : 'mark as done'}`,
              onclick: () => store.updateGoal(g.id, { done: !g.done }).catch(showError),
            },
            icon('check', { size: 14 }),
          ),
          h('span', { class: 'goal-title' }, g.title),
          h(
            'button',
            { class: 'btn-icon btn-icon-sm goal-del', 'aria-label': `Delete goal ${g.title}`, onclick: () => store.deleteGoal(g.id).catch(showError) },
            icon('close', { size: 16 }),
          ),
        ),
      ),
    ),
    h('form', { class: 'goal-add', onsubmit: add }, icon('plus', { size: 18, cls: 'goal-add-icon' }), input, h('button', { class: 'btn btn-ghost btn-sm', type: 'submit' }, 'Add')),
    goals.length === 0 &&
      h(
        'p',
        { class: 'muted small plan-hint' },
        period === 'month'
          ? 'Two or three big goals a month are enough. Make them measurable, like “Finish 4 books”.'
          : 'Set 3–5 concrete goals for the week. Pick your daily priorities from them each morning.',
      ),
  );
}
