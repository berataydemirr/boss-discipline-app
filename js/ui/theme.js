/**
 * Tema ve vurgu rengi. Seçim localStorage'a da yansıtılır ki index.html'deki
 * küçük betik, CSS yüklenmeden önce doğru temayı uygulayıp beyaz flaşı önlesin.
 */
import { createLogger } from '../core/logger.js';

const log = createLogger('theme');
const media = window.matchMedia('(prefers-color-scheme: light)');
let currentPref = 'system';

export const ACCENTS = [
  { id: 'ember', name: 'Kiremit', dark: '#e2673c', light: '#c4501f' },
  { id: 'moss', name: 'Yosun', dark: '#a7b872', light: '#5c7a2b' },
  { id: 'ochre', name: 'Hardal', dark: '#dba845', light: '#9c6c0b' },
  { id: 'tide', name: 'Gelgit', dark: '#7fa8cc', light: '#2f6690' },
];

function resolve(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return media.matches ? 'light' : 'dark';
}

export function applyTheme(pref, accent) {
  currentPref = pref;
  const root = document.documentElement;
  const theme = resolve(pref);
  root.dataset.theme = theme;
  root.dataset.accent = accent;
  try {
    localStorage.setItem('disiplin:theme', pref);
    localStorage.setItem('disiplin:accent', accent);
  } catch {
    /* yok say */
  }
  // Durum çubuğu rengi arka planla aynı olsun.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#11100e');
  log.debug('tema uygulandı', { pref, theme, accent });
}

media.addEventListener?.('change', () => {
  if (currentPref === 'system') applyTheme('system', document.documentElement.dataset.accent);
});
