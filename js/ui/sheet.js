/**
 * Bottom sheet and confirm dialog.
 *
 * Each sheet pushes a history entry so the phone's back button/gesture closes it.
 * Sheets are kept on a stack; closing a nested confirm dialog closes only that dialog.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('sheet');
const stack = []; // { id, finish }
let seq = 0;

window.addEventListener('popstate', (e) => {
  const cur = e.state?.sheet ?? null;
  // Close every sheet above the one that matches the current history entry.
  while (stack.length && stack[stack.length - 1].id !== cur) {
    stack[stack.length - 1].finish();
  }
});

/**
 * @param {{title?:string, build:(api)=>Node|void, onClose?:()=>void, className?:string}} opts
 * @returns {{close:()=>Promise<void>, body:HTMLElement}}
 */
export function openSheet({ title, build, onClose, className = '' }) {
  const root = document.getElementById('sheet-root');
  const id = `sheet-${++seq}`;
  let closed = false;
  let resolveClosed;
  const closedPromise = new Promise((r) => (resolveClosed = r));

  const body = h('div', { class: 'sheet-body' });
  const panel = h(
    'div',
    { class: `sheet ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h(
      'header',
      { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title ?? ''),
      h('button', { class: 'btn-icon', 'aria-label': 'Close', onclick: () => close() }, icon('close')),
    ),
    body,
  );
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onclick: () => close() }), panel);

  const onKey = (e) => {
    if (e.key === 'Escape' && stack[stack.length - 1]?.id === id) close();
  };

  function finish() {
    if (closed) return;
    closed = true;
    const i = stack.findIndex((s) => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 280);
    if (!stack.length) document.body.classList.remove('no-scroll');
    log.debug('closed', { id, title });
    try {
      onClose?.();
    } catch (e) {
      log.error('onClose error', e);
    }
    resolveClosed();
  }

  /** Closes the sheet and rewinds its history entry. Returns a Promise resolved once closed. */
  function close() {
    if (!closed) {
      if (history.state?.sheet === id) history.back(); // popstate → finish()
      else finish();
    }
    return closedPromise;
  }

  const api = { close, body, panel };
  try {
    const content = build(api);
    if (content) body.append(content);
  } catch (e) {
    log.error('Could not build sheet content', e);
    body.append(h('p', { class: 'muted' }, 'This content could not be loaded.'));
  }

  root.append(wrap);
  document.body.classList.add('no-scroll');
  stack.push({ id, finish });
  history.pushState({ ...(history.state ?? {}), sheet: id }, '');
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  setTimeout(() => panel.querySelector('[autofocus]')?.focus(), 320);
  log.debug('opened', { id, title });
  return api;
}

/** Yes/no confirmation. Resolves to true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet({
      title,
      className: 'sheet-compact',
      onClose: () => resolve(answer),
      build: ({ close }) =>
        h(
          'div',
          { class: 'confirm' },
          message && h('p', { class: 'confirm-msg' }, message),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn btn-ghost', onclick: () => close() }, cancelLabel),
            h(
              'button',
              {
                class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
                onclick: () => {
                  answer = true;
                  close();
                },
              },
              confirmLabel,
            ),
          ),
        ),
    });
  });
}
