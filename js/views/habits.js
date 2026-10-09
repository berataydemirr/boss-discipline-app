/**
 * Alışkanlıkları yönet: sırala, düzenle, arşivle, geri yükle.
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
      h('a', { class: 'btn-icon', href: '#/today', 'aria-label': 'Geri' }, icon('chevron-left')),
      h('h1', { class: 'display-sm' }, 'Alışkanlıklar'),
      h('button', { class: 'btn-icon', 'aria-label': 'Yeni alışkanlık', onclick: () => openHabitForm() }, icon('plus')),
    ),
    active.length
      ? h('ul', { class: 'manage-list' }, active.map((x, i) => activeRow(x, i, active.length)))
      : h('p', { class: 'muted pad-y' }, 'Aktif alışkanlık yok.'),
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => openHabitForm() }, icon('plus', { size: 18 }), 'Yeni alışkanlık'),
    archived.length > 0 &&
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, `Arşiv (${archived.length})`)),
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
      h('span', { class: 'manage-meta' }, habit.kind === 'quit' ? 'Bırakılacak' : scheduleLabel(habit.days)),
    ),
    h(
      'div',
      { class: 'manage-actions' },
      h(
        'button',
        { class: 'btn-icon btn-icon-sm', 'aria-label': 'Yukarı taşı', disabled: i === 0, onclick: () => store.moveHabit(habit.id, -1).catch(showError) },
        icon('chevron-up', { size: 18 }),
      ),
      h(
        'button',
        { class: 'btn-icon btn-icon-sm', 'aria-label': 'Aşağı taşı', disabled: i === n - 1, onclick: () => store.moveHabit(habit.id, 1).catch(showError) },
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
      h('span', { class: 'manage-meta' }, `${formatShort(habit.archivedAt)} tarihinde arşivlendi`),
    ),
    h(
      'div',
      { class: 'manage-actions' },
      h(
        'button',
        {
          class: 'btn-icon btn-icon-sm',
          'aria-label': 'Arşivden çıkar',
          onclick: async () => {
            try {
              await store.archiveHabit(habit.id, false);
              toast('Geri yüklendi');
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
          'aria-label': 'Kalıcı olarak sil',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Kalıcı olarak silinsin mi?',
              message: `“${habit.name}” ve tüm geçmişi silinecek. Bu işlem geri alınamaz.`,
              confirmLabel: 'Sil',
              danger: true,
            });
            if (ok) store.deleteHabit(habit.id).then(() => toast('Silindi'), showError);
          },
        },
        icon('trash', { size: 18 }),
      ),
    ),
  );
}
