import { dailyKey, dailyRandom } from '../../_shared/daily';
import type { LevelDef, ModifierDef, WaveDef } from '../types';
import { DEFENDERS } from './defenders';
import { endlessWave, LATE_MODIFIERS, THEME_LENGTH } from './endless';
import { ENDLESS_LEVEL, registerLevels } from './levels';

/**
 * Daily Night / 每日一夜: one seeded Endless per calendar date, the same for everyone. The date picks a fixed hand of
 * seven cards and two board rules that take turns every few waves from the first one; the waves come from their own
 * date-seeded stream, so what a player does on the counter never changes which pests arrive. No upgrades apply.
 */
export const DAILY_SLUG = 'midnight-kitchen';
export const DAILY_ID = 'daily';
export const DAILY_HAND = 7;
/** Guards that can hit a fruit fly (one of these is always in the hand). */
const FLYER_GUARDS = ['pepper', 'salt', 'toaster', 'ice'];

export type DailyPlan = { key: string; cards: string[]; modifiers: [ModifierDef, ModifierDef] };

const take = <T>(list: T[], random: () => number): T => list.splice(Math.floor(random() * list.length) % list.length, 1)[0];

/** The date's hand and rules (pure: the same key always gives the same plan). */
export function dailyPlan(key: string = dailyKey()): DailyPlan {
  const random = dailyRandom(DAILY_SLUG, `${key}:plan`);
  const rest = Object.keys(DEFENDERS).filter(id => id !== 'burner');
  const cards = ['burner', take(rest.filter(id => FLYER_GUARDS.includes(id)), random)];
  const pool = rest.filter(id => !cards.includes(id));
  while (cards.length < DAILY_HAND && pool.length) cards.push(take(pool, random));
  const rules = [...LATE_MODIFIERS];
  return { key, cards, modifiers: [take(rules, random), take(rules, random)] };
}

/** The date's night as a level: Endless's ramp, the date's hand, the date's two rules. */
export function dailyLevel(key: string = dailyKey()): LevelDef {
  const plan = dailyPlan(key), waveRandom = dailyRandom(DAILY_SLUG, `${key}:waves`), waves: WaveDef[] = [];
  const waveGen = (index: number): WaveDef => {
    while (waves.length <= index) {
      const i = waves.length, wave = endlessWave(i, waveRandom);
      // The two rules take turns, starting with the very first wave.
      if (i % THEME_LENGTH === 0) wave.modifier = plan.modifiers[(i / THEME_LENGTH) % 2];
      else delete wave.modifier;
      waves.push(wave);
    }
    return waves[index];
  };
  const level: LevelDef = {
    ...ENDLESS_LEVEL, id: DAILY_ID, cards: plan.cards, slots: plan.cards.length, waveGen,
    name: { en: 'Daily Night', zh: '每日一夜' },
    blurb: { en: 'The same night for everyone today. Fixed hand, two house rules, no upgrades.', zh: '今天大家打的都是同一夜。固定手牌，两条规矩，不算升级。' }
  };
  registerLevels([level]);
  return level;
}
