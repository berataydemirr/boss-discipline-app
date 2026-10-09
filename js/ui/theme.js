/**
 * Theme and accent color. The choice is mirrored to localStorage so the small script
 * in index.html can apply the right theme before CSS loads (no white flash).
 */
import { createLogger } from '../core/logger.js';

const log = createLogger('theme');
const media = window.matchMedia('(prefers-color-scheme: light)');
let currentPref = 'system';

export const ACCENTS = [
  { id: 'ember', name: 'Ember', dark: '#e2673c', light: '#c4501f' },
  { id: 'moss', name: 'Moss', dark: '#a7b872', light: '#5c7a2b' },
  { id: 'ochre', name: 'Ochre', dark: '#dba845', light: '#9c6c0b' },
  { id: 'tide', name: 'Tide', dark: '#7fa8cc', light: '#2f6690' },
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
    localStorage.setItem('boss:theme', pref);
    localStorage.setItem('boss:accent', accent);
  } catch {
    /* ignore */
  }
  // Match the status bar to the background.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#11100e');
  log.debug('theme applied', { pref, theme, accent });
}

media.addEventListener?.('change', () => {
  if (currentPref === 'system') applyTheme('system', document.documentElement.dataset.accent);
});
