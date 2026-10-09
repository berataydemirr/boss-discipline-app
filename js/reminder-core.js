/*
 * Reminder rules — PURE, CLASSIC script (not an ES module).
 * Why: the page (<script>) and the service worker (importScripts) must share one rule set.
 * Exposed as self.BossReminders; written to globalThis in Node tests.
 */
(function (root) {
  'use strict';

  var pad = function (n) {
    return String(n).padStart(2, '0');
  };

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Monday = 0 … Sunday = 6 */
  function weekdayOf(d) {
    return (d.getDay() + 6) % 7;
  }

  function parseTime(s) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || '');
    return m ? +m[1] * 60 + +m[2] : null;
  }

  /**
   * Reminders that should be shown right now.
   * A reminder fires within `windowMin` minutes after its time and only once per day,
   * so opening the app in the evening does not replay the morning's reminders.
   *
   * @param {{habits:object[], doneToday:Set<string>, day:object|null, settings:object, fired:Set<string>, now:Date, windowMin?:number}} input
   * @returns {{id:string, title:string, body:string, url:string}[]}
   */
  function dueReminders(input) {
    var settings = input.settings || {};
    if (!settings.remindersEnabled) return [];
    var now = input.now;
    var today = dateKey(now);
    var wd = weekdayOf(now);
    var mins = now.getHours() * 60 + now.getMinutes();
    var windowMin = input.windowMin == null ? 90 : input.windowMin;
    var fired = input.fired;
    var day = input.day || {};
    var out = [];

    function consider(id, time, make) {
      var t = parseTime(time);
      if (t == null || mins < t || mins - t > windowMin || fired.has(id)) return;
      var n = make();
      if (n) out.push({ id: id, title: n.title, body: n.body, url: n.url || './#/today' });
    }

    consider('morning', settings.morningTime, function () {
      var has = (day.priorities || []).some(function (p) {
        return p && p.text;
      });
      return has ? null : { title: 'Today’s priorities', body: 'Write down the three things that matter most today.' };
    });

    (input.habits || []).forEach(function (h) {
      if (h.archivedAt || h.kind !== 'build' || !h.reminder || h.createdAt > today) return;
      if (h.days.indexOf(wd) === -1 || input.doneToday.has(h.id)) return;
      consider('h:' + h.id, h.reminder, function () {
        return { title: h.name, body: 'Not checked off yet today.' };
      });
    });

    consider('evening', settings.eveningTime, function () {
      return day.review ? null : { title: 'Evening review', body: 'Take one minute to review your day.' };
    });

    return out;
  }

  /** Per-day "already shown" log: resets when the day changes. */
  function firedSet(log, today) {
    return new Set(log && log.date === today && Array.isArray(log.ids) ? log.ids : []);
  }

  root.BossReminders = { dueReminders: dueReminders, firedSet: firedSet, dateKey: dateKey, parseTime: parseTime };
})(typeof self !== 'undefined' ? self : globalThis);
