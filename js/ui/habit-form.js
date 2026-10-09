/**
 * Alışkanlık ekleme / düzenleme paneli.
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
  { label: 'Her gün', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Hafta içi', days: [0, 1, 2, 3, 4] },
  { label: 'Hafta sonu', days: [5, 6] },
];

export function scheduleLabel(days) {
  const key = [...days].sort((a, b) => a - b).join(',');
  const preset = PRESETS.find((p) => p.days.join(',') === key);
  if (preset) return preset.label;
  return days.map((d) => WEEKDAYS_SHORT[d]).join(' · ');
}

/** Boşta kalan ilk rengi önerir; hepsi kullanıldıysa döngüye girer. */
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
  log.debug('form açıldı', { isEdit, draft });

  return openSheet({
    title: isEdit ? 'Alışkanlığı düzenle' : 'Yeni alışkanlık',
    build: ({ close }) => {
      let saving = false;

      /* —— ad —— */
      const nameInput = h('input', {
        class: 'input',
        type: 'text',
        maxlength: 60,
        placeholder: 'Örn. 20 sayfa kitap',
        autocomplete: 'off',
        enterkeyhint: 'done',
        autofocus: !isEdit,
        value: draft.name,
        oninput: (e) => (draft.name = e.target.value),
      });

      /* —— günler —— */
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

      /* —— renk —— */
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

      /* —— tür: kazanılacak / bırakılacak —— */
      // Geçmişi olan alışkanlığın türü değişemez (store da reddeder); o durumda seçici gösterilmez.
      const canChangeKind = !isEdit || store.datesFor(existing.id).size === 0;
      const daysField = h('div', { class: 'field' });
      const kindButtons = [
        ['build', 'Kazanılacak'],
        ['quit', 'Bırakılacak'],
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
            ? 'Her gün kendiliğinden temiz sayılır; yalnızca kaydığın günleri işaretlersin.'
            : 'Planladığın günlerde yaptıkça işaretlersin.';
        nameInput.placeholder = draft.kind === 'quit' ? 'Örn. Gece 12’den sonra telefon' : 'Örn. 20 sayfa kitap';
      }

      /* —— hatırlatma (v3) —— */
      const reminderInput = h('input', {
        class: 'input input-time',
        type: 'time',
        value: draft.reminder ?? '',
        'aria-label': 'Hatırlatma saati',
        onchange: (e) => (draft.reminder = e.target.value || null),
      });
      const reminderField = h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Hatırlatma'),
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
            'Kapat',
          ),
        ),
        h(
          'span',
          { class: 'field-hint' },
          store.settings.remindersEnabled
            ? 'O gün henüz yapılmadıysa bu saatte hatırlatılır.'
            : 'Hatırlatma için Ayarlar › Hatırlatıcılar açık olmalı.',
        ),
      );

      /* —— başlangıç —— */
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
            toast('Kaydedildi');
          } else {
            await store.addHabit(draft);
            toast(`“${draft.name.trim()}” eklendi`);
          }
          await close();
        } catch (err) {
          showError(err, 'Alışkanlık kaydedilemedi.');
        } finally {
          saving = false;
        }
      }

      async function remove() {
        const ok = await confirmDialog({
          title: 'Kalıcı olarak silinsin mi?',
          message: `“${existing.name}” ve tüm geçmişi silinecek. Geçmişi korumak istiyorsan arşivle.`,
          confirmLabel: 'Sil',
          danger: true,
        });
        if (!ok) return;
        try {
          await store.deleteHabit(existing.id);
          toast('Silindi');
          await close();
        } catch (err) {
          showError(err, 'Silinemedi.');
        }
      }

      async function archive() {
        try {
          await store.archiveHabit(existing.id, true);
          toast('Arşivlendi', {
            action: { label: 'Geri al', fn: () => store.archiveHabit(existing.id, false).catch(showError) },
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
          h('div', { class: 'field' }, h('div', { class: 'segmented', role: 'group', 'aria-label': 'Tür' }, kindButtons), kindHint),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ad'), nameInput),
        (daysField.append(
          h('span', { class: 'field-label' }, 'Günler'),
          h('div', { class: 'day-pills' }, dayButtons),
          h('div', { class: 'chip-row' }, presetButtons),
        ),
        daysField),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Renk'), h('div', { class: 'swatches' }, swatches)),
        reminderField,
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Başlangıç'),
          startInput,
          h('span', { class: 'field-hint' }, 'Geçmiş günleri de işaretleyebilmek için daha erken bir tarih seçebilirsin.'),
        ),
        h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isEdit ? 'Kaydet' : 'Ekle'),
        isEdit &&
          h(
            'div',
            { class: 'form-danger' },
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: archive }, icon('archive', { size: 18 }), 'Arşivle'),
            h('button', { type: 'button', class: 'btn btn-quiet text-danger', onclick: remove }, icon('trash', { size: 18 }), 'Sil'),
          ),
      );
    },
  });
}
