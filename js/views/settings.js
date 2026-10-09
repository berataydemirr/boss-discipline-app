/**
 * Ayarlar: görünüm, sözler, geliştirici araçları.
 * #/settings/logs → kayıt panelini doğrudan açar (hata bildirimlerindeki "Ayrıntı" bağlantısı).
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
    // Sayfa çizildikten sonra paneli aç; URL'yi sadeleştir ki yenilemede tekrar açılmasın.
    history.replaceState(history.state, '', '#/settings');
    setTimeout(openLogs, 0);
  }
  const s = store.settings;

  return h(
    'div',
    { class: 'page settings' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'BOSS'), h('h1', { class: 'display' }, 'Ayarlar')),

    group(
      'Görünüm',
      row(
        'Tema',
        null,
        segmented(
          [
            ['system', 'Sistem'],
            ['dark', 'Koyu'],
            ['light', 'Açık'],
          ],
          s.theme,
          (v) => setAndApply('theme', v),
        ),
        true,
      ),
      row(
        'Vurgu rengi',
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
      'Alışkanlıklar',
      linkRow('Alışkanlıkları yönet', `${store.habits().length} aktif · ${store.archivedHabits().length} arşivde`, () => navigate('habits')),
    ),

    quotesGroup(),
    remindersGroup(),
    focusGroup(),
    dataGroup(),

    group(
      'Geliştirici',
      row(
        'Debug modu',
        'Ayrıntılı kayıt tutar ve konsola yazar.',
        toggle(isDebug(), (on) => {
          setDebug(on);
          toast(on ? 'Debug modu açık' : 'Debug modu kapalı');
        }),
      ),
      linkRow('Kayıtlar', `${getLogs().length} kayıt`, openLogs),
      row(
        'Depolama',
        store.isPersistent ? 'IndexedDB · veriler bu cihazda saklanıyor' : 'Bellek · veriler KALICI DEĞİL (gizli sekme olabilir)',
        null,
      ),
      linkRow('Önbelleği temizle ve yenile', 'Uygulama eski sürümde takılırsa', async () => {
        if (!(await confirmDialog({ title: 'Önbellek temizlensin mi?', message: 'Verilerin silinmez; uygulama dosyaları yeniden indirilir.', confirmLabel: 'Temizle' }))) return;
        await unregisterAll();
        location.reload();
      }),
    ),

    h(
      'footer',
      { class: 'about' },
      h('p', { class: 'serif about-name' }, 'BOSS'),
      h('p', { class: 'faint small num' }, `Sürüm ${self.DISIPLIN_VERSION}`),
    ),
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

/* ───────────────────────── hatırlatıcılar (v3) ───────────────────────── */

function permissionText() {
  const p = reminders.permission();
  if (p === 'unsupported') {
    return reminders.isIOS() && !reminders.isStandalone()
      ? 'iPhone’da bildirim için önce Safari › Paylaş › Ana Ekrana Ekle ile kur, oradan aç.'
      : 'Bu tarayıcı bildirimleri desteklemiyor; hatırlatmalar uygulama içinde görünür.';
  }
  if (p === 'granted') return 'Bildirim izni verildi.';
  if (p === 'denied') return 'Bildirim izni reddedildi; tarayıcı ayarlarından açabilirsin. Hatırlatmalar uygulama içinde görünür.';
  return 'Açınca bildirim izni istenecek.';
}

function timeInput(key) {
  return h('input', {
    class: 'input input-time',
    type: 'time',
    value: store.settings[key] ?? '',
    'aria-label': key === 'morningTime' ? 'Sabah hatırlatma saati' : 'Akşam hatırlatma saati',
    onchange: (e) => store.setSetting(key, e.target.value || null).catch(showError),
  });
}

function remindersGroup() {
  const s = store.settings;
  return group(
    'Hatırlatıcılar',
    row(
      'Hatırlatıcılar',
      permissionText(),
      toggle(s.remindersEnabled, async (on) => {
        try {
          if (on) {
            const p = reminders.permission() === 'default' ? await reminders.requestPermission() : reminders.permission();
            await store.setSetting('remindersEnabled', true);
            reminders.startReminders();
            if (p === 'granted') reminders.registerPeriodicSync();
            toast(p === 'granted' ? 'Hatırlatıcılar açık' : 'Hatırlatıcılar uygulama içinde gösterilecek');
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
    s.remindersEnabled && row('Sabah · öncelikler', 'Öncelikleri yazmadıysan hatırlatır.', timeInput('morningTime')),
    s.remindersEnabled && row('Akşam · değerlendirme', 'Günü değerlendirmediysen hatırlatır.', timeInput('eveningTime')),
    s.remindersEnabled &&
      linkRow('Deneme bildirimi', 'Alışkanlık hatırlatma saatini alışkanlığı düzenlerken seçersin.', async () => {
        try {
          if (reminders.permission() === 'granted') {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification('BOSS', { body: 'Hatırlatıcılar çalışıyor.', icon: './icons/icon-192.png', tag: 'disiplin-test' });
          } else {
            toast('BOSS — Hatırlatıcılar çalışıyor (uygulama içi).');
          }
        } catch (e) {
          showError(e, 'Bildirim gösterilemedi.');
        }
      }),
  );
}

/* ───────────────────────── odak (v3) ───────────────────────── */

function stepper(key, { min, max, unit }) {
  const v = store.settings[key];
  const set = (n) => store.setSetting(key, Math.min(max, Math.max(min, n))).catch(showError);
  return h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'btn-icon btn-icon-sm', 'aria-label': 'Azalt', disabled: v <= min, onclick: () => set(v - (v > 10 ? 5 : 1)) }, '−'),
    h('span', { class: 'stepper-value num' }, `${v}${unit ? ` ${unit}` : ''}`),
    h('button', { class: 'btn-icon btn-icon-sm', 'aria-label': 'Artır', disabled: v >= max, onclick: () => set(v + (v >= 10 ? 5 : 1)) }, '+'),
  );
}

function focusGroup() {
  return group(
    'Odak',
    row('Odak süresi', null, stepper('focusMinutes', { min: 5, max: 180, unit: 'dk' })),
    row('Kısa mola', null, stepper('shortBreak', { min: 1, max: 60, unit: 'dk' })),
    row('Uzun mola', null, stepper('longBreak', { min: 5, max: 90, unit: 'dk' })),
    row('Uzun mola sıklığı', 'Kaç odak oturumunda bir', stepper('longEvery', { min: 2, max: 8 })),
    row(
      'Bitince işaretle',
      'Odak bitince bağlı alışkanlığı bugün için işaretler.',
      toggle(store.settings.focusAutoCheck, (on) => store.setSetting('focusAutoCheck', on).catch(showError)),
    ),
  );
}

/* ───────────────────────── veri (v3) ───────────────────────── */

function dataGroup() {
  const last = store.settings.lastExportAt;
  const staleDays = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const persistHint = h('span', { class: 'list-hint' }, '…');
  storageInfo().then((i) => {
    const used = i.usage != null ? `${(i.usage / 1024 / 1024).toFixed(1)} MB kullanılıyor` : '';
    persistHint.textContent =
      i.persisted === true ? `Kalıcı · ${used}` : i.persisted === false ? `Tarayıcı yer açmak için silebilir · ${used}` : 'Bilinmiyor';
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
        const when = obj?.exportedAt ? formatLong(toKey(new Date(obj.exportedAt))) : 'bilinmeyen tarih';
        const ok = await confirmDialog({
          title: 'Yedek geri yüklensin mi?',
          message: `${when} tarihli yedek: ${c.habits ?? '?'} alışkanlık, ${c.checks ?? '?'} işaret, ${c.days ?? '?'} gün. Bu cihazdaki mevcut verilerin YERİNE geçecek.`,
          confirmLabel: 'Geri yükle',
          danger: true,
        });
        if (!ok) return;
        const { counts, skipped } = await importBackup(obj);
        resetTodayDrafts();
        toast(`${counts.habits} alışkanlık, ${counts.checks} işaret geri yüklendi${skipped ? ` · ${skipped} bozuk kayıt atlandı` : ''}.`, { duration: 5000 });
      } catch (err) {
        showError(err, 'Yedek geri yüklenemedi.');
      }
    },
  });

  return group(
    'Veri',
    linkRow(
      'Yedeği dışa aktar',
      last ? `Son yedek ${staleDays === 0 ? 'bugün' : `${staleDays} gün önce`}` : 'Henüz yedek alınmadı. Veriler yalnızca bu cihazda.',
      async () => {
        try {
          const r = await exportToFile();
          if (r !== 'cancelled') toast('Yedek hazır');
        } catch (e) {
          showError(e, 'Yedek alınamadı.');
        }
      },
    ),
    linkRow('Yedekten geri yükle', 'JSON yedek dosyası seç', () => fileInput.click()),
    fileInput,
    h(
      'div',
      { class: 'list-row' },
      h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, 'Kalıcı depolama'), persistHint),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          onclick: async () => {
            const ok = await requestPersistence();
            toast(ok ? 'Veriler kalıcı olarak işaretlendi' : 'Tarayıcı izin vermedi (uygulamayı ana ekrana eklemek yardımcı olur)');
            const i = await storageInfo();
            persistHint.textContent = i.persisted ? 'Kalıcı' : 'Tarayıcı yer açmak için silebilir';
          },
        },
        'İste',
      ),
    ),
    h(
      'button',
      {
        class: 'list-row is-link text-danger',
        onclick: async () => {
          const first = await confirmDialog({
            title: 'Tüm veriler silinsin mi?',
            message: 'Alışkanlıklar, işaretler, notlar, hedefler ve ayarlar silinir. Önce yedek almanı öneririm.',
            confirmLabel: 'Devam',
            danger: true,
          });
          if (!first) return;
          const second = await confirmDialog({ title: 'Emin misin?', message: 'Bu işlem geri alınamaz.', confirmLabel: 'Hepsini sil', danger: true });
          if (!second) return;
          try {
            await store.resetAll();
            resetTodayDrafts();
            toast('Tüm veriler silindi');
            navigate('today');
          } catch (e) {
            showError(e);
          }
        },
      },
      h('div', { class: 'list-text' }, h('span', { class: 'list-title' }, 'Tüm verileri sil')),
    ),
  );
}

/* ───────────────────────── sözler ───────────────────────── */

function quotesGroup() {
  const s = store.settings;
  const mine = store.userQuotes();
  return group(
    'Günün sözü',
    row(
      'Kaynak',
      s.quoteSource === 'favorites' && !s.favQuotes.length
        ? 'Henüz favori yok; tüm sözler gösteriliyor.'
        : s.quoteSource === 'mine' && !mine.length
          ? 'Henüz kendi sözün yok; tüm sözler gösteriliyor.'
          : null,
      segmented(
        [
          ['all', 'Hepsi'],
          ['favorites', 'Favoriler'],
          ['mine', 'Benimkiler'],
        ],
        s.quoteSource,
        (v) => store.setSetting('quoteSource', v).catch(showError),
      ),
      true,
    ),
    linkRow('Kendi sözlerim', `${mine.length} söz`, openQuotes),
  );
}

function openQuotes() {
  openSheet({
    title: 'Kendi sözlerim',
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
                      'aria-label': 'Sil',
                      onclick: async () => {
                        if (!(await confirmDialog({ title: 'Söz silinsin mi?', confirmLabel: 'Sil', danger: true }))) return;
                        await store.deleteQuote(q.id).catch(showError);
                        fill();
                      },
                    },
                    icon('trash', { size: 17 }),
                  ),
                ),
              )
            : [h('li', { class: 'muted small pad-y' }, 'Sana iyi gelen bir cümleyi ekle; günün sözü olarak karşına çıksın.')]),
        );
      };
      const text = h('textarea', { class: 'input', rows: 3, maxlength: 400, placeholder: 'Söz', autofocus: true });
      const author = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'Kimin? (isteğe bağlı)' });
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
                toast('Söz eklendi');
                fill();
              } catch (err) {
                showError(err);
              }
            },
          },
          text,
          author,
          h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Ekle'),
        ),
        list,
      );
    },
  });
}

/* ───────────────────────── kayıtlar ───────────────────────── */

function openLogs() {
  let level = 'all';
  let unsubscribe = null;
  openSheet({
    title: 'Kayıtlar',
    className: 'sheet-tall',
    onClose: () => unsubscribe?.(),
    build: ({ close }) => {
      const list = h('ol', { class: 'log-list' });
      const fill = () => {
        const entries = getLogs()
          .filter((e) => level === 'all' || (level === 'problems' ? e.lvl === 'warn' || e.lvl === 'error' : true))
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
            : [h('li', { class: 'muted small pad-y' }, 'Kayıt yok.')]),
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
              ['all', 'Tümü'],
              ['problems', 'Sorunlar'],
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
                const report = `BOSS ${self.DISIPLIN_VERSION}\n${navigator.userAgent}\n\n${formatLogs()}`;
                toast((await copyText(report)) ? 'Kayıtlar kopyalandı' : 'Kopyalanamadı');
              },
            },
            icon('copy', { size: 16 }),
            'Kopyala',
          ),
          h(
            'button',
            {
              class: 'btn btn-ghost btn-sm',
              onclick: () => {
                console.log('[disiplin] durum', store.debugSnapshot());
                toast('Durum konsola yazıldı');
              },
            },
            icon('bug', { size: 16 }),
            'Durum',
          ),
          h(
            'button',
            {
              class: 'btn btn-quiet btn-sm text-danger',
              onclick: async () => {
                if (!(await confirmDialog({ title: 'Tüm kayıtlar silinsin mi?', confirmLabel: 'Temizle', danger: true }))) return;
                clearLogs();
                log.info('Kayıtlar temizlendi');
                fill();
              },
            },
            'Temizle',
          ),
        ),
        list,
        h('button', { class: 'btn btn-ghost btn-block', onclick: () => close() }, 'Kapat'),
      );
    },
  });
}

/* ───────────────────────── küçük bileşenler ───────────────────────── */

export function group(title, ...rows) {
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title)),
    h('div', { class: 'list-card' }, rows),
  );
}

/** stacked=true: kontrol başlığın altına yerleşir (dar ekranda daha rahat). */
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
