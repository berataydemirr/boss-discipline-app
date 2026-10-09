/**
 * Akşam değerlendirmesi paneli: gün puanı, ruh hali, enerji, iki kısa soru.
 */
import { h, autosize } from './dom.js';
import { openSheet, confirmDialog } from './sheet.js';
import { toast, showError } from './toast.js';
import { store } from '../core/store.js';
import { formatLong } from '../core/dates.js';

export const MOOD_LABELS = ['Çok kötü', 'Kötü', 'Orta', 'İyi', 'Çok iyi'];
export const ENERGY_LABELS = ['Bitkin', 'Düşük', 'Orta', 'Yüksek', 'Dolu'];

/** 1..n arası tek seçimli düğme dizisi. */
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
          const next = value === i + 1 ? null : i + 1; // aynı değere tekrar dokunmak seçimi kaldırır
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
    title: 'Akşam değerlendirmesi',
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
          toast('Değerlendirme kaydedildi');
          await close();
        } catch (err) {
          showError(err, 'Kaydedilemedi.');
        }
      }

      async function remove() {
        if (!(await confirmDialog({ title: 'Değerlendirme silinsin mi?', confirmLabel: 'Sil', danger: true }))) return;
        try {
          await store.updateDay(date, { review: null });
          toast('Silindi');
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
          h('span', { class: 'field-label' }, 'Bugüne kaç verirsin?'),
          scalePicker({ n: 10, value: draft.score, name: 'Gün puanı', onChange: (v) => (draft.score = v) }),
        ),
        h(
          'div',
          { class: 'field-pair' },
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label' }, 'Ruh hali'),
            scalePicker({ n: 5, value: draft.mood, labels: MOOD_LABELS, name: 'Ruh hali', onChange: (v) => (draft.mood = v) }),
          ),
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'field-label' }, 'Enerji'),
            scalePicker({ n: 5, value: draft.energy, labels: ENERGY_LABELS, name: 'Enerji', onChange: (v) => (draft.energy = v) }),
          ),
        ),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Neyi iyi yaptım?'), textarea('good', 'Bir şey yeter.')),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Yarın neyi daha iyi yapacağım?'), textarea('improve', 'Somut ve küçük olsun.')),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Kaydet'),
        existing && h('div', { class: 'form-danger' }, h('button', { type: 'button', class: 'btn btn-quiet text-danger', onclick: remove }, 'Değerlendirmeyi sil')),
      );
    },
  });
}
