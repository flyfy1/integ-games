interface StorageAdapter { get(key: string, fallback: any): any; set?(key: string, value: any): void }
export type Targets = { gold: number; silver: number; bronze: number };
export type Records = { times: Record<string, number>; rush: Record<string, number>; marks: Record<string, string[]> };
export const MODES: Record<'campaign' | 'time' | 'rush', [string, string]>;
export const MUTATORS: Record<'none' | 'glass' | 'double' | 'noshot', [string, string]>;
export const MARKS: Record<'glass' | 'double' | 'noshot', string>;
export const MEDALS: [string, string][];
export const MEDAL_ICON: string[];
export function stageTargets(id: number): Targets;
export function rushTargets(ids: number[]): Targets;
export function medalFor(time: number, t: Targets): number;
export function loadRecords(storage: StorageAdapter, difficulty: string): Records;
export function recordTime(storage: StorageAdapter, difficulty: string, kind: 'time' | 'rush', slot: number, time: number): { best: number; prev: number | null; improved: boolean; saved: boolean };
export function recordMark(storage: StorageAdapter, difficulty: string, id: number, mutator: string): { marks: string[]; fresh: boolean; saved: boolean };
