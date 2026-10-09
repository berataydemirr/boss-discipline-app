/**
 * App entry: global error handling → data → theme → router → service worker.
 *
 * Debugging from the console:
 *   boss.store.debugSnapshot()   — in-memory state
 *   boss.logs()                  — recent log entries
 *   boss.setDebug(true)          — verbose logging
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

/** Bottom navigation. `match`: routes on which the tab shows as active. */
const TABS = [
  { route: 'today', label: 'Today', icon: 'today', match: ['today', 'habits', 'settings'] },
  { route: 'plan', label: 'Plan', icon: 'target', match: ['plan'] },
  { route: 'focus', label: 'Focus', icon: 'timer', match: ['focus'] },
  { route: 'stats', label: 'Stats', icon: 'chart', match: ['stats'] },
  { route: 'journal', label: 'Journal', icon: 'journal', match: ['journal'] },
];

/* ───────────────────────── global error handling ───────────────────────── */

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
    toast('Something unexpected went wrong.', { type: 'error', action: { label: 'Details', fn: () => navigate('settings/logs') } });
  }
}

window.addEventListener(
  'error',
  (e) => {
    // Resource load failures (e.g. fonts) are not ErrorEvents; only log them as warnings.
    if (!(e instanceof ErrorEvent)) {
      log.warn('Resource failed to load', { src: e.target?.src || e.target?.href });
      return;
    }
    reportError('Uncaught error', e.error ?? e.message, { src: e.filename, line: e.lineno, col: e.colno });
  },
  true,
);

window.addEventListener('unhandledrejection', (e) => {
  reportError('Unhandled promise rejection', e.reason);
});

/* ───────────────────────── shell ───────────────────────── */

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
  log.error('Startup failed', error);
  flush();
  const view = document.getElementById('view');
  view.replaceChildren(
    h(
      'div',
      { class: 'error-panel' },
      h('p', { class: 'eyebrow' }, 'Startup failed'),
      h('h1', { class: 'display-sm' }, 'The app could not start.'),
      h('p', { class: 'muted' }, 'Try reloading. If it keeps happening, copy the logs below to investigate.'),
      h('pre', { class: 'error-pre' }, String(error?.stack || error)),
      h('pre', { class: 'error-pre' }, formatLogs(getLogs().slice(-30))),
      h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Reload'),
    ),
  );
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function boot() {
  const end = log.time('boot');
  log.info('Starting', {
    version: self.BOSS_VERSION,
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
    toast('Storage unavailable: data is limited to this session.', { type: 'warn', duration: 6000 });
  }

  const nav = document.getElementById('tabbar');
  renderTabbar(nav);

  const router = createRouter({
    views: VIEWS,
    defaultView: 'today',
    container: document.getElementById('view'),
    onChange: (route) => markActiveTab(nav, route),
  });

  // When data changes, re-render once on the next frame.
  let pending = false;
  store.subscribe((evt) => {
    if (evt.type === 'db-closed') {
      toast('The app was updated in another tab.', { type: 'warn', action: { label: 'Reload', fn: () => location.reload() } });
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

  // If midnight passed while away, refresh "today" when the app comes back.
  let lastDay = new Date().toDateString();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = new Date().toDateString();
    if (now !== lastDay) {
      log.info('Day changed, refreshing');
      lastDay = now;
      router.refresh();
    }
  });

  router.start();
  registerServiceWorker();
  initFocus();
  startReminders();
  if (store.settings.remindersEnabled && permission() === 'granted') registerPeriodicSync();

  window.boss = { store, logs: getLogs, setDebug, version: self.BOSS_VERSION, navigate };
  end();
}

boot();
