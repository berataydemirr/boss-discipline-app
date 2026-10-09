/**
 * Settings: appearance, habits, quotes, reminders, focus, data, developer tools.
 * #/settings/logs → opens the log viewer directly (the "Details" link on error toasts).
 */
import { h, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast, showError } from '../ui/toast.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { applyTheme, ACCENTS } from '../ui/theme.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { createLogger, isDebug, setDebug, getLogs, clearLogs, formatLogs, formatTime, onLog } from '../core/logger.js';
import { formatLong, toKey } from '../core/dates.js';
import * as reminders from '../features/reminders.js';
import { exportToFile, readBackupFile, importBackup, requestPersistence, storageInfo } from '../features/backup.js';
import { resetTodayDrafts } from './today.js';
import { unregisterAll } from '../core/sw-register.js';

const log = createLogger('settings');

export function render({ params }) {
  if (params[0] === 'logs') {
    // Open the sheet after rendering; simplify the URL so a reload doesn't reopen it.
    history.replaceState(history.state, '', '#/settings');
    setTimeout(openLogs, 0);
  }
  const s = store.settings;

  return h(
    'div',
    { class: 'page settings' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'BOSS'), h('h1', { class: 'display' }, 'Settings')),

    group(
      'Appearance',
      row(
        'Theme',
        null,
        segmented(
          [
            ['system', 'System'],
            ['dark', 'Dark'],
            ['light', 'Light'],
          ],
          s.theme,
          (v) => setAndApply('theme', v),
        ),
        true,
      ),
      row(
        'Accent color',
        null,
        h(
          'div',
          { class: 'swatches' },
          ACCENTS.map((a) =>
            h('button', {
              class: 'swatch',
              style: { '--c': document.documentElement.dataset.theme === 'light' ? a.light : a.dark },
              'aria-label': a.name,
              'aria-pressed': String(s.accent === a.id),
              onclick: () => setAndApply('accent', a.id),
            }),
          ),
        ),
        true,
      ),
    ),

    group(
      'Habits',
      linkRow('Manage habits', `${store.habits().length} active · ${store.archivedHabits().length} archived`, () => navigate('habits')),
    ),

    quotesGroup(),
    remindersGroup(),
    focusGroup(),
    dataGroup(),

    group(
      'Developer',
      row(
        'Debug mode',
        'Keeps detailed logs and writes them to the console.',
        toggle(isDebug(), (on) => {
          setDebug(on);
          toast(on ? 'Debug mode on' : 'Debug mode off');
        }),
      ),
      linkRow('Logs', `${getLogs().length} entries`, openLogs),
      row('Storage', store.isPersistent ? 'IndexedDB · data is stored on this device' : 'Memory · data is NOT persisted (possibly a private tab)', null),
      linkRow('Clear cache and reload', 'If the app gets stuck on an old version', async () => {
        if (!(await confirmDialog({ title: 'Clear the cache?', message: 'Your data is kept; the app files are downloaded again.', confirmLabel: 'Clear' }))) return;
        await unregisterAll();
        location.reload();
      }),
    ),

    h('footer', { class: 'about' }, h('p', { class: 'serif about-name' }, 'BOSS'), h('p', { class: 'faint small num' }, `Version ${self.BOSS_VERSION}`)),
  );
}

async function setAndApply(key, value) {
  try {
    await store.setSetting(key, value);
    applyTheme(store.settings.theme, store.settings.accent);
  } catch (e) {
    showError(e);
  }
}

/* ───────────────────────── reminders ───────────────────────── */

function permissionText() {
  const p = reminders.permission();
  if (p === 'unsupported') {
    return reminders.isIOS() && !reminders.isStandalone()
      ? 'On iPhone, install the app first (Safari › Share › Add to Home Screen) and open it from there.'
      : 'This browser does not support notifications; reminders appear inside the app.';
  }
  if (p === 'granted') return 'Notifications allowed.';
  if (p === 'denied') return 'Notifications blocked; you can allow them in browser settings. Reminders appear inside the app.';
  return 'You will be asked for notification permission.';
}

function timeInput(key) {
  return h('input', {
    class: 'input input-time',
    type: 'time',
    value: store.settings[key] ?? '',
    'aria-label': key === 'morningTime' ? 'Morning reminder time' : 'Evening reminder time',
    onchange: (e) => store.setSetting(key, e.target.value || null).catch(showError),
  });
}

function remindersGroup() {
  const s = store.settings;
  return group(
    'Reminders',
    row(
      'Reminders',
      permissionText(),
      toggle(s.remindersEnabled, async (on) => {
        try {
          if (on) {
            const p = reminders.permission() === 'default' ? await reminders.requestPermission() : reminders.permission();
            await store.setSetting('remindersEnabled', true);
            reminders.startReminders();
            if (p === 'granted') reminders.registerPeriodicSync();
            toast(p === 'granted' ? 'Reminders on' : 'Reminders will appear inside the app');
          } else {
            await store.setSetting('remindersEnabled', false);
            reminders.stopReminders();
            reminders.unregisterPeriodicSync();
          }
        } catch (e) {
          showError(e);
        }
      }),
    ),
    s.remindersEnabled && row('Morning · priorities', 'Reminds you if you haven’t written your priorities.', timeInput('morningTime')),
    s.remindersEnabled && row('Evening · review', 'Reminds you if you haven’t reviewed your day.', timeInput('eveningTime')),
    s.remindersEnabled &&
      linkRow('Test notification', 'Set a habit’s reminder time when editing the habit.', async () => {
        try {
          if (reminders.permission() === 'granted') {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification('BOSS', { body: 'Reminders are working.', icon: './icons/icon-192.png', tag: 'boss-test' });
          } else {
            toast('BOSS — Reminders are working (in-app).');
          }
        } catch (e) {
          showError(e, 'Could not show the notification.');
        }
      }),
  );
}

/* ───────────────────────── focus ───────────────────────── */

function stepper(key, { min, max, unit }) {
  const v = store.settings[key];
  const set = (n) => store.setSetting(key, Math.min(max, Math.max(min, n))).catch(showError);
  return h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'btn-icon btn-icon-sm', 'aria-label': 'Decrease', disabled: v <= min, onclick: () => set(v - (v > 10 ? 5 : 1)) }, '−'),
    h('span', { class: 'stepper-value num' }, `${v}${unit ? ` ${unit}` : ''}`),
    h('button', { class: 'btn-icon btn-icon-sm', 'aria-label': 'Increase', disabled: v >= max, onclick: () => set(v + (v >= 10 ? 5 : 1)) }, '+'),
  );
}

function focusGroup() {
  return group(
    'Focus',
    row('Focus length', null, stepper('focusMinutes', { min: 5, max: 180, unit: 'min' })),
    row('Short break', null, stepper('shortBreak', { min: 1, max: 60, unit: 'min' })),
    row('Long break', null, stepper('longBreak', { min: 5, max: 90, unit: 'min' })),
    row('Long break every', 'Number of focus sessions', stepper('longEvery', { min: 2, max: 8 })),
    row(
      'Check off when done',
      'When a focus session ends, check off the linked habit for today.',
      toggle(store.settings.focusAutoCheck, (on) => store.setSetting('focusAutoCheck', on).catch(showError)),
    ),
  );
}

/* ───────────────────────── data ───────────────────────── */

function dataGroup() {
  const last = store.settings.lastExportAt;
  const staleDays = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const persistHint = h('span', { class: 'list-hint' }, '…');
  storageInfo().then((i) => {
    const used = i.usage != null ? `${(i.usage / 1024 / 1024).toFixed(1)} MB used` : '';
    persistHint.textContent =
      i.persisted === true ? `Persistent · ${used}` : i.persisted === false ? `The browser may clear it to free space · ${used}` : 'Unknown';
  });

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const obj = await readBackupFile(file);
        const c = obj?.counts ?? {};
        const when = obj?.exportedAt ? formatLong(toKey(new Date(obj.exportedAt))) : 'an unknown date';
        const ok = await confirmDialog({
          title: 'Restore this backup?',
          message: `Backup from ${when}: ${c.habits ?? '?'} habits, ${c.checks ?? '?'} check-ins, ${c.days ?? '?'} days. It will REPLACE all data on this device.`,
          confirmLabel: 'Restore',
          danger: true,
        });
        if (!ok) return;
        const { counts, skipped } = await importBackup(obj);
        resetTodayDrafts();
        toast(`Restored ${counts.habits} habits and ${counts.checks} check-ins${skipped ? ` · skipped ${skipped} broken records` : ''}.`, { duration: 5000 });
      } catch (err) {
        showError(err, 'Could not restore the backup.');
      }
    },
  });

  return group(
    'Data',
    linkRow(
      'Export backup',
      last ? `Last backup ${staleDays === 0 ? 'today' : `${staleDays} days ago`}` : 'No backup yet. Your data only lives on this device.',
      async () => {
        try {
          const r = await exportToFile();
          if (r !== 'cancelled') toast('Backup ready');
        } catch (e) {
          showError(e, 'Could not create the backup.');
        }
      },
    ),
    linkRow('Restore from backup', 'Choose a JSON backup file', () => fileInput.click()),
    fileInput,
    h(
      'div',
      { class: 'list-row' },
      h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, 'Persistent storage'), persistHint),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          onclick: async () => {
            const ok = await requestPersistence();
            toast(ok ? 'Data marked as persistent' : 'The browser declined (installing the app to the home screen helps)');
            const i = await storageInfo();
            persistHint.textContent = i.persisted ? 'Persistent' : 'The browser may clear it to free space';
          },
        },
        'Request',
      ),
    ),
    h(
      'button',
      {
        class: 'list-row is-link text-danger',
        onclick: async () => {
          const first = await confirmDialog({
            title: 'Delete all data?',
            message: 'Habits, check-ins, notes, goals and settings will be deleted. Export a backup first.',
            confirmLabel: 'Continue',
            danger: true,
          });
          if (!first) return;
          const second = await confirmDialog({ title: 'Are you sure?', message: 'This cannot be undone.', confirmLabel: 'Delete everything', danger: true });
          if (!second) return;
          try {
            await store.resetAll();
            resetTodayDrafts();
            toast('All data deleted');
            navigate('today');
          } catch (e) {
            showError(e);
          }
        },
      },
      h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, 'Delete all data')),
    ),
  );
}

/* ───────────────────────── quotes ───────────────────────── */

function quotesGroup() {
  const s = store.settings;
  const mine = store.userQuotes();
  return group(
    'Quote of the day',
    row(
      'Source',
      s.quoteSource === 'favorites' && !s.favQuotes.length
        ? 'No favorites yet; showing all quotes.'
        : s.quoteSource === 'mine' && !mine.length
          ? 'No quotes of your own yet; showing all quotes.'
          : null,
      segmented(
        [
          ['all', 'All'],
          ['favorites', 'Favorites'],
          ['mine', 'Mine'],
        ],
        s.quoteSource,
        (v) => store.setSetting('quoteSource', v).catch(showError),
      ),
      true,
    ),
    linkRow('My quotes', `${mine.length} ${mine.length === 1 ? 'quote' : 'quotes'}`, openQuotes),
  );
}

function openQuotes() {
  openSheet({
    title: 'My quotes',
    build: () => {
      const list = h('ul', { class: 'quote-list' });
      const fill = () => {
        const mine = store.userQuotes();
        list.replaceChildren(
          ...(mine.length
            ? mine.map((q) =>
                h(
                  'li',
                  { class: 'quote-item' },
                  h('div', null, h('p', { class: 'serif quote-item-text' }, q.text), q.author && h('p', { class: 'faint small' }, q.author)),
                  h(
                    'button',
                    {
                      class: 'btn-icon btn-icon-sm',
                      'aria-label': 'Delete',
                      onclick: async () => {
                        if (!(await confirmDialog({ title: 'Delete this quote?', confirmLabel: 'Delete', danger: true }))) return;
                        await store.deleteQuote(q.id).catch(showError);
                        fill();
                      },
                    },
                    icon('trash', { size: 17 }),
                  ),
                ),
              )
            : [h('li', { class: 'muted small pad-y' }, 'Add a line that speaks to you; it will show up as the quote of the day.')]),
        );
      };
      const text = h('textarea', { class: 'input', rows: 3, maxlength: 400, placeholder: 'Quote', autofocus: true });
      const author = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'Author (optional)' });
      fill();
      return h(
        'div',
        { class: 'stack' },
        h(
          'form',
          {
            class: 'form',
            onsubmit: async (e) => {
              e.preventDefault();
              try {
                await store.addQuote({ text: text.value, author: author.value });
                text.value = '';
                author.value = '';
                toast('Quote added');
                fill();
              } catch (err) {
                showError(err);
              }
            },
          },
          text,
          author,
          h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Add'),
        ),
        list,
      );
    },
  });
}

/* ───────────────────────── logs ───────────────────────── */

function openLogs() {
  let level = 'all';
  let unsubscribe = null;
  openSheet({
    title: 'Logs',
    className: 'sheet-tall',
    onClose: () => unsubscribe?.(),
    build: ({ close }) => {
      const list = h('ol', { class: 'log-list' });
      const fill = () => {
        const entries = getLogs()
          .filter((e) => level === 'all' || e.lvl === 'warn' || e.lvl === 'error')
          .reverse();
        list.replaceChildren(
          ...(entries.length
            ? entries.map((e) =>
                h(
                  'li',
                  { class: `log log-${e.lvl}` },
                  h('span', { class: 'log-time num' }, formatTime(e.t)),
                  h('span', { class: 'log-lvl' }, e.lvl),
                  h('span', { class: 'log-msg' }, h('b', null, `[${e.mod}] `), e.msg, e.data && h('code', { class: 'log-data' }, e.data)),
                ),
              )
            : [h('li', { class: 'muted small pad-y' }, 'No entries.')]),
        );
      };
      unsubscribe = onLog(() => fill());
      fill();

      return h(
        'div',
        { class: 'stack' },
        h(
          'div',
          { class: 'btn-row wrap' },
          segmented(
            [
              ['all', 'All'],
              ['problems', 'Problems'],
            ],
            level,
            (v, seg) => {
              level = v;
              seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
              fill();
            },
          ),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              onclick: async () => {
                const report = `BOSS ${self.BOSS_VERSION}\n${navigator.userAgent}\n\n${formatLogs()}`;
                toast((await copyText(report)) ? 'Logs copied' : 'Could not copy');
              },
            },
            icon('copy', { size: 16 }),
            'Copy',
          ),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              onclick: () => {
                console.log('[boss] state', store.debugSnapshot());
                toast('State written to the console');
              },
            },
            icon('bug', { size: 16 }),
            'State',
          ),
          h(
            'button',
            {
              class: 'btn btn-quiet btn-sm text-danger',
              onclick: async () => {
                if (!(await confirmDialog({ title: 'Clear all logs?', confirmLabel: 'Clear', danger: true }))) return;
                clearLogs();
                log.info('Logs cleared');
                fill();
              },
            },
            'Clear',
          ),
        ),
        list,
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => close() }, 'Close'),
      );
    },
  });
}

/* ───────────────────────── small components ───────────────────────── */

export function group(title, ...rows) {
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title)),
    h('div', { class: 'list-card' }, rows),
  );
}

/** stacked=true: the control sits below the title (more room on narrow screens). */
export function row(title, hint, control, stacked = false) {
  return h(
    'div',
    { class: ['list-row', stacked && 'is-stacked'] },
    h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, title), hint && h('span', { class: 'list-hint' }, hint)),
    control && h('div', { class: 'list-control' }, control),
  );
}

export function linkRow(title, hint, onclick) {
  return h(
    'button',
    { class: 'list-row is-link', onclick },
    h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, title), hint && h('span', { class: 'list-hint' }, hint)),
    icon('chevron-right', { size: 18, cls: 'list-chevron' }),
  );
}

export function segmented(options, value, onChange) {
  const seg = h('div', { class: 'segmented', role: 'group' });
  options.forEach(([v, label]) =>
    seg.append(
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(v === value),
          dataset: { v },
          onclick: () => onChange(v, seg),
        },
        label,
      ),
    ),
  );
  return seg;
}

export function toggle(checked, onChange) {
  return h('input', {
    type: 'checkbox',
    class: 'switch',
    role: 'switch',
    checked,
    onchange: (e) => onChange(e.target.checked),
  });
}
