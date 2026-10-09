/**
 * Quote of the day. PURE module.
 *
 * Selection is deterministic: the same day always shows the same quote.
 * The pool is shuffled with a seed for every "cycle", so no quote repeats
 * until all have been shown, and each cycle has a different order.
 */
import { diffDays } from '../core/dates.js';

const EPOCH = '2024-01-01';

export const BUILTIN_QUOTES = [
  { id: 'b01', text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant' },
  { id: 'b02', text: 'What stands in the way becomes the way.', author: 'Marcus Aurelius' },
  { id: 'b03', text: 'It is difficulties that show what men are.', author: 'Epictetus' },
  { id: 'b04', text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { id: 'b05', text: 'Little by little, a little becomes a lot.', author: 'Tanzanian proverb' },
  { id: 'b06', text: 'Well begun is half done.', author: 'Aristotle' },
  { id: 'b07', text: 'The secret of getting ahead is getting started.', author: 'Attributed to Mark Twain' },
  { id: 'b08', text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese proverb' },
  { id: 'b09', text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { id: 'b10', text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { id: 'b11', text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier' },
  { id: 'b12', text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { id: 'b13', text: 'Every action you take is a vote for the type of person you wish to become.', author: 'James Clear' },
  { id: 'b14', text: 'First say to yourself what you would be; and then do what you have to do.', author: 'Epictetus' },
  { id: 'b15', text: 'The soul becomes dyed with the color of its thoughts.', author: 'Marcus Aurelius' },
  { id: 'b16', text: 'It is not that we have a short time to live, but that we waste a lot of it.', author: 'Seneca' },
  { id: 'b17', text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
  { id: 'b18', text: 'No man is free who is not master of himself.', author: 'Epictetus' },
  { id: 'b19', text: 'Without haste, but without rest.', author: 'Goethe' },
  { id: 'b20', text: 'Perfect is the enemy of good.', author: 'Voltaire' },
  { id: 'b21', text: 'Do every act of your life as though it were the very last act of your life.', author: 'Marcus Aurelius' },
  { id: 'b22', text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Attributed to Confucius' },
  { id: 'b23', text: 'For the things we have to learn before we can do them, we learn by doing them.', author: 'Aristotle' },
  { id: 'b24', text: 'You don’t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { id: 'b25', text: 'Do the difficult things while they are easy and do the great things while they are small.', author: 'Lao Tzu' },
  { id: 'b26', text: 'Most powerful is he who has himself in his own power.', author: 'Seneca' },
  { id: 'b27', text: 'Get one percent better each day and you will be thirty-seven times better in a year.', author: 'James Clear' },
  { id: 'b28', text: 'Rivers know this: there is no hurry. We shall get there some day.', author: 'A. A. Milne' },
  { id: 'b29', text: 'Discipline equals freedom.', author: 'Jocko Willink' },
  { id: 'b30', text: 'Procrastination is the thief of time.', author: 'Edward Young' },
  { id: 'b31', text: 'Fire tests gold, suffering tests brave men.', author: 'Seneca' },
  { id: 'b32', text: 'You have power over your mind — not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
  { id: 'b33', text: 'Life shrinks or expands in proportion to one’s courage.', author: 'Anaïs Nin' },
  { id: 'b34', text: 'It always seems impossible until it’s done.', author: 'Attributed to Nelson Mandela' },
  { id: 'b35', text: 'Time is the scarcest resource, and unless it is managed nothing else can be managed.', author: 'Peter Drucker' },
  { id: 'b36', text: 'Life is 10% what happens to you and 90% how you react to it.', author: 'Charles R. Swindoll' },
  { id: 'b37', text: 'Focusing is about saying no.', author: 'Steve Jobs' },
  { id: 'b38', text: 'We first make our habits, and then our habits make us.', author: 'Attributed to John Dryden' },
  { id: 'b39', text: 'We must all suffer one of two things: the pain of discipline or the pain of regret.', author: 'Jim Rohn' },
  { id: 'b40', text: 'Be not afraid of growing slowly; be afraid only of standing still.', author: 'Chinese proverb' },
  { id: 'b41', text: 'A comfort zone is a beautiful place, but nothing ever grows there.', author: 'Anonymous' },
  { id: 'b42', text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
  { id: 'b43', text: 'Small steps are still steps.', author: 'Anonymous' },
  { id: 'b44', text: 'Chance favors only the prepared mind.', author: 'Louis Pasteur' },
  { id: 'b45', text: 'Patience is bitter, but its fruit is sweet.', author: 'Jean-Jacques Rousseau' },
  { id: 'b46', text: 'There are no shortcuts to any place worth going.', author: 'Beverly Sills' },
  { id: 'b47', text: 'The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable.', author: 'Cal Newport' },
  { id: 'b48', text: 'Opportunity is missed by most people because it is dressed in overalls and looks like work.', author: 'Attributed to Thomas Edison' },
  { id: 'b49', text: 'Decide the type of person you want to be. Prove it to yourself with small wins.', author: 'James Clear' },
  { id: 'b50', text: 'Don’t give up what you want most for what you want now.', author: 'Anonymous' },
  { id: 'b51', text: 'The first and best victory is to conquer self.', author: 'Plato' },
  { id: 'b52', text: 'Watch your actions, they become habits; watch your habits, they become your character.', author: 'Anonymous' },
  { id: 'b53', text: 'The man who moves a mountain begins by carrying away small stones.', author: 'Attributed to Confucius' },
  { id: 'b54', text: 'What gets measured gets managed.', author: 'Attributed to Peter Drucker' },
  { id: 'b55', text: 'Simplicity is the ultimate sophistication.', author: 'Attributed to Leonardo da Vinci' },
];

/** Small, fast, seeded PRNG. */
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
 * Quote pool for the chosen source.
 * @param {'all'|'mine'|'favorites'} source
 * Falls back to all quotes if the chosen source is empty, so the screen is never blank.
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
