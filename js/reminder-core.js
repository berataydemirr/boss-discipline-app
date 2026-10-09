/*
 * Hatırlatıcı hesaplama çekirdeği — SAF ve KLASİK betik (ES modülü değil).
 * Neden: Hem sayfa (<script>) hem service worker (importScripts) aynı kuralı kullansın.
 * self.DisiplinReminders olarak erişilir. Node testlerinde globalThis'e yazılır.
 */
(function (root) {
  'use strict';

  var pad = function (n) {
    return String(n).padStart(2, '0');
  };

  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Pazartesi = 0 … Pazar = 6 */
  function weekdayOf(d) {
    return (d.getDay() + 6) % 7;
  }

  function parseTime(s) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || '');
    return m ? +m[1] * 60 + +m[2] : null;
  }

  /**
   * Şu an gösterilmesi gereken hatırlatmalar.
   * Bir hatırlatma, saati geldikten sonraki `windowMin` dakika içinde ve o gün daha önce
   * gösterilmediyse döner — uygulamayı akşam açınca sabahın hatırlatması patlamasın diye.
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
      return has ? null : { title: 'Günün öncelikleri', body: 'Bugünün en önemli üç işini yaz.' };
    });

    (input.habits || []).forEach(function (h) {
      if (h.archivedAt || h.kind !== 'build' || !h.reminder || h.createdAt > today) return;
      if (h.days.indexOf(wd) === -1 || input.doneToday.has(h.id)) return;
      consider('h:' + h.id, h.reminder, function () {
        return { title: h.name, body: 'Bugün henüz işaretlenmedi.' };
      });
    });

    consider('evening', settings.eveningTime, function () {
      return day.review ? null : { title: 'Akşam değerlendirmesi', body: 'Günü bir dakikada değerlendir.' };
    });

    return out;
  }

  /** Günlük "gösterildi" kaydı: gün değişince sıfırlanır. */
  function firedSet(log, today) {
    return new Set(log && log.date === today && Array.isArray(log.ids) ? log.ids : []);
  }

  root.DisiplinReminders = { dueReminders: dueReminders, firedSet: firedSet, dateKey: dateKey, parseTime: parseTime };
})(typeof self !== 'undefined' ? self : globalThis);
