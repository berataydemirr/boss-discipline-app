/**
 * Kısa bildirimler. Aynı anda en fazla 3 tane gösterilir.
 */
import { h } from './dom.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('toast');
const MAX = 3;

export function toast(message, { type = 'info', duration = 2800, action } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) {
    log.warn('toast-root yok', { message });
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
              log.error('Toast eylemi başarısız', e);
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

/** Hatanın türüne göre anlaşılır mesaj gösterir; beklenmeyen hatalar loglanır. */
export function showError(e, fallback = 'Bir şeyler ters gitti.') {
  if (e?.name === 'ValidationError') {
    toast(e.message, { type: 'warn' });
    return;
  }
  log.error(fallback, e);
  toast(fallback, { type: 'error' });
}
