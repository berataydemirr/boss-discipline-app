/**
 * Girdi doğrulama ve normalleştirme. SAF modül.
 * Store'a yazılan her şey buradan geçer; UI'a anlamlı Türkçe hata mesajı döner.
 */
import { isValidKey, isValidTime } from './dates.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Alışkanlık renkleri. Sıralama bilinçli: komşu renkler normal görüşte ve renk körlüğünde
 * ayrışacak şekilde dizildi (dataviz doğrulayıcısıyla kontrol edildi). Renk hiçbir yerde
 * tek başına kimlik taşımaz; her zaman alışkanlığın adıyla birlikte gösterilir.
 */
export const HABIT_COLORS = [
  { id: 'kiremit', name: 'Kiremit', hex: '#d65f34' },
  { id: 'deniz', name: 'Deniz', hex: '#5592da' },
  { id: 'hardal', name: 'Hardal', hex: '#bd8a28' },
  { id: 'adacayi', name: 'Adaçayı', hex: '#2fa38e' },
  { id: 'murdum', name: 'Mürdüm', hex: '#a679d4' },
  { id: 'zeytin', name: 'Zeytin', hex: '#879c38' },
  { id: 'gul', name: 'Gül', hex: '#d96c86' },
];

export function colorHex(id) {
  return (HABIT_COLORS.find((c) => c.id === id) ?? HABIT_COLORS[0]).hex;
}

/** Tek satır metin: boşlukları sadeleştirir, kırpar. */
export function cleanText(v, max) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Çok satırlı metin: satır sonlarını korur, sondaki boşlukları atar. */
export function cleanMultiline(v, max) {
  return String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .slice(0, max);
}

export function validateHabit(input, { today }) {
  if (!input || typeof input !== 'object') throw new ValidationError('Geçersiz alışkanlık verisi.');

  const name = cleanText(input.name, 60);
  if (!name) throw new ValidationError('Alışkanlığa bir ad ver.');

  if (input.kind != null && input.kind !== 'build' && input.kind !== 'quit') {
    throw new ValidationError(`Bilinmeyen alışkanlık türü: ${input.kind}`);
  }
  const kind = input.kind === 'quit' ? 'quit' : 'build';

  const color = HABIT_COLORS.some((c) => c.id === input.color) ? input.color : HABIT_COLORS[0].id;

  let days = Array.isArray(input.days)
    ? [...new Set(input.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if (kind === 'quit') days = [0, 1, 2, 3, 4, 5, 6];
  if (!days.length) throw new ValidationError('En az bir gün seç.');

  const createdAt = input.createdAt ?? today;
  if (!isValidKey(createdAt)) throw new ValidationError('Başlangıç tarihi geçersiz.');
  if (createdAt > today) throw new ValidationError('Başlangıç tarihi gelecekte olamaz.');

  let reminder = null;
  if (input.reminder) {
    if (!isValidTime(input.reminder)) throw new ValidationError('Hatırlatma saati SS:DD biçiminde olmalı.');
    reminder = input.reminder;
  }

  return { name, kind, color, days, createdAt, reminder };
}

export function validateQuote(input) {
  const text = cleanText(input?.text, 400);
  if (text.length < 3) throw new ValidationError('Söz en az 3 karakter olmalı.');
  const author = cleanText(input?.author, 80);
  return { text, author };
}

export const MAX_PRIORITIES = 3;

/** Günün öncelikleri: en fazla 3, boş metinler atılır. */
export function validatePriorities(list) {
  if (!Array.isArray(list)) throw new ValidationError('Öncelikler liste olmalı.');
  return list
    .slice(0, MAX_PRIORITIES)
    .map((p) => ({ text: cleanText(p?.text, 120), done: !!p?.done }))
    .filter((p) => p.text);
}

function scale(v, min, max, label) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${label} ${min}–${max} arasında olmalı.`);
  return n;
}

/** Akşam değerlendirmesi. null → değerlendirmeyi sil. */
export function validateReview(input) {
  if (input == null) return null;
  const review = {
    score: scale(input.score, 1, 10, 'Gün puanı'),
    mood: scale(input.mood, 1, 5, 'Ruh hali'),
    energy: scale(input.energy, 1, 5, 'Enerji'),
    good: cleanMultiline(input.good, 1000).trim(),
    improve: cleanMultiline(input.improve, 1000).trim(),
  };
  if (review.score == null) throw new ValidationError('Günü 1–10 arasında puanla.');
  return review;
}
