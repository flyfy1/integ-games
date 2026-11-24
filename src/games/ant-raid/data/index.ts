import type { LevelDef } from '../types';
import { CHAPTERS } from './campaign';
import { LEVELS } from './levels';

export { CASTES, CASTE_ORDER, STARTING_CASTES } from './castes';
export { CHAPTERS, type ChapterDef } from './campaign';
export { META_UPGRADES, CRYSTALS, type MetaUpgradeDef } from './meta';
export { LEVELS } from './levels';
export { makeEndlessLevel, ENDLESS_ID, DAILY_ID, DAILY_HAND, MODIFIERS } from './endless';

export const LEVEL_LIST: LevelDef[] = CHAPTERS.flatMap(chapter => chapter.levels).map(id => LEVELS.find(level => level.id === id)).filter((level): level is LevelDef => !!level);
export const levelById = (id: string): LevelDef | undefined => LEVELS.find(level => level.id === id);
export function nextLevelId(id: string): string | undefined {
  const index = LEVEL_LIST.findIndex(level => level.id === id);
  return index >= 0 ? LEVEL_LIST[index + 1]?.id : undefined;
}
/** Endless opens after the chapter-1 boss. */
export const ENDLESS_UNLOCK = '1-5';
