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
};

export const emptyCareer = (): Career => ({ botWins: [0, 0, 0, 0], streak: 0, bestStreak: 0, soloBest: 0, bestWave: 0, bestScore: 0, matches: 0 });

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** Storage can hold anything (an older shape, a hand edit), so every field is rebuilt rather than trusted. */
export function validCareer(raw: unknown): Career {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Career, unknown>>;
  const wins = Array.isArray(source.botWins) ? source.botWins : [];
  return {
    botWins: Array.from({ length: BOT_LEVELS }, (_, level) => count(wins[level])),
    streak: count(source.streak), bestStreak: Math.max(count(source.bestStreak), count(source.streak)),
    soloBest: count(source.soloBest), bestWave: count(source.bestWave), bestScore: count(source.bestScore), matches: count(source.matches)
  };
}

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

export function recordCoopRun(before: Career, wavesCleared: number, score: number): { career: Career; newBest: boolean } {
  const career = validCareer(before);
  const newBest = (score > career.bestScore || wavesCleared > career.bestWave) && score > 0;
  career.matches++;
  career.bestWave = Math.max(career.bestWave, count(wavesCleared));
  career.bestScore = Math.max(career.bestScore, count(score));
  return { career, newBest };
}
