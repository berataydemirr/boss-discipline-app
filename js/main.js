/**
 * Uygulama girişi: global hata yakalama → veri → tema → yönlendirici → service worker.
 *
 * Konsoldan hata ayıklama:
 *   disiplin.store.debugSnapshot()   — bellekteki durum
 *   disiplin.logs()                  — son kayıtlar
 *   disiplin.setDebug(true)          — ayrıntılı kayıt
 */
import { createLogger, getLogs, setDebug, formatLogs, flush } from './core/logger.js';
import { store } from './core/store.js';
import { createRouter, navigate } from './core/router.js';
import { registerServiceWorker } from './core/sw-register.js';
import { applyTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';
import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';
import * as today from './views/today.js';
import * as journal from './views/journal.js';
import * as habits from './views/habits.js';
import * as settings from './views/settings.js';
import * as stats from './views/stats.js';
import * as plan from './views/plan.js';
import * as focusView from './views/focus.js';
import { initFocus } from './features/focus.js';
import { startReminders, registerPeriodicSync, permission } from './features/reminders.js';

const log = createLogger('app');

const VIEWS = { today, journal, habits, settings, stats, plan, focus: focusView };

/** Alt menü. `match`: hangi rotalarda bu sekme etkin görünür. */
const TABS = [
  { route: 'today', label: 'Bugün', icon: 'today', match: ['today', 'habits', 'settings'] },
  { route: 'plan', label: 'Plan', icon: 'target', match: ['plan'] },
  { route: 'focus', label: 'Odak', icon: 'timer', match: ['focus'] },
  { route: 'stats', label: 'Analiz', icon: 'chart', match: ['stats'] },
  { route: 'journal', label: 'Günlük', icon: 'journal', match: ['journal'] },
];

/* ───────────────────────── global hata yakalama ───────────────────────── */

let lastErrorToast = 0;

function reportError(kind, error, extra) {
  if (error?.name === 'ValidationError') {
    toast(error.message, { type: 'warn' });
    return;
  }
  log.error(kind, { error, ...extra });
  const now = Date.now();
  if (now - lastErrorToast > 3000) {
    lastErrorToast = now;
    toast('Beklenmeyen bir hata oluştu.', { type: 'error', action: { label: 'Ayrıntı', fn: () => navigate('settings/logs') } });
  }
}

window.addEventListener('error', (e) => {
  // Kaynak yükleme hataları (ör. font) ErrorEvent değildir; yalnızca uyarı olarak kaydet.
  if (!(e instanceof ErrorEvent)) {
    log.warn('Kaynak yüklenemedi', { src: e.target?.src || e.target?.href });
    return;
  }
  reportError('Yakalanmamış hata', e.error ?? e.message, { src: e.filename, line: e.lineno, col: e.colno });
}, true);

window.addEventListener('unhandledrejection', (e) => {
  reportError('Yakalanmamış Promise reddi', e.reason);
});

/* ───────────────────────── kabuk ───────────────────────── */

function renderTabbar(nav) {
  nav.replaceChildren(
    ...TABS.map((t) =>
      h('a', { class: 'tab', href: `#/${t.route}`, dataset: { route: t.route } }, icon(t.icon, { size: 22 }), h('span', { class: 'tab-label' }, t.label)),
    ),
  );
}

function markActiveTab(nav, route) {
  nav.querySelectorAll('.tab').forEach((a) => {
    const tab = TABS.find((t) => t.route === a.dataset.route);
    const on = tab.match.includes(route);
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function fatal(error) {
  log.error('Başlatma başarısız', error);
  flush();
  const view = document.getElementById('view');
  view.replaceChildren(
    h(
      'div',
      { class: 'error-panel' },
      h('p', { class: 'eyebrow' }, 'Başlatılamadı'),
      h('h1', { class: 'display-sm' }, 'Uygulama açılamadı.'),
      h('p', { class: 'muted' }, 'Sayfayı yenilemeyi dene. Sorun sürerse aşağıdaki kayıtları kopyalayıp incele.'),
      h('pre', { class: 'error-pre' }, String(error?.stack || error)),
      h('pre', { class: 'error-pre' }, formatLogs(getLogs().slice(-30))),
      h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Yenile'),
    ),
  );
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function boot() {
  const end = log.time('boot');
  log.info('Başlatılıyor', {
    version: self.DISIPLIN_VERSION,
    standalone: isStandalone(),
    ua: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}`,
  });

  try {
    await store.init();
  } catch (e) {
    fatal(e);
    return;
  }

  applyTheme(store.settings.theme, store.settings.accent);
  if (!store.isPersistent) {
    toast('Depolama kullanılamıyor: veriler bu oturumla sınırlı.', { type: 'warn', duration: 6000 });
  }

  const nav = document.getElementById('tabbar');
  renderTabbar(nav);

  const router = createRouter({
    views: VIEWS,
    defaultView: 'today',
    container: document.getElementById('view'),
    onChange: (route) => markActiveTab(nav, route),
  });

  // Veri değişince ekranı bir sonraki karede tek seferde yenile.
  let pending = false;
  store.subscribe((evt) => {
    if (evt.type === 'db-closed') {
      toast('Uygulama başka bir sekmede güncellendi.', { type: 'warn', action: { label: 'Yenile', fn: () => location.reload() } });
      return;
    }
    if (evt.type === 'settings' && evt.key === 'remindersEnabled') startReminders();
    if (evt.silent || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      router.refresh();
    });
  });

  // Gece yarısı geçtiyse uygulamaya dönüldüğünde "bugün" güncellensin.
  let lastDay = new Date().toDateString();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = new Date().toDateString();
    if (now !== lastDay) {
      log.info('Gün değişti, yenileniyor');
      lastDay = now;
      router.refresh();
    }
  });

  router.start();
  registerServiceWorker();
  initFocus();
  startReminders();
  if (store.settings.remindersEnabled && permission() === 'granted') registerPeriodicSync();

  window.disiplin = { store, logs: getLogs, setDebug, version: self.DISIPLIN_VERSION, navigate };
  end();
}

boot();
