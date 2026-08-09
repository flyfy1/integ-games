/** Shared, intentionally small boundary between the arcade shell and games. */
export type GameCategory = 'puzzle' | 'arcade' | 'action' | 'cards-logic';

export type GameMeta = {
  slug: string;
  title: string;
  category: GameCategory;
  description: string;
  instructions: string;
  accent: string;
  mechanic: string;
};

export type GameStorage = {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
};

export type GameSound = {
  play(kind: 'tap' | 'merge' | 'success' | 'fail' | 'move'): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
};

export type GameServices = {
  storage: GameStorage;
  sound: GameSound;
  random: () => number;
  reportScore(score: number): void;
  reportComplete(progress?: number): void;
  isReducedMotion: boolean;
};

export type GameController = {
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
};

export type GameModule = {
  meta: GameMeta;
  mount(host: HTMLElement, services: GameServices): GameController;
};

export type GameModuleLoader = () => Promise<{ default: GameModule }>;
