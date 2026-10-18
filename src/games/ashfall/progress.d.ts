interface StorageAdapter { get(key: string, fallback: any): any; set?(key: string, value: any): void }
export interface ResumeRecord { version: 3; difficulty: string; level: number; start: number; reward: string | null; run: { score: number; kills: number; deaths: number; playT: number; reported: boolean; forge: Record<string, number>; results: Array<{ id: number; numeral: string; time: number; kills: number; falls: number; score: number; rank: string }> } }
export function readStorage<T>(storage: StorageAdapter, key: string, fallback: T): T;
export function writeStorage(storage: StorageAdapter, key: string, value: unknown): boolean;
export function loadProgress(storage: StorageAdapter, difficulty?: string): Set<number>;
export function saveProgress(storage: StorageAdapter, difficulty: string, cleared: Set<number>): boolean;
export function loadBest(storage: StorageAdapter, startId: number, difficulty?: string): number;
export function saveBest(storage: StorageAdapter, startId: number, score: number, difficulty?: string): {best: number; saved: boolean};
export function loadResume(storage: StorageAdapter, difficulty: string): ResumeRecord | null;
export function saveResume(storage: StorageAdapter, difficulty: string, value: ResumeRecord | null): boolean;
