/** What a lone player keeps between visits: the bot ladder, streaks and co-op records. Pure, so it is easy to test. */
export const BOT_LEVELS = 4, BOSS = 3;
export const MEDALS = ['🥉', '🥈', '🥇', '👑'] as const;

export type Career = {
  /** Matches won against each bot level. */
  botWins: number[];
  streak: number; bestStreak: number;
  /** Best solo-versus match score. */
  soloBest: number;
  /** Co-op records: waves cleared and score. */
  bestWave: number; bestScore: number;
  matches: number;
  /** Best stars (0-3) at each Solo Tour stop. */
  tour: number[];
  /** Best co-op runs, best wave first: the best-wave board. */
  board: Array<{ wave: number; score: number }>;
};

export const TOUR_STOPS = 12;
export const BOARD_SIZE = 5;
export const emptyCareer = (): Career => ({ botWins: [0, 0, 0, 0], streak: 0, bestStreak: 0, soloBest: 0, bestWave: 0, bestScore: 0, matches: 0, tour: Array(TOUR_STOPS).fill(0), board: [] });

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** Storage can hold anything (an older shape, a hand edit), so every field is rebuilt rather than trusted. */
export function validCareer(raw: unknown): Career {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Career, unknown>>;
  const wins = Array.isArray(source.botWins) ? source.botWins : [];
  return {
    botWins: Array.from({ length: BOT_LEVELS }, (_, level) => count(wins[level])),
    streak: count(source.streak), bestStreak: Math.max(count(source.bestStreak), count(source.streak)),
    soloBest: count(source.soloBest), bestWave: count(source.bestWave), bestScore: count(source.bestScore), matches: count(source.matches),
    tour: Array.from({ length: TOUR_STOPS }, (_, stop) => Math.min(3, count(Array.isArray(source.tour) ? source.tour[stop] : 0))),
    board: (Array.isArray(source.board) ? source.board : [])
      .map((entry) => ({ wave: count((entry as { wave?: unknown })?.wave), score: count((entry as { score?: unknown })?.score) }))
      .filter((entry) => entry.wave > 0)
      .sort(byBoard)
      .slice(0, BOARD_SIZE)
  };
}

const byBoard = (a: { wave: number; score: number }, b: { wave: number; score: number }) => b.wave - a.wave || b.score - a.score;

/** The Boss only shows up once Hard has been beaten. */
export const botLevels = (career: Career) => (career.botWins[BOSS - 1] > 0 || career.botWins[BOSS] > 0 ? BOT_LEVELS : BOT_LEVELS - 1);
export const medalRow = (career: Career) => MEDALS.map((medal, level) => (career.botWins[level] > 0 ? medal : '·')).join(' ');

/** A round won against the bot: harder bots and healthier wins are worth more. */
export const roundScore = (skill: number, heartsLeft: number) => 100 * (skill + 1) + 20 * Math.max(0, heartsLeft);
/** Taking the whole match pays a bonus, bigger for a clean sweep. */
export const matchBonus = (skill: number, roundsLost: number) => (150 + (roundsLost === 0 ? 100 : 0)) * (skill + 1);

export type SoloResult = { career: Career; firstWin: boolean; newBest: boolean; newStreak: boolean; unlockedBoss: boolean };

export function recordSoloMatch(before: Career, skill: number, won: boolean, score: number): SoloResult {
  const career = validCareer(before), level = Math.max(0, Math.min(BOT_LEVELS - 1, Math.floor(skill)));
  const hadBoss = botLevels(career) === BOT_LEVELS;
  const firstWin = won && career.botWins[level] === 0;
  career.matches++;
  if (won) { career.botWins[level]++; career.streak++; } else career.streak = 0;
  const newStreak = career.streak > career.bestStreak && career.streak > 1;
  career.bestStreak = Math.max(career.bestStreak, career.streak);
  const newBest = score > career.soloBest && score > 0;
  career.soloBest = Math.max(career.soloBest, score);
  return { career, firstWin, newBest, newStreak, unlockedBoss: !hadBoss && botLevels(career) === BOT_LEVELS };
}

export function recordCoopRun(before: Career, wavesCleared: number, score: number): { career: Career; newBest: boolean; place: number } {
  const career = validCareer(before);
  const newBest = (score > career.bestScore || wavesCleared > career.bestWave) && score > 0;
  career.matches++;
  career.bestWave = Math.max(career.bestWave, count(wavesCleared));
  career.bestScore = Math.max(career.bestScore, count(score));
  let place = -1;
  if (wavesCleared > 0) {
    const entry = { wave: count(wavesCleared), score: count(score) };
    career.board = [...career.board, entry].sort(byBoard).slice(0, BOARD_SIZE);
    place = career.board.indexOf(entry);
  }
  return { career, newBest, place };
}

/** Records a finished tour stop: best stars stick, and a played stop counts as a match. */
export function recordTourStop(before: Career, stop: number, stars: number): { career: Career; gained: number } {
  const career = validCareer(before);
  const previous = career.tour[stop] ?? 0;
  career.matches++;
  if (stop >= 0 && stop < TOUR_STOPS) career.tour[stop] = Math.max(previous, Math.min(3, stars));
  return { career, gained: Math.max(0, stars - previous) };
}

export const tourTotal = (career: Career) => career.tour.reduce((sum, stars) => sum + stars, 0);

/** The hat wardrobe: every hat is earned by something you did, so it is worked out from the career, never stored twice. */
export type Hat = { id: string; icon: string; name: readonly [string, string]; how: readonly [string, string]; earned: (career: Career) => boolean };
export const WARDROBE: readonly Hat[] = [
  { id: 'none', icon: '', name: ['No hat', '不戴帽子'], how: ['', ''], earned: () => true },
  { id: 'cap', icon: '🧢', name: ['Cap', '鸭舌帽'], how: ['Play a match', '打一场比赛'], earned: (c) => c.matches >= 1 },
  { id: 'top', icon: '🎩', name: ['Top hat', '高礼帽'], how: ['Beat any bot', '击败任意电脑'], earned: (c) => c.botWins.some((wins) => wins > 0) || c.tour[0] > 0 },
  { id: 'sun', icon: '👒', name: ['Sun hat', '遮阳帽'], how: ['Earn 3 tour stars', '巡回赛拿到 3 颗星'], earned: (c) => tourTotal(c) >= 3 },
  { id: 'grad', icon: '🎓', name: ['Mortarboard', '学士帽'], how: ['Reach co-op wave 5', '合作模式打到第 5 波'], earned: (c) => c.bestWave >= 4 },
  { id: 'rescue', icon: '⛑️', name: ['Rescue helmet', '救援头盔'], how: ['Earn 9 tour stars', '巡回赛拿到 9 颗星'], earned: (c) => tourTotal(c) >= 9 },
  { id: 'cowboy', icon: '🤠', name: ['Cowboy hat', '牛仔帽'], how: ['Beat the Hard bot', '击败困难电脑'], earned: (c) => c.botWins[2] > 0 },
  { id: 'army', icon: '🪖', name: ['Army helmet', '钢盔'], how: ['Clear 10 co-op waves', '合作模式清完 10 波'], earned: (c) => c.bestWave >= 10 },
  { id: 'horns', icon: '😈', name: ['Devil horns', '恶魔角'], how: ['Beat the Boss bot', '击败魔王电脑'], earned: (c) => c.botWins[3] > 0 },
  { id: 'duck', icon: '🦆', name: ['Duck', '小黄鸭'], how: ['Earn 24 tour stars', '巡回赛拿到 24 颗星'], earned: (c) => tourTotal(c) >= 24 },
  { id: 'crown', icon: '👑', name: ['Crown', '王冠'], how: ['Win all 12 tour stops', '赢下全部 12 站'], earned: (c) => c.tour.every((stars) => stars > 0) },
  { id: 'party', icon: '🥳', name: ['Party hat', '派对帽'], how: ['Earn all 36 tour stars', '拿满 36 颗星'], earned: (c) => tourTotal(c) >= 36 }
];
export const hatById = (id: string) => WARDROBE.find((hat) => hat.id === id) ?? WARDROBE[0];
export const earnedHats = (career: Career) => WARDROBE.filter((hat) => hat.earned(career));
