/**
 * Odak ekranı: halka zamanlayıcı, mod seçimi, alışkanlığa bağlama, bugünkü oturumlar.
 * Saniyelik güncelleme yalnızca süre metnini ve halkayı değiştirir; sayfa yeniden çizilmez.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showError } from '../ui/toast.js';
import { segmented } from './settings.js';
import { store } from '../core/store.js';
import { todayKey } from '../core/dates.js';
import * as focus from '../features/focus.js';

const R = 120;
const CIRC = 2 * Math.PI * R;

function fmt(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clockTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function render({ onCleanup }) {
  const today = todayKey();
  let snap = focus.snapshot();

  const time = h('span', { class: 'focus-time num', role: 'timer', 'aria-live': 'off' }, fmt(snap.remainingMs));
  const sub = h('span', { class: 'focus-sub' });
  const arc = h('circle', { class: 'focus-arc', cx: 140, cy: 140, r: R, 'stroke-dasharray': CIRC.toFixed(1) });
  const ring = h(
    'svg',
    { class: 'focus-ring', viewBox: '0 0 280 280', 'aria-hidden': 'true' },
    h('circle', { class: 'focus-track', cx: 140, cy: 140, r: R }),
    arc,
  );

  const mainBtn = h('button', { class: 'focus-main', onclick: () => toggleMain() });
  const resetBtn = h('button', { class: 'btn-icon focus-side', 'aria-label': 'Sıfırla', onclick: () => focus.reset() }, icon('restore', { size: 20 }));
  const skipBtn = h('button', { class: 'btn-icon focus-side', 'aria-label': 'Sonrakine geç', onclick: () => focus.skip() }, icon('skip', { size: 20 }));
  const modeSeg = segmented(
    Object.entries(focus.MODES).map(([k, m]) => [k, m.label]),
    snap.mode,
    (v) => {
      if (snap.status === 'running' && v !== snap.mode) return; // çalışırken mod değişmez
      focus.setMode(v);
    },
  );
  modeSeg.classList.add('focus-modes');
  const dots = h('div', { class: 'cycle-dots', 'aria-hidden': 'true' });

  function toggleMain() {
    if (snap.status === 'running') focus.pause();
    else if (snap.status === 'paused') focus.resume();
    else focus.start();
  }

  function paint(s) {
    snap = s;
    time.textContent = fmt(s.remainingMs);
    arc.setAttribute('stroke-dashoffset', (CIRC * (1 - Math.min(1, Math.max(0, s.progress)))).toFixed(1));
    document.title = s.status === 'running' ? `${fmt(s.remainingMs)} · ${focus.MODES[s.mode].label}` : 'Disiplin';

    sub.textContent =
      s.status === 'running'
        ? `${clockTime(s.endAt)}’de biter`
        : s.status === 'paused'
          ? 'Duraklatıldı'
          : `${focus.durationMin(s.mode)} dakika`;

    mainBtn.replaceChildren(icon(s.status === 'running' ? 'pause' : 'play', { size: 28 }));
    mainBtn.setAttribute('aria-label', s.status === 'running' ? 'Duraklat' : s.status === 'paused' ? 'Devam et' : 'Başlat');
    resetBtn.disabled = s.status === 'idle';
    modeSeg.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.v === s.mode));
      b.disabled = s.status === 'running' && b.dataset.v !== s.mode;
    });
    wrap.dataset.mode = s.mode;
    wrap.dataset.status = s.status;

    const every = store.settings.longEvery;
    const filled = s.cycle % every || (s.mode === 'long' ? every : 0);
    dots.replaceChildren(...Array.from({ length: every }, (_, i) => h('i', { class: i < filled ? 'on' : '' })));
  }

  /* —— alışkanlığa bağla —— */
  const builds = store.habits().filter((x) => x.kind === 'build');
  const habitSelect = h(
    'select',
    {
      class: 'input focus-select',
      'aria-label': 'Bağlı alışkanlık',
      onchange: (e) => focus.setHabit(e.target.value),
    },
    h('option', { value: '' }, 'Alışkanlığa bağlama'),
    builds.map((x) => h('option', { value: x.id, selected: snap.habitId === x.id }, x.name)),
  );

  /* —— bugünkü oturumlar —— */
  const sessions = store.focusSessions(today).slice().reverse();
  const totalToday = store.focusMinutesOn(today);

  const wrap = h(
    'div',
    { class: 'page focus' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Odak'), h('h1', { class: 'display' }, 'Derin çalışma')),
    modeSeg,
    h('div', { class: 'focus-dial' }, ring, h('div', { class: 'focus-readout' }, time, sub)),
    dots,
    h('div', { class: 'focus-controls' }, resetBtn, mainBtn, skipBtn),
    builds.length > 0 &&
      h(
        'label',
        { class: 'field focus-link' },
        h('span', { class: 'field-label' }, 'Bu oturum ne için?'),
        habitSelect,
        store.settings.focusAutoCheck && h('span', { class: 'field-hint' }, 'Odak bitince seçili alışkanlık bugün için işaretlenir.'),
      ),
    h(
      'section',
      { class: 'section' },
      h(
        'div',
        { class: 'section-head' },
        h('h2', { class: 'section-title' }, 'Bugün'),
        h('span', { class: 'section-meta num' }, `${totalToday} dk`),
      ),
      sessions.length
        ? h(
            'ul',
            { class: 'session-list' },
            sessions.map((f) =>
              h(
                'li',
                { class: 'session' },
                h('span', { class: 'session-time num' }, `${clockTime(f.start)}–${clockTime(f.end)}`),
                h('span', { class: 'session-name' }, f.habitId ? (store.habit(f.habitId)?.name ?? 'Silinmiş alışkanlık') : 'Serbest odak'),
                h('span', { class: 'session-min num' }, `${f.minutes} dk`),
                h(
                  'button',
                  { class: 'btn-icon btn-icon-sm', 'aria-label': 'Oturumu sil', onclick: () => store.deleteFocusSession(f.id).catch(showError) },
                  icon('close', { size: 16 }),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, 'Henüz oturum yok. Telefonu ters çevir, bir işe odaklan.'),
    ),
  );

  paint(snap);
  const unsubscribe = focus.subscribe(paint);
  onCleanup(() => {
    unsubscribe();
    document.title = 'Disiplin';
  });
  return wrap;
}
