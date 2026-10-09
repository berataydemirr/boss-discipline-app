/**
 * Basit hash yönlendirici: #/today, #/today/2026-10-08, #/settings ...
 *
 * Her view modülü `render(ctx)` dışa aktarır ve bir HTMLElement döner.
 * ctx.onCleanup(fn): view yeniden çizilmeden/ayrılmadan önce çağrılacak temizlik (zamanlayıcı, kayıt vb.).
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
    h('p', { class: 'eyebrow' }, 'Hata'),
    h('h1', { class: 'display-sm' }, 'Bu sayfa açılamadı.'),
    h('p', { class: 'muted' }, `“${view}” çizilirken bir sorun oluştu. Ayrıntılar Ayarlar › Kayıtlar bölümünde.`),
    h('pre', { class: 'error-pre' }, String(e?.stack || e)),
    h('button', { class: 'btn btn-ghost', onclick: () => navigate('today') }, 'Bugüne dön'),
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
        log.error('Temizlik hatası', e);
      }
    });
  }

  function render(reason) {
    let { name, params } = parseHash(location.hash);
    if (!views[name]) {
      if (name) log.warn('Bilinmeyen rota, varsayılana dönülüyor', { name });
      name = defaultView;
      params = [];
      history.replaceState(history.state, '', `#/${defaultView}`);
    }
    const routeChanged = lastHash !== location.hash;
    lastHash = location.hash;

    // Yeniden çizimde odaklı alanı geri getirebilmek için kaydet.
    const active = document.activeElement;
    const focusKey = container.contains(active) ? active?.dataset?.fk : null;
    const sel = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

    runCleanups();
    const end = log.time(`render ${name}`);
    let el;
    try {
      el = views[name].render({ params, onCleanup: (fn) => cleanups.push(fn) });
    } catch (e) {
      log.error(`"${name}" çizilemedi`, e);
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
            /* bazı input türleri desteklemez */
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
