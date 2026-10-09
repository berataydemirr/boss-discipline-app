/**
 * Minimal hash router: #/today, #/today/2026-10-08, #/settings ...
 *
 * Each view module exports `render(ctx)` and returns an HTMLElement.
 * ctx.onCleanup(fn): called before the view re-renders or is left (timers, pending saves).
 */
import { createLogger } from './logger.js';
import { h } from '../ui/dom.js';

const log = createLogger('router');

export function parseHash(hash) {
  const clean = (hash || '').replace(/^#\/?/, '');
  const [name = '', ...params] = clean.split('/').filter(Boolean);
  return { name: decodeURIComponent(name), params: params.map(decodeURIComponent) };
}

export function navigate(path) {
  const target = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (location.hash === target) return;
  location.hash = target;
}

function errorPanel(e, view) {
  return h(
    'div',
    { class: 'error-panel' },
    h('p', { class: 'eyebrow' }, 'Error'),
    h('h1', { class: 'display-sm' }, 'This page could not be opened.'),
    h('p', { class: 'muted' }, `Something went wrong while rendering “${view}”. Details are in Settings › Logs.`),
    h('pre', { class: 'error-pre' }, String(e?.stack || e)),
    h('button', { class: 'btn btn-ghost', onclick: () => navigate('today') }, 'Back to today'),
  );
}

export function createRouter({ views, defaultView, container, onChange }) {
  let cleanups = [];
  let lastHash = null;

  function runCleanups() {
    const list = cleanups;
    cleanups = [];
    list.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        log.error('Cleanup error', e);
      }
    });
  }

  function render(reason) {
    let { name, params } = parseHash(location.hash);
    if (!views[name]) {
      if (name) log.warn('Unknown route, falling back to default', { name });
      name = defaultView;
      params = [];
      history.replaceState(history.state, '', `#/${defaultView}`);
    }
    const routeChanged = lastHash !== location.hash;
    lastHash = location.hash;

    // Remember the focused field so it can be restored after a re-render.
    const active = document.activeElement;
    const focusKey = container.contains(active) ? active?.dataset?.fk : null;
    const sel = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

    runCleanups();
    const end = log.time(`render ${name}`);
    let el;
    try {
      el = views[name].render({ params, onCleanup: (fn) => cleanups.push(fn) });
    } catch (e) {
      log.error(`Failed to render "${name}"`, e);
      el = errorPanel(e, name);
    }
    if (routeChanged) el.classList.add('enter');
    container.replaceChildren(el);

    if (routeChanged) {
      window.scrollTo(0, 0);
    } else if (focusKey) {
      const again = container.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
      if (again) {
        again.focus({ preventScroll: true });
        if (sel) {
          try {
            again.setSelectionRange(sel[0], sel[1]);
          } catch {
            /* some input types do not support selection */
          }
        }
      }
    }
    onChange?.(name, params);
    end({ reason, params });
  }

  window.addEventListener('hashchange', () => render('hash'));

  return {
    start: () => render('start'),
    refresh: () => render('data'),
    current: () => parseHash(location.hash),
  };
}
