/**
 * Günlük: geçmiş notların listesi, aya göre gruplu, aranabilir.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { todayKey, weekday, formatMonthYear, WEEKDAYS_SHORT } from '../core/dates.js';

let query = '';

function normalize(s) {
  return s.toLocaleLowerCase('tr-TR');
}

export function render() {
  const today = todayKey();
  const all = store.daysWithContent();
  const list = h('div', { class: 'journal-list' });

  function fill() {
    const q = normalize(query.trim());
    const items = q ? all.filter((d) => normalize(d.note ?? '').includes(q)) : all;
    const groups = new Map();
    for (const d of items) {
      const m = d.date.slice(0, 7);
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push(d);
    }
    list.replaceChildren(
      ...(items.length
        ? [...groups].map(([m, days]) =>
            h(
              'section',
              { class: 'journal-month' },
              h('h2', { class: 'section-title' }, formatMonthYear(`${m}-01`)),
              h('ul', { class: 'journal-items' }, days.map(entry)),
            ),
          )
        : [
            h(
              'p',
              { class: 'muted pad-y' },
              q ? `“${query.trim()}” için sonuç yok.` : 'Henüz not yok. Bugün ekranının altındaki not alanına yazdıkların burada birikir.',
            ),
          ]),
    );
  }

  function entry(d) {
    return h(
      'li',
      null,
      h(
        'button',
        { class: 'journal-item', onclick: () => navigate(d.date === today ? 'today' : `today/${d.date}`) },
        h(
          'span',
          { class: 'ji-date' },
          h('span', { class: 'ji-num serif' }, String(Number(d.date.slice(8)))),
          h('span', { class: 'ji-wd' }, WEEKDAYS_SHORT[weekday(d.date)]),
        ),
        h('span', { class: 'ji-body' }, h('span', { class: 'ji-note' }, d.note.trim())),
      ),
    );
  }

  fill();

  return h(
    'div',
    { class: 'page' },
    h('header', { class: 'page-head' }, h('p', { class: 'eyebrow' }, `${all.length} kayıt`), h('h1', { class: 'display' }, 'Günlük')),
    all.length > 0 &&
      h(
        'label',
        { class: 'search' },
        icon('search', { size: 18 }),
        h('input', {
          type: 'search',
          class: 'search-input',
          placeholder: 'Notlarda ara',
          value: query,
          'data-fk': 'journal-search',
          oninput: (e) => {
            query = e.target.value;
            fill();
          },
        }),
      ),
    list,
  );
}
