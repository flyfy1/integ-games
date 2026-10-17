export interface Solid { x: number; y: number; w: number; h: number; kind: string; oneway?: boolean }
export interface Zone { id: string; name: string; sub: string; chapter: string; start: number; end: number; music?: string; pit?: string; fog?: string; grade?: string; ambient?: number; hotAsh?: boolean; palette?: string[] }
export interface Flood { speeds: number[]; baseline: number; startGrace: number; checkpointGrace: number; exitGrace: number; damage: number; warning: number; lockOffset: number }
export interface Upgrade { checkpoint: number; id: string; title: string; sub: string; detail: string }
export interface LevelDefinition {
  id: number; numeral: string; title: string; descriptor: string;
  terrain: 'descent' | 'ascent' | 'raised-descent';
  flood: Flood | null; upgrades: Upgrade[]; enemyHpMultiplier: number; containDrones: boolean;
  artBuilder(seed: number): Record<string, unknown>; buildSeed: number;
  visuals: { pits: 'original' | 'storm' | 'aftermath'; fog: string[]; grade: string[]; ambient: number[]; ember: string };
  completion: { title: string; sub?: string; bridge?: string };
  BOSS: { variant: 'warden' | 'tempest' | 'reforged'; armor: number; hp: number; w: number; h: number; name: string; unbound: string; bar2: string; sub: string; sub2: string };
  WORLD_END: number; ARENA: { left: number; right: number; trigger: number; floor?: number };
  ZONES: Zone[]; zoneIndexAt(x: number): number; buildSolids(): Solid[]; floorAt?(x: number): number;
  PITS: { x: number; w: number; zone: number }[];
  ENEMIES: [string, number][]; MEDKITS: [number, number][]; CHECKPOINTS: number[];
  LIGHTS: { x: number; y: number; r: number; c: number[]; f: number; kind: string; tint?: string }[];
  PROPS: [string, number][];
  AMBUSHES: { x: number; l: number; r: number; wave: [string, number][] }[];
}
export const LEVELS: LevelDefinition[];
export function levelFromParam(value: string | null): LevelDefinition;
export function nextLevel(level: LevelDefinition): LevelDefinition | null;
