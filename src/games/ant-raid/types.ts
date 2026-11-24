/**
 * Crumb Raiders data contract. Everything the sim, the bot, the renderer and the menus share.
 *
 * The yard is a 16 x 9 grid (`COLS` x `ROWS`); a cell index is `y * COLS + x`. Terrain is one character per cell in
 * `LevelDef.grid`:
 *   `.` grass (cover)   `b` blanket (exposed)   `s` sand (exposed)   `~` water   `#` wall / plate / rock
 *   `c` chalk line      `t` sticky tape         `o` antlion pit      `u` tunnel (cover)   `l` lily pad (water, holds food)
 *   `N` nest (on grass) `R` rival nest           any other letter is grass with a marker the level's lists refer to.
 *
 * The trail is a tree rooted at the nest: `trailParent[cell]` is the cell one step closer to the nest. Ants never
 * path-find; their route is the unique tree path between two trail cells.
 */
export const COLS = 16;
export const ROWS = 9;
export const CELLS = COLS * ROWS;

export type Lang = 'en' | 'zh';
export type Loc = { en: string; zh: string };

export type Terrain = 'grass' | 'blanket' | 'sand' | 'water' | 'wall' | 'chalk' | 'tape' | 'pit' | 'tunnel' | 'lily';

export type CasteId = 'worker' | 'soldier' | 'scout' | 'porter' | 'digger' | 'leafcutter' | 'bridger' | 'flyer' | 'spitter' | 'honeypot';
export type CasteDef = {
  id: CasteId;
  name: Loc;
  blurb: Loc;
  /** Sugar per card play. */
  cost: number;
  /** Ants hatched per play (stream cards hatch a brood). */
  brood: number;
  /** Card cooldown in seconds. */
  cooldown: number;
  /** Cells per second walking. */
  speed: number;
  /** Lifting power on a big item (Porter = 3). 0 = does not carry. */
  power: number;
  /** Crumbs per trip on a crumb pile. */
  bite: number;
  kind: 'stream' | 'post';
  /** Size class for predators that pick the biggest. */
  size: number;
  color: string;
  introduced: string;
};

export type FoodKind = 'cookie' | 'bread' | 'strawberry' | 'sugarcube' | 'cake' | 'melon' | 'icecream' | 'grape' | 'cheese' | 'marshmallow' | 'biscuit' | 'jam' | 'candy';
export type FoodDef = {
  id: string;
  kind: FoodKind;
  x: number; y: number;
  /** Crumbs on a pile, or the value of a big item when delivered. */
  crumbs: number;
  /** Big item: carriers (power) needed to lift. Absent = a crumb pile. */
  lift?: number;
  /** Melting: one crumb lost every `melt` seconds. */
  melt?: number;
  /** Hidden in fog until seen. */
  hidden?: boolean;
  /** Appears this many seconds into the level. */
  appear?: number;
};

export type HazardKind = 'spider' | 'sprinkler' | 'sunbeam' | 'toad' | 'sparrow' | 'mower' | 'lamp' | 'kingfisher' | 'rival';
export type HazardDef = {
  kind: HazardKind;
  x: number; y: number;
  /** Free parameters per kind (radius, period, path...). */
  params?: Record<string, number | number[] | string>;
  /** Arrives this many seconds into the level. */
  at?: number;
};

export type GoalDef =
  | { kind: 'crumbs'; n: number }
  | { kind: 'item'; food: string; n?: number }
  | { kind: 'defend'; n: number; hp: number }
  | { kind: 'race'; n: number; hp?: number };

export type BonusDef =
  | { kind: 'maxLost'; n: number }
  | { kind: 'noAlarm' }
  | { kind: 'scent'; n: number }
  | { kind: 'crumbs'; n: number }
  | { kind: 'maxScatter'; n: number }
  | { kind: 'noCaste'; caste: CasteId }
  | { kind: 'hp'; n: number }
  | { kind: 'cut' };

export type LevelType = 'haul' | 'heist' | 'stealth' | 'rush' | 'puzzle' | 'defense' | 'night' | 'boss' | 'endless';

/** One scripted coach mark. `until` ends it: a sim event, a time, or a count. */
export type TutorialStep = {
  text: Loc;
  /** Highlight these cells (a suggested trail is drawn as ghost dots). */
  cells?: [number, number][];
  /** Highlight a HUD element: a card caste, a queen call, `eraser` or `goal`. */
  ui?: string;
  until: { event: SimEvent['type']; n?: number; caste?: CasteId } | { time: number };
};

export type LevelDef = {
  id: string;
  chapter: number;
  index: number;
  name: Loc;
  blurb: Loc;
  type: LevelType;
  grid: string[];
  nest: [number, number];
  foods: FoodDef[];
  hazards: HazardDef[];
  /** Scent budget (trail cells). */
  scent: number;
  startSugar: number;
  /** Fixed hand (lessons). Absent = the player's loadout. */
  cards?: CasteId[];
  /** Castes always added to a loadout hand for this level. */
  required?: CasteId[];
  slots?: number;
  /** Seconds until sundown. */
  sundown: number;
  /** Par time for the third star. */
  par: number;
  goal: GoalDef;
  bonus: BonusDef;
  introduces: Loc;
  /** Alarm meter and the Shoe. */
  alarm?: boolean;
  /** Fog of war. */
  night?: boolean;
  /** Puzzle levels: fixed ants, no hatching. */
  fixedAnts?: Partial<Record<CasteId, number>>;
  /** Passive sugar per second (default 1). */
  trickle?: number;
  boss?: string;
  tutorial?: TutorialStep[];
  intro?: string;
  outro?: string;
  music?: string;
  /** Endless / daily generator settings. */
  endless?: { daily: boolean };
};

export type AntState = 'out' | 'home' | 'lost' | 'post' | 'lift' | 'idle' | 'fly';
export type Ant = {
  id: number;
  caste: CasteId;
  x: number; y: number;
  /** Cell last reached and cell walking to (trail ants). */
  at: number; to: number;
  state: AntState;
  /** Food index for jobs, -1 none. */
  job: number;
  /** Destination cell for out / post. */
  goal: number;
  /** Crumbs carried. */
  load: number;
  hp: number;
  /** Seconds of work at the current spot (bite, dig, post timers). */
  work: number;
  /** Lost: seconds left milling about before walking back. */
  lostT: number;
  /** Heading in radians, for drawing. */
  dir: number;
  /** Post cell for post castes. */
  post: number;
  /** For lifted ants: slot angle around the item. */
  slot: number;
  /** Seconds of heat on a sunbeam. */
  heat: number;
  /** Seconds spent on sliding sand beside an antlion pit. */
  slip: number;
  alive: boolean;
};

export type Food = FoodDef & {
  index: number;
  left: number;
  claims: number;
  priority: 0 | 1 | 2;
  /** Big item position. */
  px: number; py: number;
  at: number; to: number;
  moving: boolean;
  home: boolean;
  power: number;
  visible: boolean;
  meltT: number;
  /** Seconds a big item is knocked loose and cannot move. */
  stun: number;
  /** Items fixed to a lily pad cannot be reached by trail. */
  floating: boolean;
};

export type Hazard = HazardDef & {
  id: number;
  active: boolean;
  /** Generic timers / state, per kind. */
  t: number; phase: number; cd: number; angle: number; hp: number;
  /** Target cells of a telegraphed strike. */
  cells: number[];
  warn: number;
  /** Position for moving hazards (sunbeam, mower). */
  px: number; py: number;
  dir: number;
  count: number;
  speed: number;
};

export type Rival = { id: number; x: number; y: number; path: number[]; i: number; load: number; state: 'out' | 'home' | 'raid'; hp: number; dir: number; alive: boolean; route: number };

export type Card = { caste: CasteId; cooldown: number; stock: number };

export type SimEvent =
  | { type: 'paint'; cell: number }
  | { type: 'erase'; cells: number[]; refund: number }
  | { type: 'connect'; food: number }
  | { type: 'hatch'; caste: CasteId; n: number }
  | { type: 'spawn'; caste: CasteId; id: number }
  | { type: 'bite'; food: number; x: number; y: number }
  | { type: 'deliver'; n: number; total: number; x: number; y: number; big?: boolean }
  | { type: 'lift'; food: number }
  | { type: 'drop'; food: number }
  | { type: 'empty'; food: number }
  | { type: 'death'; caste: CasteId; x: number; y: number; cause: string }
  | { type: 'lost'; n: number }
  | { type: 'alarm'; level: number }
  | { type: 'alert' }
  | { type: 'warn'; kind: string; cells: number[]; x: number; y: number; time: number }
  | { type: 'strike'; kind: string; cells: number[]; x: number; y: number; hits: number }
  | { type: 'washed'; cells: number[] }
  | { type: 'dig'; cell: number }
  | { type: 'bridge'; cell: number; up: boolean }
  | { type: 'tape'; cell: number }
  | { type: 'lamp'; on: boolean }
  | { type: 'reveal'; cells: number[] }
  | { type: 'post'; caste: CasteId; cell: number }
  | { type: 'queen'; call: QueenCall }
  | { type: 'rival'; what: 'spawn' | 'steal' | 'raid' | 'cut' | 'killed'; x: number; y: number }
  | { type: 'nest'; hp: number }
  | { type: 'boss'; what: string }
  | { type: 'phase'; n: number }
  | { type: 'modifier'; id: string }
  | { type: 'priority'; food: number; priority: number }
  | { type: 'deny'; reason: DenyReason }
  | { type: 'end'; won: boolean };

export type QueenCall = 'scatter' | 'rally' | 'recall';
export type DenyReason = 'scent' | 'adjacent' | 'terrain' | 'sugar' | 'cooldown' | 'cap' | 'target' | 'fog' | 'nothing' | 'ended' | 'nest' | 'nohatch';

export type MetaState = { scent: number; hatch: number; sugar: number; queen: number; slot: number };

export type SimOptions = {
  random: () => number;
  /** Cards in hand (ignored when the level has a fixed hand). */
  loadout?: CasteId[];
  meta?: Partial<MetaState>;
  /** Failed attempts on this boss (0..2): bosses get milder. */
  mercy?: number;
  /** Ant cap. */
  cap?: number;
};

export type Stats = { hatched: number; lost: number; scatters: number; maxAlarmHits: number; scentPeak: number; crumbs: number; casteUsed: CasteId[]; cutWin: boolean; bites: number };

export type Sim = {
  level: LevelDef;
  random: () => number;
  terrain: Terrain[];
  /** Cell is visible (fog levels; all true otherwise). */
  seen: Uint8Array;
  /** Bridgers standing in a water cell; >= BRIDGE_NEED makes it a bridge. */
  bridge: Int8Array;
  /** Bridge raised (crossable). */
  bridged: Uint8Array;
  /** Sticky tape: ants still needed to stick before it is crossable, and acid left. */
  tapeNeed: Int16Array;
  tapeAcid: Float32Array;
  /** Dig progress for chalk / sand. */
  dug: Float32Array;
  /** -1 not trail, -2 root (nest), else parent cell. */
  trailParent: Int16Array;
  trailCount: number;
  trailVersion: number;
  /** Ant traffic per cell (decays), for drawing. */
  traffic: Float32Array;
  nest: number;
  scent: number;
  scentMax: number;
  sugar: number;
  crumbs: number;
  ants: Ant[];
  nextAntId: number;
  foods: Food[];
  hazards: Hazard[];
  rivals: Rival[];
  rivalCrumbs: number;
  /** Rival trails (cell lists from rival nest outward) and whether each is cut. */
  rivalRoutes: { cells: number[]; cut: boolean; food: number }[];
  nestHp: number;
  cards: Card[];
  queue: { caste: CasteId; post: number }[];
  hatchT: number;
  hatchTime: number;
  alarm: number;
  /** Shoe alert: stomps left, timer to the next. */
  shoe: { left: number; t: number; cells: number[]; warn: number; x: number; y: number; first: boolean };
  queen: Record<QueenCall, { cd: number; max: number; active: number }>;
  time: number;
  sundown: number;
  status: 'playing' | 'won' | 'lost';
  events: SimEvent[];
  stats: Stats;
  cap: number;
  mercy: number;
  speedMul: number;
  modifiers: string[];
  /** Endless state. */
  endless: { next: number; wave: number; extend: number; respawn: number } | null;
  /** Honeypot stores: cell -> crumbs waiting, and a chain timer. */
  stores: { cell: number; crumbs: number; t: number; ant: number }[];
  meta: MetaState;
};
