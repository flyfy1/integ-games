/** Fruit Orbit modes, jar puzzles, missions and jar skins. Data and small pure helpers only. */
import type { World } from './sim';

export type FruitMode = 'classic' | 'daily' | 'puzzle';

export type JarGoal =
  | { kind: 'make'; tier: number }
  | { kind: 'chain'; n: number }
  | { kind: 'score'; points: number };

export type JarPuzzle = {
  name: [en: string, zh: string];
  /** Fruit already in the jar, placed left to right as [tier, x]; each lands where a drop there would rest. */
  fill: ReadonlyArray<readonly [number, number]>;
  /** The drops, in order. The puzzle's budget is this list's length. */
  drops: readonly number[];
  goal: JarGoal;
  /** Drops for three stars: what the reference solver needed. */
  par: number;
};

export const puzzleBudget = (p: JarPuzzle) => p.drops.length;
export const twoStarDrops = (p: JarPuzzle) => p.par + Math.ceil((puzzleBudget(p) - p.par) / 2);
export function jarStars(p: JarPuzzle, drops: number): 0 | 1 | 2 | 3 {
  if (drops <= p.par) return 3;
  if (drops <= twoStarDrops(p)) return 2;
  return drops <= puzzleBudget(p) ? 1 : 0;
}
export function goalMet(goal: JarGoal, world: World): boolean {
  if (goal.kind === 'make') return world.bodies.some((b) => b.tier >= goal.tier);
  if (goal.kind === 'chain') return world.bestChain >= goal.n;
  return world.score >= goal.points;
}

export const JAR_PUZZLES: readonly JarPuzzle[] = [
  { name: ['First pair', '第一对'], fill: [[0, 150]], drops: [0, 1, 0, 2], goal: { kind: 'make', tier: 1 }, par: 1 },
  { name: ['Lime time', '青柠时间'], fill: [[1, 110], [0, 250]], drops: [1, 0, 2, 0, 1], goal: { kind: 'make', tier: 2 }, par: 1 },
  { name: ['Three in a row', '三连'], fill: [[2, 70], [1, 160], [0, 240], [3, 310]], drops: [0, 1, 0, 2, 1], goal: { kind: 'chain', n: 3 }, par: 1 },
  { name: ['Peach stack', '蜜桃叠叠'], fill: [[2, 90], [1, 250]], drops: [1, 2, 0, 0, 1, 3], goal: { kind: 'make', tier: 3 }, par: 1 },
  { name: ['Tower drop', '高塔连锁'], fill: [[3, 180], [2, 180], [1, 180], [0, 180]], drops: [0, 1, 0, 2], goal: { kind: 'chain', n: 4 }, par: 1 },
  { name: ['Kiwi corner', '奇异果角落'], fill: [[6, 100], [5, 270], [4, 190]], drops: [4, 3, 2, 1, 0, 4, 3], goal: { kind: 'make', tier: 7 }, par: 2 },
  { name: ['Lemon squeeze', '挤柠檬'], fill: [[3, 80], [2, 260], [1, 180]], drops: [2, 1, 0, 3, 0, 2, 1], goal: { kind: 'make', tier: 4 }, par: 4 },
  { name: ['Double up', '连锁初体验'], fill: [[1, 80], [0, 230], [2, 300]], drops: [0, 0, 1, 2, 0, 1, 0, 1], goal: { kind: 'chain', n: 2 }, par: 1 },
  { name: ['An apple a day', '一天一苹果'], fill: [[4, 80], [3, 270], [2, 180]], drops: [3, 2, 1, 0, 4, 1, 2, 3], goal: { kind: 'make', tier: 5 }, par: 5 },
  { name: ['Small change', '积少成多'], fill: [[0, 60], [1, 140], [0, 220], [2, 300]], drops: [0, 1, 2, 0, 1, 3, 0, 2], goal: { kind: 'score', points: 40 }, par: 5 },
  { name: ['Pumpkin patch', '南瓜地'], fill: [[8, 100], [7, 280], [6, 200], [5, 120]], drops: [4, 4, 3, 4, 3, 2], goal: { kind: 'make', tier: 9 }, par: 2 },
  { name: ['Kiwi climb', '奇异果攀登'], fill: [[4, 60], [5, 160], [6, 280]], drops: [3, 2, 4, 1, 0, 3, 2, 1, 4], goal: { kind: 'make', tier: 7 }, par: 3 },
  { name: ['Long chain', '长连锁'], fill: [[4, 300], [3, 300], [2, 300], [1, 300], [0, 300]], drops: [0, 1, 0, 2], goal: { kind: 'chain', n: 5 }, par: 1 },
  { name: ['Moonrise', '月出'], fill: [[5, 70], [7, 220], [6, 120]], drops: [4, 3, 4, 2, 1, 0, 3, 2, 4, 1], goal: { kind: 'make', tier: 8 }, par: 4 },
  { name: ['Crowded jar', '挤满的罐子'], fill: [[2, 40], [3, 110], [1, 180], [4, 250], [2, 320], [0, 200], [1, 90]], drops: [0, 1, 2, 0, 3, 1, 2, 0, 4, 1, 2], goal: { kind: 'score', points: 160 }, par: 8 },
  { name: ['Moon melon', '月亮蜜瓜'], fill: [[7, 100], [6, 270], [5, 190]], drops: [4, 3, 2, 1, 0, 4, 3, 2, 1, 0], goal: { kind: 'make', tier: 8 }, par: 6 },
  { name: ['Orange grove', '橙子园'], fill: [[5, 90], [4, 270], [3, 180]], drops: [4, 3, 2, 1, 0, 3, 2, 4, 1, 0, 3, 4, 2, 3], goal: { kind: 'make', tier: 6 }, par: 11 },
  { name: ['Ring pumpkin', '星环南瓜'], fill: [[8, 280], [7, 80], [6, 180], [5, 240]], drops: [4, 4, 3, 4, 3, 2, 4, 3, 4, 2], goal: { kind: 'make', tier: 9 }, par: 6 },
  { name: ['Sunrise', '日出'], fill: [[9, 110], [8, 280], [7, 200], [6, 100]], drops: [4, 4, 3, 4, 4, 3, 4, 4, 2, 4], goal: { kind: 'make', tier: 10 }, par: 5 },
  { name: ['Sun melon', '太阳西瓜'], fill: [[9, 250], [8, 80], [7, 170], [6, 260], [5, 100]], drops: [4, 4, 3, 4, 4, 3, 4, 4, 2, 4, 4, 3], goal: { kind: 'make', tier: 10 }, par: 7 }
];

/** Rotating missions: three run at once in Classic, each pays a helper item when it is done. */
export type MissionKind = 'chain' | 'make' | 'count' | 'score' | 'merges';
export type Mission = { kind: MissionKind; target: number; tier?: number; reward: 'shake' | 'pop' };
export const MISSION_POOL: readonly Mission[] = [
  { kind: 'chain', target: 3, reward: 'shake' },
  { kind: 'make', target: 1, tier: 5, reward: 'pop' },
  { kind: 'count', target: 2, tier: 3, reward: 'shake' },
  { kind: 'merges', target: 15, reward: 'pop' },
  { kind: 'score', target: 400, reward: 'shake' },
  { kind: 'count', target: 2, tier: 4, reward: 'pop' },
  { kind: 'chain', target: 4, reward: 'pop' },
  { kind: 'make', target: 1, tier: 6, reward: 'shake' },
  { kind: 'merges', target: 30, reward: 'shake' },
  { kind: 'score', target: 1200, reward: 'pop' },
  { kind: 'count', target: 2, tier: 5, reward: 'shake' },
  { kind: 'make', target: 1, tier: 7, reward: 'pop' },
  { kind: 'chain', target: 5, reward: 'shake' },
  { kind: 'score', target: 2500, reward: 'pop' }
];
/** Helper stock is capped so a long Classic run cannot bank its way past the jar. */
export const HELPER_CAP = 2;

export type JarSkin = { id: string; name: [string, string]; unlock: number; sky: [string, string, string]; glow: string; rim: string };
/** Jar skins, unlocked by the biggest fruit ever made in Classic or the Daily. */
export const JAR_SKINS: readonly JarSkin[] = [
  { id: 'twilight', name: ['Twilight', '暮光'], unlock: 0, sky: ['#150f33', '#26143f', '#3b1b47'], glow: 'rgba(255,143,112,.22)', rim: 'rgba(255,236,226,.7)' },
  { id: 'dawn', name: ['Dawn', '黎明'], unlock: 6, sky: ['#1b1440', '#4a2352', '#8a3f4f'], glow: 'rgba(255,190,120,.3)', rim: 'rgba(255,240,210,.8)' },
  { id: 'lagoon', name: ['Lagoon', '泻湖'], unlock: 7, sky: ['#071d2e', '#0c3346', '#125055'], glow: 'rgba(110,240,210,.26)', rim: 'rgba(210,255,245,.75)' },
  { id: 'moonlit', name: ['Moonlit', '月光'], unlock: 8, sky: ['#0b0f24', '#1a2148', '#2d3566'], glow: 'rgba(232,213,154,.3)', rim: 'rgba(251,243,207,.85)' },
  { id: 'harvest', name: ['Harvest', '丰收'], unlock: 9, sky: ['#1d0f0a', '#3d1d10', '#6a3414'], glow: 'rgba(255,160,70,.32)', rim: 'rgba(255,220,170,.85)' },
  { id: 'solar', name: ['Solar', '烈日'], unlock: 10, sky: ['#1f1205', '#5a2d06', '#a85a0c'], glow: 'rgba(255,226,122,.42)', rim: 'rgba(255,246,200,.95)' }
];
