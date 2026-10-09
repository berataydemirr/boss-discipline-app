/**
 * Focus screen: ring timer, mode picker, habit link, today's sessions.
 * The per-second update only touches the time text and the ring; the page is not re-rendered.
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
  const resetBtn = h('button', { class: 'btn-icon focus-side', 'aria-label': 'Reset', onclick: () => focus.reset() }, icon('restore', { size: 20 }));
  const skipBtn = h('button', { class: 'btn-icon focus-side', 'aria-label': 'Skip to next', onclick: () => focus.skip() }, icon('skip', { size: 20 }));
  const modeSeg = segmented(
    Object.entries(focus.MODES).map(([k, m]) => [k, m.label]),
    snap.mode,
    (v) => {
      if (snap.status === 'running' && v !== snap.mode) return; // the mode is locked while running
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
    document.title = s.status === 'running' ? `${fmt(s.remainingMs)} · ${focus.MODES[s.mode].label}` : 'BOSS';

    sub.textContent = s.status === 'running' ? `Ends at ${clockTime(s.endAt)}` : s.status === 'paused' ? 'Paused' : `${focus.durationMin(s.mode)} minutes`;

    mainBtn.replaceChildren(icon(s.status === 'running' ? 'pause' : 'play', { size: 28 }));
    mainBtn.setAttribute('aria-label', s.status === 'running' ? 'Pause' : s.status === 'paused' ? 'Resume' : 'Start');
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

  /* —— link to a habit —— */
  const builds = store.habits().filter((x) => x.kind === 'build');
  const habitSelect = h(
    'select',
    {
      class: 'input focus-select',
      'aria-label': 'Linked habit',
      onchange: (e) => focus.setHabit(e.target.value),
    },
    h('option', { value: '' }, 'Not linked to a habit'),
    builds.map((x) => h('option', { value: x.id, selected: snap.habitId === x.id }, x.name)),
  );

  /* —— today's sessions —— */
  const sessions = store.focusSessions(today).slice().reverse();
  const totalToday = store.focusMinutesOn(today);

  const wrap = h(
    'div',
    { class: 'page focus' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Focus'), h('h1', { class: 'display' }, 'Deep work')),
    modeSeg,
    h('div', { class: 'focus-dial' }, ring, h('div', { class: 'focus-readout' }, time, sub)),
    dots,
    h('div', { class: 'focus-controls' }, resetBtn, mainBtn, skipBtn),
    builds.length > 0 &&
      h(
        'label',
        { class: 'field focus-link' },
        h('span', { class: 'field-label' }, 'What is this session for?'),
        habitSelect,
        store.settings.focusAutoCheck && h('span', { class: 'field-hint' }, 'When the session ends, the selected habit is checked off for today.'),
      ),
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Today'), h('span', { class: 'section-meta num' }, `${totalToday} min`)),
      sessions.length
        ? h(
            'ul',
            { class: 'session-list' },
            sessions.map((f) =>
              h(
                'li',
                { class: 'session' },
                h('span', { class: 'session-time num' }, `${clockTime(f.start)}–${clockTime(f.end)}`),
                h('span', { class: 'session-name' }, f.habitId ? (store.habit(f.habitId)?.name ?? 'Deleted habit') : 'Free focus'),
                h('span', { class: 'session-min num' }, `${f.minutes} min`),
                h(
                  'button',
                  { class: 'btn-icon btn-icon-sm', 'aria-label': 'Delete session', onclick: () => store.deleteFocusSession(f.id).catch(showError) },
                  icon('close', { size: 16 }),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small' }, 'No sessions yet. Put your phone face down and focus on one thing.'),
    ),
  );

  paint(snap);
  const unsubscribe = focus.subscribe(paint);
  onCleanup(() => {
    unsubscribe();
    document.title = 'BOSS';
  });
  return wrap;
}
