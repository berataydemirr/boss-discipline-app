/**
 * Yedek dosyası biçimi ve doğrulaması. SAF modül.
 *
 * İçe aktarma "ya hep ya hiç" çalışır: dosya tanınmazsa hiçbir şey değişmez.
 * Tek tek bozuk kayıtlar (ör. elle düzenlenmiş dosyada geçersiz tarih) atlanır ve sayılır;
 * kullanıcıya kaç kaydın atlandığı söylenir.
 */
import { isValidKey } from '../core/dates.js';
import {
  ValidationError,
  validateHabit,
  validateQuote,
  validatePriorities,
  validateReview,
  validateGoal,
  validateFocusSession,
  cleanMultiline,
} from '../core/validate.js';

export const BACKUP_APP = 'disiplin';
export const BACKUP_FORMAT = 1;

export function makeBackup(data, { version, schema, now = new Date() }) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    version,
    schema,
    exportedAt: now.toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    data,
  };
}

/**
 * @param {unknown} obj JSON.parse sonucu
 * @param {{today:string, settingValidators:Record<string,(v)=>boolean>}} ctx
 * @returns {{data:Record<string, object[]>, skipped:number, counts:Record<string,number>}}
 */
export function validateBackup(obj, { today, settingValidators }) {
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP || !obj.data || typeof obj.data !== 'object') {
    throw new ValidationError('Bu dosya bir BOSS yedeği değil.');
  }
  if (obj.format > BACKUP_FORMAT) {
    throw new ValidationError('Bu yedek uygulamanın daha yeni bir sürümüyle alınmış. Önce uygulamayı güncelle.');
  }
  const src = obj.data;
  let skipped = 0;

  const list = (name) => {
    const v = src[name] ?? [];
    if (!Array.isArray(v)) throw new ValidationError(`Yedekte "${name}" bölümü bozuk.`);
    return v;
  };
  /** Her kaydı dönüştür; hata verenleri atla. */
  const each = (name, fn) => {
    const out = [];
    for (const item of list(name)) {
      try {
        const r = fn(item);
        if (r) out.push(r);
        else skipped++;
      } catch {
        skipped++;
      }
    }
    return out;
  };
  const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;

  const habits = each('habits', (h) => {
    if (!isId(h?.id)) return null;
    const base = validateHabit(h, { today });
    return {
      id: h.id,
      ...base,
      order: Number.isFinite(h.order) ? h.order : 0,
      archivedAt: isValidKey(h.archivedAt) ? h.archivedAt : null,
      updatedAt: Number.isFinite(h.updatedAt) ? h.updatedAt : Date.now(),
    };
  });
  const habitKinds = new Map(habits.map((h) => [h.id, h.kind]));

  const seenChecks = new Set();
  const checks = each('checks', (c) => {
    if (!habitKinds.has(c?.habitId) || !isValidKey(c?.date) || c.date > today) return null;
    const id = `${c.date}|${c.habitId}`;
    if (seenChecks.has(id)) return null;
    seenChecks.add(id);
    return { id, habitId: c.habitId, date: c.date, type: habitKinds.get(c.habitId) === 'quit' ? 'slip' : 'done', at: Number.isFinite(c.at) ? c.at : Date.now() };
  });

  const days = each('days', (d) => {
    if (!isValidKey(d?.date) || d.date > today) return null;
    let review = null;
    try {
      review = validateReview(d.review ?? null);
    } catch {
      skipped++; // gün kalır, yalnızca bozuk değerlendirme atılır
    }
    const rec = {
      date: d.date,
      note: cleanMultiline(d.note, 5000),
      priorities: Array.isArray(d.priorities) ? validatePriorities(d.priorities) : [],
      review,
      updatedAt: Number.isFinite(d.updatedAt) ? d.updatedAt : Date.now(),
    };
    return rec.note.trim() || rec.priorities.length || rec.review ? rec : null;
  });

  const quotes = each('quotes', (q) => {
    if (!isId(q?.id) || !q.id.startsWith('u-')) return null;
    return { id: q.id, ...validateQuote(q), createdAt: Number.isFinite(q.createdAt) ? q.createdAt : Date.now() };
  });

  const settings = each('settings', (s) => {
    if (typeof s?.key !== 'string' || !settingValidators[s.key]) return null;
    return settingValidators[s.key](s.value) ? { key: s.key, value: s.value } : null;
  });

  const focus = each('focus', (f) => {
    if (!isId(f?.id)) return null;
    const base = validateFocusSession(f);
    if (base.habitId && !habitKinds.has(base.habitId)) base.habitId = null;
    return { id: f.id, ...base };
  });

  const goals = each('goals', (g) => {
    if (!isId(g?.id)) return null;
    return { id: g.id, ...validateGoal(g), createdAt: Number.isFinite(g.createdAt) ? g.createdAt : Date.now() };
  });

  const data = { habits, checks, days, quotes, settings, focus, goals };
  return { data, skipped, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) };
}
