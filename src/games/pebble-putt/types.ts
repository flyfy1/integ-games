/** Pebble Putt data shapes: holes are plain data, compiled by `physics.ts` and drawn by `gl.ts`. */
export type Pt = readonly [number, number];
export type Loc = { en: string; zh: string };

export type Slope =
  /** A tilt of the whole hole: h += ax·x + ay·y. */
  | { kind: 'plane'; ax: number; ay: number }
  /** A Gaussian dune (a > 0) or hollow (a < 0), optionally rotated by `rot` radians. */
  | { kind: 'bump'; x: number; y: number; sx: number; sy: number; a: number; rot?: number; cos?: number; sin?: number }
  /** A smooth terrace edge: the height rises by `a` across a band of half-width `w` along the normal (nx, ny). */
  | { kind: 'step'; x: number; y: number; nx: number; ny: number; w: number; a: number };

export type Stone = { x: number; y: number; r: number; spring?: boolean };
export type Gate = { a: Pt; b: Pt; period: number; open: number; phase?: number };
export type Pipe = { a: Pt; b: Pt; out: number };
export type Zone = { kind: 'gravel' | 'moss'; poly: Pt[] };
export type Fence = { r: number; mouth: number; w: number };
export type Shot = { angle: number; power: number; at?: number };

export type Hole = {
  id: number;
  name: Loc;
  /** Three words or fewer, shown when the hole opens: the one new idea. */
  caption: Loc;
  par: number;
  tee: Pt;
  cup: Pt;
  /** Playable area for framing and the ground mesh (x0, y0, x1, y1). */
  bounds: readonly [number, number, number, number];
  walls: Pt[][];
  slopes: Slope[];
  stones?: Stone[];
  water?: Pt[][];
  zones?: Zone[];
  gates?: Gate[];
  pipes?: Pipe[];
  /**
   * A low bamboo edging round the cup with one mouth: `mouth` is the direction (degrees) the opening faces, `w` the
   * gap between the edging's ends. It keeps the back board from catching near-misses, so an ace has to thread the mouth.
   */
  fence?: Fence;
  /** Decoration only: lanterns, maples, bamboo clumps, raked islands. */
  decor?: { kind: 'lantern' | 'maple' | 'bamboo' | 'pine' | 'rock'; x: number; y: number; s?: number }[];
  /** The proven routes (found by scripts/pebble-putt-search.ts, replayed by the tests). */
  ace: Shot;
  parRoute: Shot[];
};
