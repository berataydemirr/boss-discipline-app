/**
 * Günün sözü. SAF modül.
 *
 * Seçim deterministiktir: aynı gün her açılışta aynı söz gelir.
 * Havuz her "tur"da tohumlu olarak karıştırılır; böylece tüm sözler
 * bitmeden aynı söz tekrar gelmez ve sıralama her tur farklı olur.
 */
import { diffDays } from '../core/dates.js';

const EPOCH = '2024-01-01';

export const BUILTIN_QUOTES = [
  { id: 'b01', text: 'Biz, tekrar tekrar yaptığımız şeyleriz. O hâlde mükemmellik bir eylem değil, bir alışkanlıktır.', author: 'Will Durant' },
  { id: 'b02', text: 'Engel olan şey, yolun ta kendisi olur.', author: 'Marcus Aurelius' },
  { id: 'b03', text: 'İnsanın ne olduğunu gösteren şey, zorluklardır.', author: 'Epiktetos' },
  { id: 'b04', text: 'Gerçekte olduğundan çok, hayalimizde acı çekeriz.', author: 'Seneca' },
  { id: 'b05', text: 'Damlaya damlaya göl olur.', author: 'Atasözü' },
  { id: 'b06', text: 'İşleyen demir ışıldar.', author: 'Atasözü' },
  { id: 'b07', text: 'Bugünün işini yarına bırakma.', author: 'Atasözü' },
  { id: 'b08', text: 'Hayatta en hakiki mürşit ilimdir.', author: 'Mustafa Kemal Atatürk' },
  { id: 'b09', text: 'Bin kilometrelik bir yolculuk, tek bir adımla başlar.', author: 'Lao Tzu' },
  { id: 'b10', text: 'Disiplin, hedeflerle başarı arasındaki köprüdür.', author: 'Jim Rohn' },
  { id: 'b11', text: 'Başarı, her gün tekrarlanan küçük çabaların toplamıdır.', author: 'Robert Collier' },
  { id: 'b12', text: 'Hedeflerinin seviyesine yükselmezsin; sistemlerinin seviyesine düşersin.', author: 'James Clear' },
  { id: 'b13', text: 'Yaptığın her eylem, olmak istediğin kişiye verilmiş bir oydur.', author: 'James Clear' },
  { id: 'b14', text: 'Önce ne olmak istediğini kendine söyle; sonra yapman gerekeni yap.', author: 'Epiktetos' },
  { id: 'b15', text: 'Ruh, düşüncelerinin rengine boyanır.', author: 'Marcus Aurelius' },
  { id: 'b16', text: 'Hayat kısa değil; biz onun çoğunu boşa harcıyoruz.', author: 'Seneca' },
  { id: 'b17', text: 'Motivasyon seni başlatır, alışkanlık devam ettirir.', author: 'Jim Ryun' },
  { id: 'b18', text: 'Kendine hâkim olamayan kimse özgür değildir.', author: 'Epiktetos' },
  { id: 'b19', text: 'Acele etmeden, ama durmadan.', author: 'Goethe' },
  { id: 'b20', text: 'Mükemmel, iyinin düşmanıdır.', author: 'Voltaire' },
  { id: 'b21', text: 'Yaptığın her işi, hayatının son işiymiş gibi yap.', author: 'Marcus Aurelius' },
  { id: 'b22', text: 'Ne kadar yavaş gittiğin önemli değil; yeter ki durma.', author: 'Konfüçyüs’e atfedilir' },
  { id: 'b23', text: 'Yapmadan önce öğrenmemiz gereken şeyleri, yaparak öğreniriz.', author: 'Aristoteles' },
  { id: 'b24', text: 'Başlamak için harika olmak zorunda değilsin; ama harika olmak için başlamak zorundasın.', author: 'Zig Ziglar' },
  { id: 'b25', text: 'Zor işleri kolayken, büyük işleri küçükken yap.', author: 'Lao Tzu' },
  { id: 'b26', text: 'En güçlü insan, kendi üzerinde hâkimiyeti olandır.', author: 'Seneca' },
  { id: 'b27', text: 'Her gün yüzde bir daha iyi ol; bir yılın sonunda otuz yedi kat daha iyi olursun.', author: 'James Clear' },
  { id: 'b28', text: 'Su aka aka yolunu bulur.', author: 'Atasözü' },
  { id: 'b29', text: 'Disiplin özgürlüktür.', author: 'Jocko Willink' },
  { id: 'b30', text: 'Ertelemek, zamanın hırsızıdır.', author: 'Edward Young' },
  { id: 'b31', text: 'Ateş altını, zorluk cesur insanı sınar.', author: 'Seneca' },
  { id: 'b32', text: 'Öfkeyle kalkan zararla oturur.', author: 'Atasözü' },
  { id: 'b33', text: 'Hayat, insanın cesaretiyle orantılı olarak genişler ya da daralır.', author: 'Anaïs Nin' },
  { id: 'b34', text: 'Bir şey yapılıncaya kadar hep imkânsız görünür.', author: 'Nelson Mandela’ya atfedilir' },
  { id: 'b35', text: 'Zaman en kıt kaynaktır; o yönetilmedikçe başka hiçbir şey yönetilemez.', author: 'Peter Drucker' },
  { id: 'b36', text: 'Hayat, başına gelenlerin yüzde onu, onlara nasıl tepki verdiğinin yüzde doksanıdır.', author: 'Charles R. Swindoll' },
  { id: 'b37', text: 'Odaklanmak, hayır demektir.', author: 'Steve Jobs' },
  { id: 'b38', text: 'Önce biz alışkanlıklarımızı yaparız, sonra alışkanlıklarımız bizi yapar.', author: 'John Dryden’a atfedilir' },
  { id: 'b39', text: 'Ya disiplinin acısını ya da pişmanlığın acısını çekeceksin.', author: 'Jim Rohn' },
  { id: 'b40', text: 'Yavaş büyümekten korkma; yalnızca yerinde saymaktan kork.', author: 'Çin atasözü' },
  { id: 'b41', text: 'Konfor alanı güzel bir yerdir, ama orada hiçbir şey yetişmez.', author: 'Anonim' },
  { id: 'b42', text: 'Bugün yaptığın şey, yarın olacağın kişiyi belirler.', author: 'Anonim' },
  { id: 'b43', text: 'Küçük adımlar da adımdır.', author: 'Anonim' },
  { id: 'b44', text: 'Talih, yalnızca hazırlıklı zihinlerden yanadır.', author: 'Louis Pasteur' },
  { id: 'b45', text: 'Sabrın sonu selamettir.', author: 'Atasözü' },
  { id: 'b46', text: 'Emek olmadan yemek olmaz.', author: 'Atasözü' },
  { id: 'b47', text: 'Derin çalışma giderek nadirleşiyor; tam da bu yüzden giderek değerleniyor.', author: 'Cal Newport' },
  { id: 'b48', text: 'Fırsatlar çoğu zaman iş tulumu giydiği için kaçırılır; çünkü iş gibi görünürler.', author: 'Thomas Edison’a atfedilir' },
  { id: 'b49', text: 'Kim olmak istediğine karar ver, sonra bunu küçük kazanımlarla kendine kanıtla.', author: 'James Clear' },
  { id: 'b50', text: 'İstediğin şeyi şimdi istediğin şey uğruna feda etme.', author: 'Anonim' },
  { id: 'b51', text: 'Kendini yenmek, zaferlerin ilki ve en büyüğüdür.', author: 'Platon' },
  { id: 'b52', text: 'Düşünceler eyleme, eylemler alışkanlığa, alışkanlıklar karaktere dönüşür.', author: 'Anonim' },
  { id: 'b53', text: 'Tembele iş buyur, sana akıl öğretsin.', author: 'Atasözü' },
  { id: 'b54', text: 'Ölçmediğin şeyi geliştiremezsin.', author: 'Peter Drucker’a atfedilir' },
  { id: 'b55', text: 'Az olsun, öz olsun.', author: 'Atasözü' },
];

/** Küçük, hızlı, tohumlu PRNG. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(n, seed) {
  const rnd = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ayarlara göre söz havuzu.
 * @param {'all'|'mine'|'favorites'} source
 * Seçilen kaynak boşsa (ör. hiç favori yok) tüm sözlere düşer; ekran asla boş kalmaz.
 */
export function quotePool(userQuotes, source, favIds) {
  const all = [...BUILTIN_QUOTES, ...userQuotes];
  let pool = all;
  if (source === 'mine') pool = userQuotes;
  else if (source === 'favorites') {
    const fav = new Set(favIds);
    pool = all.filter((q) => fav.has(q.id));
  }
  return pool.length ? pool : all;
}

export function pickForDate(pool, dateKey) {
  if (!pool.length) return null;
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = sorted.length;
  const dayIndex = diffDays(EPOCH, dateKey);
  const cycle = Math.floor(dayIndex / n);
  const pos = ((dayIndex % n) + n) % n;
  const order = shuffledIndices(n, Math.imul(cycle + 1, 2654435761) ^ n);
  return sorted[order[pos]];
}
