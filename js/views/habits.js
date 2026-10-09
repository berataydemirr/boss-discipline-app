/**
 * Manage habits: reorder, edit, archive, restore.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showError, toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/sheet.js';
import { openHabitForm, scheduleLabel } from '../ui/habit-form.js';
import { store } from '../core/store.js';
import { colorHex } from '../core/validate.js';
import { formatShort } from '../core/dates.js';

export function render() {
  const active = store.habits();
  const archived = store.archivedHabits();

  return h(
    'div',
    { class: 'page' },
    h(
      'header',
      { class: 'page-head page-head-row' },
      h('a', { class: 'btn-icon', href: '#/today', 'aria-label': 'Back' }, icon('chevron-left')),
      h('h1', { class: 'display-sm' }, 'Habits'),
      h('button', { class: 'btn-icon', 'aria-label': 'New habit', onclick: () => openHabitForm() }, icon('plus')),
    ),
    active.length
      ? h('ul', { class: 'manage-list' }, active.map((x, i) => activeRow(x, i, active.length)))
      : h('p', { class: 'muted pad-y' }, 'No active habits.'),
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'New habit'),
    archived.length > 0 &&
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, `Archive (${archived.length})`)),
        h('ul', { class: 'manage-list is-archived' }, archived.map(archivedRow)),
      ),
  );
}

function activeRow(habit, i, n) {
  return h(
    'li',
    { class: 'manage-row', style: { '--c': colorHex(habit.color) } },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h(
      'button',
      { class: 'manage-main', onclick: () => openHabitForm(habit) },
      h('span', { class: 'manage-name' }, habit.name),
      h('span', { class: 'manage-meta' }, habit.kind === 'quit' ? 'Quit' : scheduleLabel(habit.days)),
    ),
    h(
      'div',
      { class: 'manage-actions' },
      h(
        'button',
        { class: 'btn-icon btn-icon-sm', 'aria-label': 'Move up', disabled: i === 0, onclick: () => store.moveHabit(habit.id, -1).catch(showError) },
        icon('chevron-up', { size: 18 }),
      ),
      h(
        'button',
        { class: 'btn-icon btn-icon-sm', 'aria-label': 'Move down', disabled: i === n - 1, onclick: () => store.moveHabit(habit.id, 1).catch(showError) },
        icon('chevron-down', { size: 18 }),
      ),
    ),
  );
}

function archivedRow(habit) {
  return h(
    'li',
    { class: 'manage-row', style: { '--c': colorHex(habit.color) } },
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'manage-main' },
      h('span', { class: 'manage-name' }, habit.name),
      h('span', { class: 'manage-meta' }, `Archived on ${formatShort(habit.archivedAt)}`),
    ),
    h(
      'div',
      { class: 'manage-actions' },
      h(
        'button',
        {
          class: 'btn-icon btn-icon-sm',
          'aria-label': 'Restore',
          onclick: async () => {
            try {
              await store.archiveHabit(habit.id, false);
              toast('Restored');
            } catch (e) {
              showError(e);
            }
          },
        },
        icon('restore', { size: 18 }),
      ),
      h(
        'button',
        {
          class: 'btn-icon btn-icon-sm text-danger',
          'aria-label': 'Delete permanently',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Delete permanently?',
              message: `“${habit.name}” and its entire history will be deleted. This cannot be undone.`,
              confirmLabel: 'Delete',
              danger: true,
            });
            if (ok) store.deleteHabit(habit.id).then(() => toast('Deleted'), showError);
          },
        },
        icon('trash', { size: 18 }),
      ),
    ),
  );
}
