/**
 * Add / edit habit sheet.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet, confirmDialog } from './sheet.js';
import { toast, showError } from './toast.js';
import { store } from '../core/store.js';
import { HABIT_COLORS } from '../core/validate.js';
import { todayKey, WEEKDAYS_SHORT, WEEKDAYS } from '../core/dates.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('habit-form');

const PRESETS = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekdays', days: [0, 1, 2, 3, 4] },
  { label: 'Weekends', days: [5, 6] },
];

export function scheduleLabel(days) {
  const key = [...days].sort((a, b) => a - b).join(',');
  const preset = PRESETS.find((p) => p.days.join(',') === key);
  if (preset) return preset.label;
  return days.map((d) => WEEKDAYS_SHORT[d]).join(' · ');
}

/** Suggests the first unused color; cycles once all are taken. */
function suggestColor() {
  const used = new Set(store.habits().map((h) => h.color));
  return (HABIT_COLORS.find((c) => !used.has(c.id)) ?? HABIT_COLORS[store.habits().length % HABIT_COLORS.length]).id;
}

export function openHabitForm(existing = null, defaults = {}) {
  const isEdit = !!existing;
  const draft = {
    name: existing?.name ?? defaults.name ?? '',
    kind: existing?.kind ?? defaults.kind ?? 'build',
    color: existing?.color ?? defaults.color ?? suggestColor(),
    days: [...(existing?.days ?? defaults.days ?? [0, 1, 2, 3, 4, 5, 6])],
    createdAt: existing?.createdAt ?? todayKey(),
    reminder: existing?.reminder ?? null,
  };
  log.debug('form opened', { isEdit, draft });

  return openSheet({
    title: isEdit ? 'Edit habit' : 'New habit',
    build: ({ close }) => {
      let saving = false;

      /* —— name —— */
      const nameInput = h('input', {
        class: 'input',
        type: 'text',
        maxlength: 60,
        placeholder: 'e.g. Read 20 pages',
        autocomplete: 'off',
        enterkeyhint: 'done',
        autofocus: !isEdit,
        value: draft.name,
        oninput: (e) => (draft.name = e.target.value),
      });

      /* —— days —— */
      const dayButtons = WEEKDAYS_SHORT.map((label, d) =>
        h(
          'button',
          {
            type: 'button',
            class: 'day-pill',
            'aria-pressed': String(draft.days.includes(d)),
            'aria-label': WEEKDAYS[d],
            onclick: () => {
              draft.days = draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d];
              syncDays();
            },
          },
          label.slice(0, 2),
        ),
      );
      const presetButtons = PRESETS.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip chip-sm',
            onclick: () => {
              draft.days = [...p.days];
              syncDays();
            },
          },
          p.label,
        ),
      );
      function syncDays() {
        dayButtons.forEach((b, d) => b.setAttribute('aria-pressed', String(draft.days.includes(d))));
        const key = [...draft.days].sort((a, b) => a - b).join(',');
        presetButtons.forEach((b, i) => b.classList.toggle('is-active', PRESETS[i].days.join(',') === key));
      }

      /* —— color —— */
      const swatches = HABIT_COLORS.map((c) =>
        h('button', {
          type: 'button',
          class: 'swatch',
          style: { '--c': c.hex },
          'aria-label': c.name,
          'aria-pressed': String(draft.color === c.id),
          onclick: () => {
            draft.color = c.id;
            swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(HABIT_COLORS[i].id === c.id)));
          },
        }),
      );

      /* —— type: build / quit —— */
      // A habit with history cannot change type (the store rejects it too), so the picker is hidden then.
      const canChangeKind = !isEdit || store.datesFor(existing.id).size === 0;
      const daysField = h('div', { class: 'field' });
      const kindButtons = [
        ['build', 'Build'],
        ['quit', 'Quit'],
      ].map(([v, label]) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(draft.kind === v),
            onclick: () => {
              draft.kind = v;
              kindButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(['build', 'quit'][i] === v)));
              syncKind();
            },
          },
          label,
        ),
      );
      const kindHint = h('span', { class: 'field-hint' });
      function syncKind() {
        daysField.hidden = draft.kind === 'quit';
        reminderField.hidden = draft.kind === 'quit';
        kindHint.textContent =
          draft.kind === 'quit'
            ? 'Every day counts as clean by default; you only log the days you slip.'
            : 'Check it off on the days you planned it.';
        nameInput.placeholder = draft.kind === 'quit' ? 'e.g. Phone after midnight' : 'e.g. Read 20 pages';
      }

      /* —— reminder —— */
      const reminderInput = h('input', {
        class: 'input input-time',
        type: 'time',
        value: draft.reminder ?? '',
        'aria-label': 'Reminder time',
        onchange: (e) => (draft.reminder = e.target.value || null),
      });
      const reminderField = h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Reminder'),
        h(
          'div',
          { class: 'inline-row' },
          reminderInput,
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-quiet btn-sm',
              onclick: () => {
                reminderInput.value = '';
                draft.reminder = null;
              },
            },
            'Clear',
          ),
        ),
        h(
          'span',
          { class: 'field-hint' },
          store.settings.remindersEnabled
            ? 'You’ll be reminded at this time if it isn’t done yet that day.'
            : 'Turn on Settings › Reminders to get reminded.',
        ),
      );

      /* —— start date —— */
      const startInput = h('input', {
        class: 'input',
        type: 'date',
        max: todayKey(),
        value: draft.createdAt,
        onchange: (e) => (draft.createdAt = e.target.value),
      });

      async function submit(e) {
        e.preventDefault();
        if (saving) return;
        saving = true;
        try {
          if (isEdit) {
            await store.updateHabit(existing.id, draft);
            toast('Saved');
          } else {
            await store.addHabit(draft);
            toast(`“${draft.name.trim()}” added`);
          }
          await close();
        } catch (err) {
          showError(err, 'Could not save the habit.');
        } finally {
          saving = false;
        }
      }

      async function remove() {
        const ok = await confirmDialog({
          title: 'Delete permanently?',
          message: `“${existing.name}” and its entire history will be deleted. Archive it instead to keep the history.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await store.deleteHabit(existing.id);
          toast('Deleted');
          await close();
        } catch (err) {
          showError(err, 'Could not delete.');
        }
      }

      async function archive() {
        try {
          await store.archiveHabit(existing.id, true);
          toast('Archived', {
            action: { label: 'Undo', fn: () => store.archiveHabit(existing.id, false).catch(showError) },
          });
          await close();
        } catch (err) {
          showError(err);
        }
      }

      syncDays();
      syncKind();

      return h(
        'form',
        { class: 'form', onsubmit: submit, novalidate: true },
        canChangeKind &&
          h('div', { class: 'field' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Type' }, kindButtons), kindHint),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), nameInput),
        (daysField.append(
          h('span', { class: 'field-label' }, 'Days'),
          h('div', { class: 'day-pills' }, dayButtons),
          h('div', { class: 'chip-row' }, presetButtons),
        ),
        daysField),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Color'), h('div', { class: 'swatches' }, swatches)),
        reminderField,
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Start date'),
          startInput,
          h('span', { class: 'field-hint' }, 'Pick an earlier date to be able to check off past days too.'),
        ),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isEdit ? 'Save' : 'Add'),
        isEdit &&
          h(
            'div',
            { class: 'form-danger' },
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: archive }, icon('archive', { size: 18 }), 'Archive'),
            h('button', { type: 'button', class: 'btn btn-quiet text-danger', onclick: remove }, icon('trash', { size: 18 }), 'Delete'),
          ),
      );
    },
  });
}
