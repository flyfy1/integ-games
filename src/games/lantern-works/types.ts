/**
 * Lantern Works: shared types. The simulation, data tables, renderer and menus agree on these. No DOM, no drawing.
 *
 * Board: a grid of at most 10 x 8 cells, x to the right, y down. Directions are 0 = east, 1 = south, 2 = west,
 * 3 = north. Time is counted in beats: on every beat each item moves at most one cell, and every machine that works
 * on that beat plays one note (the factory's tune).
 */
export type Loc = { en: string; zh: string };
export type Dir = 0 | 1 | 2 | 3;

export type Color = 'plain' | 'red' | 'yellow' | 'blue' | 'orange' | 'green' | 'purple' | 'muddy';
export type Shape = 'round' | 'square' | 'lotus';
export type Stamp = 'none' | 'fish' | 'cloud' | 'fu';
export type GoodKind = 'paper' | 'shell' | 'hoop' | 'candle' | 'dye' | 'lantern' | 'string';

/** One thing riding the belts. `heading` is the direction it last travelled (bridges keep it going straight). */
export type Item = {
  id: number;
  kind: GoodKind;
  shape?: Shape;
  color?: Color;
  stamp?: Stamp;
  lit?: boolean;
  /** Bundled string: the lantern colours in the order they were tied. */
  seq?: Color[];
  heading: Dir;
  /** Beats this item has wanted to move and could not (a jam shows after a few). */
  still: number;
};

/** A good without identity, as written in level data: "lantern red round lit", "dye blue", "string red orange yellow". */
export type Good = Omit<Item, 'id' | 'heading' | 'still'>;

export type PartKind =
  | 'belt' | 'folder' | 'vat' | 'joiner' | 'splitter' | 'mixer' | 'sorter' | 'bin' | 'bridge' | 'wick' | 'gate' | 'stamp' | 'bundler';

/** A placed part. `dial` is the setting (shape, colour, filter, beats, pattern). `flip` mirrors a sorter's turn side. */
export type Part = { kind: PartKind; x: number; y: number; dir: Dir; dial?: string; flip?: boolean; fixed?: boolean };

export type SourceDef = {
  x: number; y: number; dir: Dir;
  /** Goods emitted in turn (one string per emission, cycled). */
  goods: string[];
  /** Beats between emissions, and the first beat (default 1). */
  every: number;
  offset?: number;
};

export type Want = { good: string; n: number };
export type StallDef = {
  x: number; y: number;
  wants: Want[];
  /** Wants are served one after the other (a change of plan); otherwise all at once. */
  sequential?: boolean;
};

/** Inspector Mittens: sits on `cell` from beat `at` for `for` beats, repeating every `period` beats. */
export type CatStop = { x: number; y: number; at: number; for: number };
export type CatDef = { period: number; stops: CatStop[] };

export type LevelDef = {
  id: string;
  chapter: number;
  index: number;
  name: Loc;
  hint: Loc;
  /** Rows of '.' (floor) and '#' (pillar). Sources and stalls are placed by coordinates and must sit on floor. */
  grid: string[];
  sources: SourceDef[];
  stalls: StallDef[];
  fixed?: Omit<Part, 'fixed'>[];
  tray: Partial<Record<PartKind, number>>;
  parTidy: number;
  parSwift: number;
  introduces: PartKind | null;
  /** Fixed colours a dye vat can be set to without being fed dye. */
  vatColors?: Color[];
  cat?: CatDef;
  rush?: boolean;
  /** Night Shift: orders arrive from a seeded queue instead of the stalls' fixed wants. */
  endless?: boolean;
};

export type ChapterDef = { id: number; name: Loc; blurb: Loc; levels: string[] };

/** One change to the build. Every edit (UI, undo, saved builds, stored solutions) goes through `applyEdit`. */
export type Edit =
  | { op: 'place'; kind: PartKind; x: number; y: number; dir: Dir; dial?: string; flip?: boolean }
  | { op: 'remove'; x: number; y: number }
  | { op: 'rotate'; x: number; y: number }
  | { op: 'dial'; x: number; y: number; value?: string };

export type EditFail = 'blocked' | 'fixed' | 'empty' | 'none-left' | 'not-in-tray' | 'no-dial' | 'bad-dial';

export type SimEvent =
  | { type: 'emit'; x: number; y: number; item: Item }
  | { type: 'work'; part: PartKind; x: number; y: number; item: Item; dial?: string }
  | { type: 'route'; part: PartKind; x: number; y: number; side: Dir }
  | { type: 'deliver'; x: number; y: number; item: Item; stall: number; extra: boolean }
  | { type: 'wrong'; x: number; y: number; item: Item; stall: number }
  | { type: 'bin'; x: number; y: number; item: Item }
  | { type: 'lost'; x: number; y: number; item: Item }
  | { type: 'orderNew'; order: Order }
  | { type: 'orderDone'; order: Order; stall: number }
  | { type: 'orderExpired'; order: Order }
  | { type: 'won'; beat: number }
  | { type: 'spoiled'; beat: number }
  | { type: 'shiftOver'; beat: number; score: number }
  | { type: 'catSit'; x: number; y: number }
  | { type: 'jam'; x: number; y: number };

/** Night Shift order on the queue. */
export type Order = { id: number; good: string; n: number; got: number; born: number; patience: number; stall: number; value: number };
