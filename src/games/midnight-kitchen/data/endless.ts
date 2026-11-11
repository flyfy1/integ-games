import type { CellList, ModifierDef, SpawnRow, WaveDef } from '../types';

/**
 * Endless generator. Deterministic for a given `random` stream.
 *
 * The night walks through the kitchen: every `THEME_LENGTH` waves the pool, the board modifier and the mini-boss
 * move to the next chapter (counter, sink, stove, pantry, fridge), then everything mixes and keeps escalating.
 * Every fifth wave is a big one led by a mini-boss (a chapter boss at reduced health). Enemy health ramps after
 * `hpRampFrom`, gently at first and then steeply (the square term), so a strong player meets a hard wall around
 * waves 24-35 (roughly 9.5-14 minutes for the savvy bot, with either a Chili or a Rice Cooker hand). Top-tier defenders can
 * be polished for ever-rising Heat (`LevelDef.polish`), so a big Heat bank always has somewhere useful to go.
 */
/** `[first wave index it can appear, enemy id, threat cost, weight]` — the fallback pool after the themed run. */
export const ENDLESS_POOL: [from: number, enemy: string, cost: number, weight: number][] = [
  [0, 'ant', 1, 6],
  [2, 'fruitfly', 1.2, 2.5],
  [3, 'shieldant', 2.2, 3],
  [5, 'roach', 2.6, 3],
  [7, 'spore', 2.4, 2],
  [8, 'weevil', 2.8, 2],
  [9, 'slug', 4, 1.5],
  [11, 'moth', 2.2, 2],
  [16, 'mouse', 4.5, 1],
  [21, 'brute', 7, 1]
];
export const ENDLESS_TUNING = { baseBudget: 3, perWave: 1.4, perWaveSq: 0.06, bigMul: 1.4, hpRampFrom: 12, hpPerWave: 0.05, hpPerWaveSq: 0.005, gap: 24, themeLength: 5, miniBossHp: 0.1, miniBossHpPerWave: 0.02 };
export const THEME_LENGTH = ENDLESS_TUNING.themeLength;

const lanes = [0, 1, 2, 3, 4];
const rect = (c0: number, c1: number, ls: number[]): CellList => ls.flatMap(lane => Array.from({ length: c1 - c0 + 1 }, (_, i) => [c0 + i, lane] as [number, number]));

/** One per chapter, in walking order; the boss leads that stretch's big wave. */
export const ENDLESS_THEMES: { id: string; boss: string; pool: [enemy: string, cost: number, weight: number][]; modifier: ModifierDef | null }[] = [
  { id: 'countertop', boss: 'queen', modifier: null, pool: [['ant', 1, 6], ['fruitfly', 1.2, 2], ['shieldant', 2.2, 3], ['roach', 2.6, 2]] },
  {
    id: 'sink', boss: 'drainking', pool: [['ant', 1, 3], ['roach', 2.6, 3], ['weevil', 2.8, 3], ['slug', 4, 1.5], ['shieldant', 2.2, 2]],
    modifier: {
      id: 'wet-floor', name: { en: 'Wet Floor', zh: '地面湿滑' }, desc: { en: 'The near tiles are wet (no Burners there) and the tap is dripping.', zh: '靠近蛋糕的地砖湿了（放不了炉头），水龙头还在滴水。' },
      terrain: { wet: [...rect(0, 1, [0, 4]), [0, 2]] },
      hazards: [{ kind: 'drip', every: 7, first: 6, warn: 2.5, cells: [[4, 1], [5, 3], [3, 2], [6, 0], [4, 4], [6, 2]], push: 1.4, stun: 3 }]
    }
  },
  {
    id: 'stove', boss: 'greasegolem', pool: [['roach', 2.6, 3], ['moth', 2.2, 3], ['shieldant', 2.2, 2], ['slug', 4, 1.5], ['ant', 1, 2]],
    modifier: {
      id: 'hot-hobs', name: { en: 'Hot Hobs', zh: '灶眼全开' }, desc: { en: 'Hobs appear: Burners on them make double Heat, and they flare now and then.', zh: '出现了灶眼：炉头放上去火候翻倍，灶眼时不时会烧起来。' },
      terrain: { hobs: [[1, 1], [1, 3], [6, 1], [6, 3]], grease: rect(4, 5, [2]) },
      hazards: [{ kind: 'hob', every: 18, first: 10, warn: 3, lit: 5 }]
    }
  },
  {
    // Moths are rarer here than their weight elsewhere: in the blackout a hand without a Toaster cannot see them,
    // and a swarm eating every Burner was the main reason a strong run ended years early (around minute 6-8).
    id: 'pantry', boss: 'baron', pool: [['mouse', 4.5, 1.5], ['moth', 2.2, 1.2], ['weevil', 2.8, 2], ['slug', 4, 1.5], ['ant', 1, 2], ['spore', 2.4, 2]],
    modifier: {
      id: 'blackout', name: { en: 'Blackout', zh: '停电' }, desc: { en: 'The lights go out: guards only on lit cells, and shots cannot see into the dark.', zh: '灯灭了：守卫只能放在亮处，射击也看不见黑暗里的东西。' },
      terrain: { dark: true, lamps: [[0, 0], [0, 2], [0, 4], [4, 1], [4, 3], [7, 2]] }
    }
  },
  {
    id: 'fridge', boss: 'brute', pool: [['spore', 2.4, 3], ['brute', 7, 1.2], ['slug', 4, 1.5], ['roach', 2.6, 2], ['shieldant', 2.2, 2]],
    modifier: {
      id: 'deep-freeze', name: { en: 'Deep Freeze', zh: '深度冷冻' }, desc: { en: 'Frost on the far shelves and cold snaps: keep your guards warm.', zh: '远处的架子结霜，还有寒流：让守卫保持温暖。' },
      terrain: { frost: rect(3, 8, lanes) },
      hazards: [{ kind: 'coldSnap', every: 22, first: 15, warn: 3, stun: 3 }, { kind: 'moldSpread', every: 9, first: 12 }]
    }
  }
];
/** After the themed walk, these rotate every `themeLength` waves on top of the mixed pool. */
export const LATE_MODIFIERS: ModifierDef[] = [
  { id: 'fast-feet', name: { en: 'Fast Feet', zh: '飞毛腿' }, desc: { en: 'Everything runs a quarter faster.', zh: '所有敌人都快了四分之一。' }, enemySpeed: 1.25 },
  ...ENDLESS_THEMES.flatMap(theme => (theme.modifier ? [theme.modifier] : []))
];

export function endlessBudget(index: number): number {
  const t = ENDLESS_TUNING;
  return (t.baseBudget + index * t.perWave + index * index * t.perWaveSq) * ((index + 1) % 5 === 0 ? t.bigMul : 1);
}
export const endlessHp = (index: number): number => {
  const t = ENDLESS_TUNING, over = Math.max(0, index - t.hpRampFrom);
  return Math.round((1 + over * t.hpPerWave + over * over * t.hpPerWaveSq) * 100) / 100;
};

export function endlessWave(index: number, random: () => number): WaveDef {
  const t = ENDLESS_TUNING, big = (index + 1) % 5 === 0;
  const stretch = Math.floor(index / t.themeLength), themed = stretch < ENDLESS_THEMES.length;
  const theme = themed ? ENDLESS_THEMES[stretch] : null;
  const pool: [string, number, number][] = theme ? theme.pool : ENDLESS_POOL.filter(row => row[0] <= index).map(row => [row[1], row[2], row[3]]);
  const totalWeight = pool.reduce((sum, row) => sum + row[2], 0);
  const spawns: SpawnRow[] = [];
  let budget = endlessBudget(index), clock = 0;
  const span = big ? 16 : 12;
  // The mini-boss: the chapter boss of this stretch (later, a random one) at a fraction of its health.
  let miniBoss: string | null = null;
  if (big && index >= 4) {
    miniBoss = theme ? theme.boss : ['queen', 'drainking', 'greasegolem', 'baron', 'brute'][Math.floor(random() * 5) % 5];
    budget *= 0.6;
  }
  let guard = 0;
  while (budget >= 1 && guard++ < 300) {
    let roll = random() * totalWeight, pick = pool[0];
    for (const row of pool) { roll -= row[2]; if (roll <= 0) { pick = row; break; } }
    if (pick[1] > budget && pick[1] > 1) continue;
    // Cheap enemies arrive in small strings down one lane; expensive ones alone.
    const count = pick[1] <= 1.2 ? Math.min(Math.max(1, Math.floor(budget / pick[1])), 1 + Math.floor(random() * 3)) : 1;
    spawns.push([Math.round(clock * 10) / 10, pick[0], '*', count, 2.5]);
    budget -= pick[1] * count;
    clock = Math.min(span, clock + 0.6 + random() * (span / Math.max(4, index + 3)) * 2);
  }
  const wave: WaveDef = { after: index === 0 ? 20 : t.gap, big, spawns, hpMul: endlessHp(index) };
  if (miniBoss) {
    // Bosses are scaled separately: a mini-boss is a fraction of the chapter fight, growing with the night.
    const scale = Math.round((t.miniBossHp + index * t.miniBossHpPerWave) / Math.max(0.01, wave.hpMul ?? 1) * 100) / 100;
    wave.spawns.unshift([0, miniBoss, '*']);
    wave.bossScale = miniBoss === 'brute' ? 1 : scale;
  }
  if (index % t.themeLength === 0 && index > 0) {
    wave.modifier = theme ? theme.modifier ?? undefined : LATE_MODIFIERS[(stretch - ENDLESS_THEMES.length) % LATE_MODIFIERS.length];
  }
  return wave;
}
