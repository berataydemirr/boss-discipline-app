/**
 * Custom line icons (24×24 grid, 1.7 stroke).
 * The markup is static and trusted, so innerHTML is safe here.
 */
const PATHS = {
  today: '<circle cx="12" cy="12" r="8.25"/><path d="M8.6 12.4l2.3 2.3 4.6-4.9"/>',
  journal: '<path d="M6 3.75h11.25a.75.75 0 0 1 .75.75v15a.75.75 0 0 1-.75.75H6.5A1.75 1.75 0 0 1 4.75 18.5V5A1.25 1.25 0 0 1 6 3.75z"/><path d="M4.75 17.5c0-.97.78-1.75 1.75-1.75H18M8.5 8h6"/>',
  chart: '<path d="M4 19.5h16"/><path d="M7.5 16v-4.5M12 16V7.5M16.5 16v-6"/>',
  timer: '<circle cx="12" cy="13.25" r="7.25"/><path d="M12 9.75v3.5l2.25 1.75M9.75 2.75h4.5"/>',
  target: '<circle cx="12" cy="12" r="8.25"/><circle cx="12" cy="12" r="4.25"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  'chevron-left': '<path d="M14.5 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'chevron-up': '<path d="M6 14.5l6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5.5 12.5l4.25 4.25L18.5 8"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  flame: '<path d="M12 3.5c.6 3.2 4.75 5.2 4.75 9.75a4.75 4.75 0 0 1-9.5 0c0-2.3 1.25-3.75 2.4-4.75.3 1.6 1.1 2.6 2.15 3.1-.65-2.45-.9-5.25.2-8.1z"/>',
  shield: '<path d="M12 3.25l7 2.75v5.25c0 4.4-2.9 8.1-7 9.5-4.1-1.4-7-5.1-7-9.5V6z"/>',
  edit: '<path d="M4.75 19.25h3.5L18.6 8.9a1.6 1.6 0 0 0 0-2.25l-1.25-1.25a1.6 1.6 0 0 0-2.25 0L4.75 15.75z"/><path d="M13.5 7l3.5 3.5"/>',
  trash: '<path d="M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.85 11.6a1.5 1.5 0 0 0 1.5 1.4h6.3a1.5 1.5 0 0 0 1.5-1.4L17.5 7M9.25 7V4.75h5.5V7"/>',
  archive: '<rect x="3.75" y="4.25" width="16.5" height="4.25" rx="1"/><path d="M5.25 8.5v10a1.25 1.25 0 0 0 1.25 1.25h11a1.25 1.25 0 0 0 1.25-1.25v-10M10 12.25h4"/>',
  restore: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.75h3.75"/>',
  heart: '<path d="M12 19.5s-7-4.3-7-9.75A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.35c0 5.45-7 9.75-7 9.75z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  download: '<path d="M12 4.5v10.5M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4.5M7.5 9l4.5-4.5L16.5 9M5 19.5h14"/>',
  bell: '<path d="M6.25 16.5V11a5.75 5.75 0 0 1 11.5 0v5.5l1.5 1.75H4.75z"/><path d="M10 20.25a2 2 0 0 0 4 0"/>',
  play: '<path d="M8 5.75v12.5a.6.6 0 0 0 .9.5l9.6-6.25a.6.6 0 0 0 0-1L8.9 5.25a.6.6 0 0 0-.9.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  skip: '<path d="M6 5.75v12.5l8.75-6.25z"/><path d="M18 5.5v13"/>',
  search: '<circle cx="11" cy="11" r="6.25"/><path d="M15.75 15.75l4 4"/>',
  'arrow-right': '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
  calendar: '<rect x="4" y="5.25" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.25v4M15.5 3.25v4"/>',
  quote: '<path d="M10 7.5H6.75A1.75 1.75 0 0 0 5 9.25v2.5c0 .97.78 1.75 1.75 1.75H9.5v.75c0 1.5-1 2.75-2.75 3.25M19 7.5h-3.25A1.75 1.75 0 0 0 14 9.25v2.5c0 .97.78 1.75 1.75 1.75h2.75v.75c0 1.5-1 2.75-2.75 3.25"/>',
  bug: '<rect x="7.25" y="8" width="9.5" height="11.5" rx="4.75"/><path d="M9.5 8V6.75a2.5 2.5 0 0 1 5 0V8M12 12v7.5M4 13.5h3.25M16.75 13.5H20M5 8.5l2.5 1.5M19 8.5L16.5 10M5 19l2.5-1.75M19 19l-2.5-1.75"/>',
  info: '<circle cx="12" cy="12" r="8.25"/><path d="M12 11v5M12 8v.01"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, { size = 20, cls = '', label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${cls}`.trim());
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const markup = PATHS[name];
  if (!markup) {
    console.warn(`[icons] unknown icon: ${name}`);
    return svg;
  }
  svg.innerHTML = markup;
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);
