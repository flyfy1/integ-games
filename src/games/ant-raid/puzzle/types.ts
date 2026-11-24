import type { FoodKind, Loc } from '../types';

/**
 * Crumb Raiders puzzle mode: the data contract shared by the deterministic sim (`sim.ts`), the levels, the renderer
 * and the shell. The yard is the same 16 x 9 grid as the old campaign (cell = y * 16 + x), nest on the left.
 *
 * Terrain, one character per cell in `PuzzleLevel.grid`:
 *   `.` grass   `#` wall / plate / rock   `~` water (R7: the trail may cross it; three ants become a bridge)
 *   `c` chalk (blocks the trail; a Digger token tunnels through it)   `o` / `O` a pair of twin holes (R10)
 *   `t` sticky tape (R12: the first ant to step on it sticks there)
 * Foods, spiders, toads and the nest are listed in the level data, not in the grid.
 */
export const PCOLS = 16;
export const PROWS = 9;
export const PCELLS = PCOLS * PROWS;

/** Fixed ticks: every speed in the run is a whole number of ticks, so a plan always plays out identically. */
export const TPS = 120;
/** Ticks per cell walking (8 cells / s), between departures (0.10 s), biting (0.15 s), per cell carrying a big item (5 cells / s). */
export const WALK = 15;
export const GAP = 12;
export const BITE = 18;
export const CARRY = 24;
/** Ants that link into a living bridge on one water cell. */
export const BRIDGE = 3;
/** Hard stop for a run that somehow never resolves (60 s). */
export const MAX_TICKS = TPS * 60;

export type PTerrain = 'grass' | 'wall' | 'water' | 'chalk' | 'dug' | 'hole' | 'tape';
export type RuleId = 'trail' | 'scent' | 'fork' | 'order' | 'spider' | 'big' | 'bridge' | 'digger' | 'porter' | 'holes' | 'toad' | 'tape';
export type AntKind = 'w' | 'p';

export type PFood = {
  id: string;
  kind: FoodKind;
  x: number; y: number;
  /** Crumbs on a pile (one per worker trip). Ignored for big items. */
  crumbs: number;
  /** Big item: ant power needed on it at once to lift it (a Porter counts as 2). */
  lift?: number;
};
/** Spider: eats the first `eat` ants that step into its ring (cells within `r`, Chebyshev), then it is full. */
export type PSpider = { x: number; y: number; eat?: number; r?: number };
/** Toad: sleeps through the first `sleep` ants that step into its reach, then eats every ant that steps in. */
export type PToad = { x: number; y: number; sleep: number; r?: number };

export type PGoal = { crumbs: number; items: string[] };

/** A plan: drags (each starts on the nest or an existing trail cell), then Digger tokens. Used for reference plans. */
export type PlanScript = { paths: [number, number][][]; digs?: [number, number][] };

export type PuzzleLevel = {
  id: string;
  chapter: number;
  index: number;
  name: Loc;
  grid: string[];
  nest: [number, number];
  /** Ants in leaving order: `w` worker, `p` Porter. */
  squad: string;
  foods: PFood[];
  spiders?: PSpider[];
  toads?: PToad[];
  /** Scent budget in trail cells; null = unlimited (1-1). */
  scent: number | null;
  /** Elegant-route star: clear using at most this much Scent (only where the budget is above the minimum winning cost). */
  par?: number;
  goal: PGoal;
  /** Digger tokens in the tray. */
  diggers?: number;
  /** Rule cards that open with this level (new rules only). */
  rules: RuleId[];
  /** Reference plan: wins, used by tests, the hint and the art capture. */
  solution: PlanScript;
  /** Plans a newcomer is likely to try first. Each one must fail: undrawable within the budget, or loses the run.
   *  `wins` marks a documented alternative that clears the level but misses the par star. */
  traps: { name: string; plan: PlanScript; wins?: boolean }[];
  /** Story scene played once after the first clear. */
  outro?: string;
};
