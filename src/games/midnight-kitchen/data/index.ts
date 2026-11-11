import type { Content } from '../types';
import { DEFENDERS } from './defenders';
import { ENEMIES } from './enemies';
import { META_UPGRADES } from './meta';
import { RECIPES } from './recipes';

/** The shipped content tables, bundled for the sim. Tests may pass their own `Content` to `createSim`. */
export const CONTENT: Content = { defenders: DEFENDERS, enemies: ENEMIES, recipes: RECIPES, meta: META_UPGRADES };

export { DEFENDERS, DEFENDER_LIST, STARTING_DEFENDERS } from './defenders';
export { ENEMIES, ENEMY_LIST } from './enemies';
export { RECIPES } from './recipes';
export { META_UPGRADES } from './meta';
export { CHAPTERS, ENDLESS_LEVEL, ENDLESS_UNLOCK, LEVELS, LEVEL_LIST, UPCOMING_CHAPTERS, levelById, nextLevelId, ownedAt } from './levels';
export { endlessWave } from './endless';
