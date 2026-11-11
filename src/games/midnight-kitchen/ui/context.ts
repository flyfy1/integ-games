import type { Audio } from '../audio';
import type { I18n, Lang } from '../i18n';
import type { Reward, Save, Settings } from '../save';
import type { LevelDef, SimStats } from '../types';

/**
 * What a menu screen gets: the save to read, strings, and the handful of actions it may trigger. Screens are plain
 * functions `(ui, params) => HTMLElement`; they never touch the sim, the canvas or storage directly.
 * To add a screen: write the function, add its name to `ScreenName`, and register it in `ui/index.ts`.
 */
export type ScreenName = 'title' | 'map' | 'loadout' | 'cookbook' | 'shop' | 'settings' | 'results' | 'pause';

export type ResultsData = {
  level: LevelDef; won: boolean; flags: { win: boolean; flawless: boolean; bonus: boolean };
  reward: Reward; time: number; kills: number; score: number; wave: number; nextLevel: string | null; endlessUnlocked: boolean;
  /** Full run statistics (Heat spent, recipes, ...). Optional so older callers and tests still type-check. */
  stats?: SimStats;
  /** Chapter number that this win opened for the first time, if any. */
  chapterOpened?: number | null;
};
export type ScreenParams = { level?: string; results?: ResultsData; from?: ScreenName; tab?: string; chapter?: number; panel?: string };

export type UiContext = {
  i18n: I18n;
  save: Save;
  audio: Audio;
  /** Effective reduced-motion (the arcade setting or the in-game switch). */
  reduced: boolean;
  /** True while a level is running behind the current screen (pause menu). */
  readonly inLevel: boolean;
  /** Show a screen (replaces the current one). */
  go(screen: ScreenName, params?: ScreenParams): void;
  /** Level chosen on the map: plays its intro scene the first time, then opens the loadout (or the level). */
  openLevel(levelId: string): void;
  /** Loadout confirmed: start playing. */
  startNight(levelId: string, loadout: string[]): void;
  /** Leave the results screen for the next step (outro scene, then map or next level). */
  afterResults(results: ResultsData, choice: 'next' | 'retry' | 'map' | 'endless'): void;
  resume(): void;
  retry(): void;
  quitToMap(): void;
  setLang(lang: Lang): void;
  resetProgress(): void;
  buy(upgradeId: string): boolean;
  /** Refund every permanent upgrade; returns the crumbs given back. */
  respec(): number;
  /** Change a preference (volumes apply live; reduced effects re-create the renderer). */
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  /** Turn coach marks on or off; `reset` shows every tip again. */
  setTips(on: boolean, reset?: boolean): void;
  /** Replay a story scene from the Cookbook, then come back to `then`. */
  replayScene(sceneId: string, then: ScreenName, params?: ScreenParams): void;
  /** Remember a one-off flag (a chapter's "new" ribbon was seen, ...). */
  markSeen(id: string): void;
};
export type Screen = (ui: UiContext, params: ScreenParams) => HTMLElement;
