/**
 * Short notifications. At most 3 are shown at once.
 */
import { h } from './dom.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('toast');
const MAX = 3;

export function toast(message, { type = 'info', duration = 2800, action } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) {
    log.warn('toast-root missing', { message });
    return () => {};
  }
  let timer;
  let gone = false;

  const el = h(
    'div',
    { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-msg' }, message),
    action &&
      h(
        'button',
        {
          class: 'toast-action',
          onclick: () => {
            dismiss();
            try {
              action.fn();
            } catch (e) {
              log.error('Toast action failed', e);
            }
          },
        },
        action.label,
      ),
  );

  function dismiss() {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }

  while (root.children.length >= MAX) root.firstElementChild.remove();
  root.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  timer = setTimeout(dismiss, action ? Math.max(duration, 5000) : duration);
  return dismiss;
}

/** Shows a readable message for the error type; unexpected errors are logged. */
export function showError(e, fallback = 'Something went wrong.') {
  if (e?.name === 'ValidationError') {
    toast(e.message, { type: 'warn' });
    return;
  }
  log.error(fallback, e);
  toast(fallback, { type: 'error' });
}
