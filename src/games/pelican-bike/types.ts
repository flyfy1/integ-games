export type Item = { type: 'fish' | 'star'; x: number; y: number; ph: number; got: boolean };
export type Enemy = {
  type: 'crab' | 'gull' | 'jelly';
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  dir: number;
  dead: boolean;
  t: number;
  baseX?: number;
  baseY?: number;
  state?: 'wait' | 'jump';
};
export type Mover = { x: number; y: number; ox: number; oy: number; w: number; h: number; dx: number; dy: number; sp: number; t: number; vx: number; vy: number; pool?: number };
/** A crumbling block, or (kind 'pier') a rickety one-way pier plank that collapses in a chain once touched. */
export type Crumble = { r: number; c: number; x: number; y: number; state: number; t: number; kind?: 'pier' };
/** Rising air above a vent grate: holding the button inside it lifts a gliding pelican. */
export type Vent = { x: number; w: number; y: number; top: number };
/** A tide pool: its water level swings between `lo` (floor showing) and `hi` (brim) on the shared tide cycle. */
export type Pool = { x0: number; x1: number; hi: number; lo: number; ph: number };
/** A gust lane: on part of the shared cycle it shoves the rider in `dir` (stronger in the air, strongest gliding). */
export type Gust = { x0: number; x1: number; dir: number; ph: number };
export type Spring = { x: number; y: number; w: number; h: number; comp: number };
export type Checkpoint = { x: number; y: number; w: number; h: number; active: boolean };
export type Goal = { x: number; y: number };
export type Particle = { x: number; y: number; vx: number; vy: number; g: number; sz: number; col: string; t: number; d: number };
export type Popup = { x: number; y: number; vy: number; txt: string; col: string; sz: number; t: number; d: number };
