import type { Ablation } from './rules';

export type Loc = { en: string; zh: string };
/** The picture beside a level's one-line lesson. */
export type Icon = 'settle' | 'bell' | 'wood' | 'drift' | 'float' | 'tides' | 'up' | 'down' | 'high' | 'castle' | 'highcastle' | 'current' | 'ride' | 'flag';
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
        idea: { en: 'At high tide wood sails far; at low tide it stops short.', zh: '涨潮时木头漂得远，退潮时停得近。' }, icon: 'tides', ablate: ['bells'], trap: 'RR' },
      { id: '1-6', name: { en: 'Ferry', zh: '渡船' }, rows: ['BRRRRXX', 'PrDSSRX', 'XXXXDXX', 'XXXXRRG'], tide: 0, par: 14, solution: 'UDRULRRRRDDDRR',
        idea: { en: 'When the sea falls, floating wood settles. Push it again.', zh: '海水退去，漂着的木头落在沙上，可以再推。' }, icon: 'settle', ablate: ['bells'], trap: 'R' }
    ]
  },
  {
    id: 2, name: { en: 'Three Waters', zh: '三层潮' },
    levels: [
      { id: '2-1', name: { en: 'Up Bell', zh: '升潮铃' }, rows: ['XXUXXXX', 'PRRsTTG'], tide: 0, par: 8, solution: 'RRUDRRRR',
        idea: { en: 'The up bell lifts the sea one step. High sand stays dry.', zh: '升潮铃让海水涨一级，高沙地仍是干的。' }, icon: 'up', ablate: ['up', 'high'], trap: 'RRR', ghost: [2, 0] },
      { id: '2-2', name: { en: 'Down Bell', zh: '落潮铃' }, rows: ['XNXXXNXXX', 'PRsTTRSSG'], tide: 2, par: 12, solution: 'RUDRRRRUDRRR',
        idea: { en: 'The down bell lowers the sea one step.', zh: '落潮铃让海水退一级。' }, icon: 'down', ablate: ['down', 'high'], trap: 'RUDU', ghost: [1, 0] },
      { id: '2-3', name: { en: 'Middle Water', zh: '半潮' }, rows: ['XXXXXGX', 'PrDDSDT', 'RURRRRX'], tide: 0, par: 12, solution: 'DRLURDRRRRUU',
        idea: { en: 'At middle tide, wood crosses sand and stops at high sand.', zh: '半潮时木头漂过沙地，停在高沙地前。' }, icon: 'high', ablate: ['high', 'up'], trap: 'R' },
      { id: '2-4', name: { en: 'Bell Ringer', zh: '敲钟人' }, rows: ['XXXXNXX', 'XDDTsSR', 'PRUXDXG', 'TrRXXXX', 'RRXXXXX'], tide: 0, par: 18, solution: 'DDRULURDRUURRUDRRD',
        idea: { en: 'Wood can rest on a bell. Push it off as you ring.', zh: '木头可以压在铃上，推开它的同时敲响铃。' }, icon: 'bell', ablate: ['high', 'up', 'down'], trap: 'RR' },
      { id: '2-5', name: { en: 'Three Waters', zh: '三重水' }, rows: ['XXXXXRG', 'PTXDtSX', 'XRRRXTX', 'TUrRXXX', 'XTSRXXX'], tide: 0, par: 19, solution: 'RDRRDDLULURDRUURRUR',
        idea: { en: 'Each height of sea is a different set of paths.', zh: '每一级潮位，都是一张不同的路线图。' }, icon: 'tides', ablate: ['high', 'up'], trap: 'RDD' }
    ]
  },
  {
    id: 3, name: { en: 'Sandcastles', zh: '沙堡' },
    levels: [
      { id: '3-1', name: { en: 'Sandcastle', zh: '沙堡' }, rows: ['XBXXX', 'PRCRG'], tide: 0, par: 8, solution: 'RUDUDRRR',
        idea: { en: 'A sandcastle is a wall until the sea washes it away.', zh: '沙堡是一堵墙，直到海水把它冲走。' }, icon: 'castle', ablate: ['castles'], trap: 'RR', ghost: [1, 0] },
      { id: '3-2', name: { en: 'Breach', zh: '破堡' }, rows: ['RRXXXXX', 'RrSXXXX', 'PRCDDCG', 'XBRSSXX'], tide: 0, par: 20, solution: 'RDUDULUURDLDRRDRRURR',
        idea: { en: 'Wash the castles away first, then push the wood through.', zh: '先让海水冲掉沙堡，再把木头推过去。' }, icon: 'castle', ablate: ['castles'], trap: 'RU' },
      { id: '3-3', name: { en: 'High Castle', zh: '高沙堡' }, rows: ['NUXXXX', 'PRKTRG'], tide: 0, par: 11, solution: 'URDULDRRRRR',
        idea: { en: 'A castle on high sand falls only to the top tide.', zh: '高沙地上的沙堡，只有最高潮才能冲垮。' }, icon: 'highcastle', ablate: ['castles'], trap: 'RR' },
      { id: '3-4', name: { en: 'Low Road', zh: '低路' }, rows: ['TXNTXSG', 'UCrTTDX', 'PRrSSXX'], tide: 0, par: 26, solution: 'RRLLUDRRRUULRDRDLLLURRRRUR',
        idea: { en: 'One flood clears the castle for good. Then think low.', zh: '涨一次潮就永远冲掉沙堡，然后想想退潮。' }, icon: 'castle', ablate: ['castles', 'high'], trap: 'RRR' }
    ]
  },
  {
    id: 4, name: { en: 'Currents', zh: '洋流' },
    levels: [
      { id: '4-1', name: { en: 'Current', zh: '洋流' }, rows: ['PrvXXXX', 'RXvXXRG', 'RX>>>DX', 'RRRRRRX'], tide: 0, par: 13, solution: 'RLDDDRRRRRUUR',
        idea: { en: 'A current carries floating wood along its arrows.', zh: '洋流会顺着箭头带走漂浮的木头。' }, icon: 'current', ablate: ['currents'], trap: 'RR', ghost: [1, 0] },
      { id: '4-2', name: { en: 'Ride', zh: '乘木' }, rows: ['PRRYXXXX', 'XXXvXXXX', 'XXX>>>RG'], tide: 0, par: 5, solution: 'RRRRR',
        idea: { en: 'Step onto wood resting on a current and ride it.', zh: '踩上停在洋流里的木头，乘着它走。' }, icon: 'ride', ablate: ['currents'], trap: 'RRD', ghost: [3, 0] },
      { id: '4-3', name: { en: 'Rising Current', zh: '涨潮水道' }, rows: ['BRXXXXBXX', 'PR}DSDRSG'], tide: 0, par: 9, solution: 'UDRRRUDRR',
        idea: { en: 'High water lets a current run on over the sand.', zh: '涨潮后，洋流能越过沙地继续流。' }, icon: 'current', ablate: ['currents', 'bells'], trap: 'RR' },
      { id: '4-4', name: { en: 'Undertow', zh: '暗流' }, rows: ['XXX<XSG', 'P}SCRvX', 'RrSBXXX', 'DRRXXXX', 'BSXXXXX'], tide: 0, par: 19, solution: 'RDRDLDLUUURDLURRRUR',
        idea: { en: 'Ride at high water; the wood stays where it lands.', zh: '涨潮时乘木而行，木头停在哪里就留在哪里。' }, icon: 'ride', ablate: ['currents', 'castles'], trap: 'RDRR' },
      { id: '4-5', name: { en: 'Last Light', zh: '余晖' }, rows: ['XXXXXXG', 'PX>S>DS', 'RSRRsBX', 'XXYRXXX', 'XXSBXXX'], tide: 0, par: 23, solution: 'DRRDDRUURRLLDLUDDRUULUU',
        idea: { en: 'Launch the wood at low water. Ride it when the sea rises.', zh: '退潮时把木头送上洋流，涨潮时乘它出海。' }, icon: 'ride', ablate: ['currents', 'bells'], trap: 'DRRRR' }
    ]
  }
];

export const LEVELS: LevelDef[] = CHAPTERS.flatMap(c => c.levels);
export const levelById = (id: string) => LEVELS.find(l => l.id === id);
export const nextLevelId = (id: string) => { const i = LEVELS.findIndex(l => l.id === id); return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1].id : null; };
