import type { Ablation } from './rules';

export type Loc = { en: string; zh: string };
/** The picture beside a level's one-line lesson. */
export type Icon = 'bell' | 'wood' | 'drift' | 'float' | 'tides' | 'up' | 'down' | 'high' | 'castle' | 'highcastle' | 'current' | 'ride' | 'flag';
export type LevelDef = {
  id: string; name: Loc;
  /** Grid, see the legend in rules.ts. */
  rows: string[];
  tide: number;
  /** True shortest solution length (the tests check it against the solver). */
  par: number;
  /** One stored shortest solution, replayed by the tests and the browser bot. */
  solution: string;
  /** The level's lesson: one picture and at most twelve words. */
  idea: Loc; icon: Icon;
  /** Turning these off makes the level unsolvable or longer: the new idea is required. */
  ablate: Ablation[];
  /** The obvious wrong plan: it ends blocked or somewhere the flag can no longer be reached. */
  trap: string;
  /** Tile [x, y] the ghost hand points at the first time this level is played. */
  ghost?: [number, number];
};
export type Chapter = { id: number; name: Loc; levels: LevelDef[] };

export const CHAPTERS: Chapter[] = [
  {
    id: 1, name: { en: 'Low Water', zh: '退潮' },
    levels: [
      { id: '1-1', name: { en: 'The Bell', zh: '铃铛' }, rows: ['XBXXXXX', 'PRSSSRG'], tide: 1, par: 8, solution: 'RUDRRRRR',
        idea: { en: 'Step on the bell: the sea goes out.', zh: '踩响铃铛，海水退去。' }, icon: 'bell', ablate: ['bells'], trap: 'RR', ghost: [1, 0] },
      { id: '1-2', name: { en: 'Driftwood', zh: '浮木' }, rows: ['XRRXXX', 'PRrDRG', 'XRRXXX'], tide: 0, par: 5, solution: 'RRRRR',
        idea: { en: 'Push wood into water and it floats: a bridge.', zh: '把木头推进水里，它浮起来就是桥。' }, icon: 'wood', ablate: ['raft:0'], trap: 'RURD', ghost: [2, 1] },
      { id: '1-3', name: { en: 'Stopper', zh: '挡板' }, rows: ['XRRXXXX', 'XRrXXXX', 'PRrDDRG', 'XRRXXXX'], tide: 0, par: 14, solution: 'RRLUURDLDRRRRR',
        idea: { en: 'Floating wood drifts until it bumps into something.', zh: '漂走的木头一直漂，撞到东西才停。' }, icon: 'drift', ablate: ['raft:0'], trap: 'RRR' },
      { id: '1-4', name: { en: 'Do Not Push', zh: '别推' }, rows: ['XBRXXX', 'PRRsGX', 'XXXXXX'], tide: 0, par: 6, solution: 'RUDRRR',
        idea: { en: 'High tide lifts wood off the sand. Walk over it.', zh: '涨潮会托起沙上的木头，从上面走过去。' }, icon: 'float', ablate: ['bells'], trap: 'RRR', ghost: [1, 0] },
      { id: '1-5', name: { en: 'High and Low', zh: '高低' }, rows: ['BRRXXXXXX', 'PRrSDSDRG', 'XrRXXXXXX', 'XRRXXXXXX'], tide: 0, par: 22, solution: 'UDRRDDLURUULLDRRRRRRRR',
        idea: { en: 'At high tide wood sails far; at low tide it stops short.', zh: '涨潮时木头漂得远，退潮时停得近。' }, icon: 'tides', ablate: ['bells'], trap: 'RR' }
    ]
  }
];

export const LEVELS: LevelDef[] = CHAPTERS.flatMap(c => c.levels);
export const levelById = (id: string) => LEVELS.find(l => l.id === id);
export const nextLevelId = (id: string) => { const i = LEVELS.findIndex(l => l.id === id); return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1].id : null; };
