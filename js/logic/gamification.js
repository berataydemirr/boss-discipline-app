/**
 * Puan, seviye ve rozetler. SAF modül.
 * Puan saklanmaz; her seferinde verinin kendisinden hesaplanır. Böylece bir işareti
 * geri almak puanı da geri alır ve hile/tutarsızlık oluşmaz.
 */

export const POINTS = {
  check: 10, // yapılan her alışkanlık
  perfectDay: 5, // planlı her şeyin yapıldığı gün
  review: 3, // akşam değerlendirmesi
  cleanDay: 2, // bırakılacak alışkanlıkta temiz geçen her gün
  focus10: 1, // her 10 dakikalık odak
};

export const LEVEL_TITLES = ['Başlangıç', 'Çırak', 'Kararlı', 'İstikrarlı', 'Azimli', 'Disiplinli', 'Usta', 'Bilge', 'Stoacı'];

/**
 * L seviyesine ulaşmak için gereken toplam puan: 0, 300, 750, 1350, 2100 …
 * Her gün 4–5 alışkanlık yapan biri ~2. ayda "Azimli", ~8. ayda "Stoacı" olur.
 */
export function pointsForLevel(level) {
  return 75 * (level - 1) * (level + 2);
}

export function computePoints({ checks = 0, perfectDays = 0, reviews = 0, cleanDays = 0, focusMinutes = 0 }) {
  return (
    checks * POINTS.check +
    perfectDays * POINTS.perfectDay +
    reviews * POINTS.review +
    cleanDays * POINTS.cleanDay +
    Math.floor(focusMinutes / 10) * POINTS.focus10
  );
}

export function levelFor(points) {
  let level = 1;
  while (pointsForLevel(level + 1) <= points) level++;
  const floor = pointsForLevel(level);
  const next = pointsForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    points,
    floor,
    next,
    progress: (points - floor) / (next - floor),
  };
}

/**
 * Rozetler. `value(ctx)` ilerlemeyi, `target` hedefi verir.
 * ctx: { checks, bestStreak, perfectDays, perfectRun, reviews, notes, quitBest, focusMinutes }
 */
export const BADGES = [
  { id: 'ilk-adim', title: 'İlk adım', desc: 'İlk alışkanlığını işaretle', target: 1, value: (c) => c.checks },
  { id: 'seri-7', title: 'Bir hafta', desc: '7 günlük seri', target: 7, value: (c) => c.bestStreak },
  { id: 'seri-30', title: 'Bir ay', desc: '30 günlük seri', target: 30, value: (c) => c.bestStreak },
  { id: 'seri-100', title: 'Yüz gün', desc: '100 günlük seri', target: 100, value: (c) => c.bestStreak },
  { id: 'tam-gun-10', title: 'Tam on', desc: '10 tam gün', target: 10, value: (c) => c.perfectDays },
  { id: 'tam-hafta', title: 'Kusursuz hafta', desc: '7 gün üst üste tam gün', target: 7, value: (c) => c.perfectRun },
  { id: 'yuz-tik', title: 'Yüz tik', desc: '100 kez işaretle', target: 100, value: (c) => c.checks },
  { id: 'bin-tik', title: 'Bin tik', desc: '1000 kez işaretle', target: 1000, value: (c) => c.checks },
  { id: 'temiz-30', title: 'Temiz ay', desc: 'Bıraktığın bir şeyden 30 gün uzak dur', target: 30, value: (c) => c.quitBest },
  { id: 'yansima-10', title: 'Aynaya bak', desc: '10 akşam değerlendirmesi', target: 10, value: (c) => c.reviews },
  { id: 'kalem-30', title: 'Kalem', desc: '30 günlük not', target: 30, value: (c) => c.notes },
  { id: 'odak-10', title: 'Derin iş', desc: '10 saat odak', target: 600, value: (c) => c.focusMinutes ?? 0 },
];

export function evaluateBadges(ctx) {
  return BADGES.map((b) => {
    const current = Math.max(0, b.value(ctx) || 0);
    return { id: b.id, title: b.title, desc: b.desc, target: b.target, current, earned: current >= b.target, progress: Math.min(1, current / b.target) };
  });
}
