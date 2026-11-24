import { SIT, normalizePlan, planFromString, resolveRound, type Plan, type RoundResult, type State } from './sim';

/**
 * Tadpole School lessons and Pond Puzzles: single-round scenarios. Every scenario is proven by
 * tests/shove-pond-levels.test.ts, which enumerates all 125 plans: the stored solution wins, the stored decoy (the
 * obvious wrong plan) fails, and each lesson after the first cannot be won without the action it teaches.
 *
 * Map legend: '.' pad, '~' water, 'P' you, 'a' 'b' 'c' other frogs (seats 1-3), 'f' a fly on a pad.
 */
export type Loc = { en: string; zh: string };
export type Goal =
  | { type: 'fly' }
  | { type: 'splash'; who: string }
  /** Score at least `n` points this round and stay dry. */
  | { type: 'points'; n: number };
export type Scenario = {
  id: string;
  kind: 'lesson' | 'puzzle';
  map: string[];
  /** Scripted plans for the other frogs ('URDLB-'); missing means sitting still. */
  plans?: Record<string, string>;
  /** Acting order, e.g. 'aP' (default: P, then a, b, c). */
  order?: string;
  crown?: string;
  goal: Goal;
  /** Show the other frogs' plans as ghost arrows. */
  ghosts?: boolean;
  caption: Loc;
  /** The intended winning plan and the tempting plan that must fail. */
  solution: string;
  decoy: string;
  /** Mechanics the puzzle leans on, for the level card. */
  tags?: string[];
};

const LETTERS = 'Pabc';

export function buildScenario(sc: Scenario): State {
  const size = sc.map.length;
  const pads: number[] = [];
  const frogs: { x: number; y: number; score: number; wet: boolean }[] = [];
  const at: Record<string, [number, number]> = {};
  let fly: [number, number] | undefined;
  sc.map.forEach((row, y) => {
    if (row.length !== size) throw new Error(`${sc.id}: map must be square`);
    [...row].forEach((ch, x) => {
      pads.push(ch === '~' ? 0 : 1);
      if (LETTERS.includes(ch)) at[ch] = [x, y];
      if (ch === 'f') fly = [x, y];
    });
  });
  for (const letter of LETTERS) { const p = at[letter]; if (p) frogs.push({ x: p[0], y: p[1], score: 0, wet: false }); }
  if (!at.P) throw new Error(`${sc.id}: no player`);
  const seat = (ch: string) => LETTERS.indexOf(ch);
  const order = [...(sc.order ?? LETTERS.slice(0, frogs.length))].map(seat);
  return {
    n: frogs.length, size, pads, frogs, round: 1, seed: 1, rng: 1, over: false, winners: [],
    scenario: { fly, order, crown: sc.crown ? seat(sc.crown) : -1 }
  };
}

export function scenarioPlans(sc: Scenario, player: readonly number[]): Plan[] {
  const n = buildScenario(sc).n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? normalizePlan(player) : planFromString(sc.plans?.[LETTERS[i]] ?? '---') ?? [SIT, SIT, SIT]));
}

export function playScenario(sc: Scenario, player: readonly number[]): RoundResult {
  return resolveRound(buildScenario(sc), scenarioPlans(sc, player));
}

export function scenarioWon(sc: Scenario, r: RoundResult): boolean {
  const me = r.state.frogs[0];
  if (sc.goal.type === 'fly') return r.ate === 0 && !me.wet;
  if (sc.goal.type === 'splash') return !me.wet && [...sc.goal.who].every(ch => r.events.some(e => e.k === 'splash' && e.s === LETTERS.indexOf(ch) && e.by === 0));
  return !me.wet && me.score >= sc.goal.n;
}

export const LESSONS: Scenario[] = [
  {
    id: 'hop', kind: 'lesson', goal: { type: 'fly' },
    map: ['~~~~~', '~..f~', '~P..~', '~...~', '~~~~~'],
    caption: { en: 'Draw three hops. Catch the fly!', zh: '画三步跳，抓住苍蝇！' },
    solution: 'URR', decoy: 'UUU'
  },
  {
    id: 'shove', kind: 'lesson', goal: { type: 'splash', who: 'a' },
    map: ['~~~~~', '~...~', '~P.a~', '~...~', '~~~~~'],
    caption: { en: 'Hop into a frog to shove it.', zh: '跳向别的蛙，就能把它推走。' },
    solution: 'RRB', decoy: 'URD'
  },
  {
    id: 'lead', kind: 'lesson', goal: { type: 'splash', who: 'a' }, ghosts: true,
    map: ['~~~~~~', '~a...~', '~....~', '~.P..~', '~....~', '~~~~~~'],
    plans: { a: 'RR-' }, order: 'aP',
    caption: { en: 'Aim where it will be.', zh: '瞄准它将要去的地方。' },
    solution: 'URU', decoy: 'UUL'
  },
  {
    id: 'brace', kind: 'lesson', goal: { type: 'splash', who: 'a' }, ghosts: true,
    map: ['~~~~~', '~...~', '~.aP~', '~...~', '~~~~~'],
    plans: { a: 'RL-' }, order: 'aP',
    caption: { en: 'Number 1 goes first. Brace!', zh: '1 号先动。快站稳！' },
    solution: 'BLL', decoy: 'LLL'
  },
  {
    id: 'line', kind: 'lesson', goal: { type: 'points', n: 3 }, crown: 'c',
    map: ['~~~~~~~', '~~~~~~~', '~~.....', '~P.abc~', '~~.....', '~~~~~~~', '~~~~~~~'],
    caption: { en: 'One shove moves the line. Crown = 2!', zh: '一推推动一整排。王冠值 2 分！' },
    solution: 'RRR', decoy: 'RRB'
  }
];

const ALL_THREE: Goal = { type: 'points', n: 3 };
/** Pond Puzzles: splash all three in one round (each splash scores 1 for you) and stay dry. */
export const PUZZLES: Scenario[] = [
  { id: 'corner', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['.....', '~....', 'c....', 'b....', 'aP...'], plans: {}, order: 'Pbac', solution: 'LUU', decoy: 'ULU', caption: { en: 'Down the drain', zh: '顺流而下' }, tags: ['line'] },
  { id: 'sweep', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['bc~..', 'aP...', '.....', '.....', '~....'], plans: {}, order: 'acPb', solution: 'LUR', decoy: 'UDL', caption: { en: 'Corner sweep', zh: '扫荡墙角' }, tags: [] },
  { id: 'wrongpad', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['....~', '...~.', '.~.~~', 'cP...', 'ab...'], plans: { c: '--R' }, order: 'abPc', solution: 'DLU', decoy: 'DUL', caption: { en: 'Wrong pad', zh: '跳错了荷叶' }, tags: ['wrongpad'] },
  { id: 'column', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['~c...', 'a..~.', '.b...', '.P...', '.~.~.'], plans: { a: 'R-L' }, order: 'caPb', solution: 'UUU', decoy: 'UUL', caption: { en: 'Fall in line', zh: '排好队' }, tags: ['lead', 'line'] },
  { id: 'bump', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['.....', 'acP.b', '.~..~', '.....', '.....'], plans: { a: '--B', c: 'RDR' }, order: 'Pacb', solution: 'LRR', decoy: 'LLU', caption: { en: 'Bump and run', zh: '撞了就跑' }, tags: ['line', 'wrongpad'] },
  { id: 'crossing', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['~....', '.....', '.....', '..~Pa', '~.cb.'], plans: { a: '-UL', c: 'R-U' }, order: 'Pacb', solution: 'RDL', decoy: 'RLD', caption: { en: 'Busy crossing', zh: '繁忙路口' }, tags: ['lead', 'wrongpad'] },
  { id: 'stream', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['~....', '..~.~', 'bc~..', '.a...', '.P...'], plans: { a: '-RL', c: '-UU' }, order: 'Pbac', solution: 'UUL', decoy: 'UUU', caption: { en: 'Upstream', zh: '逆流而上' }, tags: ['lead', 'line', 'wrongpad'] },
  { id: 'standfirm', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['.c~..', 'b.a..', '.P...', '.....', '.~...'], plans: { a: 'LRR', b: 'B--' }, order: 'bPca', solution: 'BUL', decoy: 'UUU', caption: { en: 'Stand firm', zh: '站稳脚跟' }, tags: ['brace', 'line', 'wrongpad'] },
  { id: 'wall', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['.....', '....c', '...Pa', '....b', '...~.'], plans: { a: 'L-R', c: 'DU-' }, order: 'Pabc', solution: 'BRD', decoy: 'RUU', caption: { en: 'Be the wall', zh: '当一堵墙' }, tags: ['brace', 'line', 'wrongpad'] },
  { id: 'rush', kind: 'puzzle', goal: ALL_THREE, ghosts: true, map: ['b~.a.', '.cP..', '.....', '.....', '~.~..'], plans: { a: 'RD-', b: 'DUD', c: 'RUR' }, order: 'bPac', solution: 'LRR', decoy: 'LLU', caption: { en: 'Rush hour', zh: '早高峰' }, tags: ['lead', 'line', 'wrongpad'] }
];

