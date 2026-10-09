/**
 * Evening review sheet: day score, mood, energy and two short prompts.
 */
import { h, autosize } from './dom.js';
import { openSheet, confirmDialog } from './sheet.js';
import { toast, showError } from './toast.js';
import { store } from '../core/store.js';
import { formatLong } from '../core/dates.js';

export const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
export const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'High', 'Full'];

/** Single-choice button row from 1..n. */
function scalePicker({ n, value, onChange, labels, name }) {
  const buttons = Array.from({ length: n }, (_, i) =>
    h(
      'button',
      {
        type: 'button',
        class: 'scale-btn num',
        'aria-pressed': String(value === i + 1),
        'aria-label': `${name}: ${i + 1}${labels ? ` (${labels[i]})` : ''}`,
        onclick: () => {
          const next = value === i + 1 ? null : i + 1; // tapping the same value again clears it
          value = next;
          buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(next === j + 1)));
          caption.textContent = next && labels ? labels[next - 1] : '';
          onChange(next);
        },
      },
      String(i + 1),
    ),
  );
  const caption = h('span', { class: 'scale-caption' }, value && labels ? labels[value - 1] : '');
  return h('div', { class: 'scale' }, h('div', { class: `scale-row scale-${n}` }, buttons), labels && caption);
}

export function openReviewForm(date) {
  const existing = store.day(date).review;
  const draft = {
    score: existing?.score ?? null,
    mood: existing?.mood ?? null,
    energy: existing?.energy ?? null,
    good: existing?.good ?? '',
    improve: existing?.improve ?? '',
  };

  return openSheet({
    title: 'Evening review',
    build: ({ close }) => {
      const textarea = (key, placeholder) => {
        const ta = h('textarea', {
          class: 'input',
          rows: 2,
          maxlength: 1000,
          placeholder,
          oninput: (e) => {
            draft[key] = e.target.value;
            autosize(e.target);
          },
        });
        ta.value = draft[key];
        requestAnimationFrame(() => autosize(ta));
        return ta;
      };

      async function save(e) {
        e.preventDefault();
        try {
          await store.updateDay(date, { review: draft });
          toast('Review saved');
          await close();
        } catch (err) {
          showError(err, 'Could not save.');
        }
      }

      async function remove() {
        if (!(await confirmDialog({ title: 'Delete this review?', confirmLabel: 'Delete', danger: true }))) return;
        try {
          await store.updateDay(date, { review: null });
          toast('Deleted');
          await close();
        } catch (err) {
          showError(err);
        }
      }

      return h(
        'form',
        { class: 'form', onsubmit: save, novalidate: true },
        h('p', { class: 'muted small' }, formatLong(date)),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'How would you rate today?'),
          scalePicker({ n: 10, value: draft.score, name: 'Day score', onChange: (v) => (draft.score = v) }),
        ),
        h(
          'div',
          { class: 'field-pair' },
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label' }, 'Mood'),
            scalePicker({ n: 5, value: draft.mood, labels: MOOD_LABELS, name: 'Mood', onChange: (v) => (draft.mood = v) }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label' }, 'Energy'),
            scalePicker({ n: 5, value: draft.energy, labels: ENERGY_LABELS, name: 'Energy', onChange: (v) => (draft.energy = v) }),
          ),
        ),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'What went well?'), textarea('good', 'One thing is enough.')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'What will you do better tomorrow?'), textarea('improve', 'Keep it small and concrete.')),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save'),
        existing && h('div', { class: 'form-danger' }, h('button', { type: 'button', class: 'btn btn-quiet text-danger', onclick: remove }, 'Delete review')),
      );
    },
  });
}
