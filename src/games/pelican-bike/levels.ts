export const ROWS = 13;

/**
 * Level chunks, written bottom-aligned: the last two rows are the ground rows.
 * # ground  B crate  = one-way plank  ^ urchin  x crumbling block
 * o fish  * star  S spring  C checkpoint  F lighthouse  P start
 * c crab  g gull  j jellyfish (in water)  h ferry (sideways)  v lift (up/down)
 * u updraft vent (solid grate; rising air above it)  k rickety pier plank (one-way, collapses in a chain)
 * w tide-pool water (W: pool on the opposite half of the tide)  l driftwood log floating on a pool
 * > gust lane blowing right  < gust lane blowing left (mark any cell of the lane's columns)
 */
type Chunk = { r: string[] };

export const START: Chunk = { r: [
  '................',
  '..P.............',
  '################',
  '################'] };

export const CHECK: Chunk = { r: [
  '..........',
  '....C.....',
  '##########',
  '##########'] };

export const END: Chunk = { r: [
  '..........................',
  '......F...................',
  '##########################',
  '##########################'] };

export const CHUNKS: Record<string, Chunk> = {
  fishline: { r: [
    '..............',
    '....o.o.o.o...',
    '..............',
    '##############',
    '##############'] },
  crates: { r: [
    '......ooo.....',
    '.....o...o....',
    '..............',
    '....BB....B...',
    '##############',
    '##############'] },
  starhop: { r: [
    '.......*.......',
    '...............',
    '......o.o......',
    '.....o...o.....',
    '...............',
    '###############',
    '###############'] },
  gap3: { r: [
    '.....ooo.....',
    '....o...o....',
    '.............',
    '.............',
    '#####...#####',
    '#####...#####'] },
  crab: { r: [
    '...o.o.o.o.o...',
    '...............',
    '..........c....',
    '###############',
    '###############'] },
  urchins: { r: [
    '....o....oo....',
    '...............',
    '....^....^^....',
    '###############',
    '###############'] },
  stargap: { r: [
    '....o.....o....',
    '.......*.......',
    '...............',
    '...............',
    '#####.....#####',
    '#####.....#####'] },
  step: { r: [
    '...........ooo..',
    '................',
    '.........#######',
    '.....oo..#######',
    '.....###########',
    '.....###########',
    '################',
    '################'] },
  planks: { r: [
    '........ooo.......',
    '..................',
    '.......====.......',
    '..................',
    '...====.....====..',
    '..................',
    '##..............##',
    '##..............##'] },
  crabplank: { r: [
    '......ooo......',
    '...............',
    '.....=====.....',
    '...............',
    '....c.....c....',
    '###############',
    '###############'] },
  pier: { r: [
    '....o....o....o.....',
    '....................',
    '....................',
    '###.====..====..####',
    '###.............####'] },
  springwall: { r: [
    '..ooo..........',
    '............*..',
    '........#######',
    '........#######',
    '........#######',
    '........#######',
    '...S....#######',
    '###############',
    '###############'] },
  gull: { r: [
    '..................',
    '....o.o.o.o.o.o...',
    '..............g...',
    '..................',
    '..................',
    '##################',
    '##################'] },
  gullstar: { r: [
    '.........*........',
    '..................',
    '..........g.......',
    '....o.o.....o.o...',
    '..................',
    '..................',
    '##################',
    '##################'] },
  crumble: { r: [
    '....oooooo....',
    '..............',
    '..............',
    '###xxxxxxxx###',
    '###........###'] },
  jellygap: { r: [
    '....ooo.....',
    '............',
    '............',
    '............',
    '###.....####',
    '###..j..####'] },
  ferry: { r: [
    '.........ooo.........',
    '.....................',
    '.....................',
    '....h................',
    '###...............###',
    '###...............###'] },
  cratestar: { r: [
    '..........*.....',
    '................',
    '.........BB.....',
    '......o.........',
    '......BB....c...',
    '...BB...........',
    '################',
    '################'] },
  urchinplanks: { r: [
    '......ooo.....ooo...',
    '....................',
    '.....====....====...',
    '...^^^^^^^^^^^^^^^..',
    '####################',
    '####################'] },
  gap9: { r: [
    '....oooooooo.....',
    '.................',
    '.................',
    '.................',
    '###.........#####',
    '###.........#####'] },
  lift: { r: [
    '..........ooooo.',
    '................',
    '.........#######',
    '.........#######',
    '.........#######',
    '.........#######',
    '.........#######',
    '....v....#######',
    '################',
    '################'] },
  liftstar: { r: [
    '................',
    '.....*..........',
    '...........ooo..',
    '................',
    '.........#######',
    '.........#######',
    '.........#######',
    '.........#######',
    '.........#######',
    '....v....#######',
    '################',
    '################'] },
  gullcrabgap: { r: [
    '......ooo..........',
    '...................',
    '............g......',
    '...................',
    '..c.........c......',
    '#######...#########',
    '#######...#########'] },
  crumblejelly: { r: [
    '......*.......',
    '..............',
    '...xxx...xxx..',
    '..............',
    '##..........##',
    '##...j..j...##'] },
  springurchin: { r: [
    '......ooo.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..S^^^^^^^^.....',
    '################',
    '################'] },
  crumblestairs: { r: [
    '..............*.....',
    '....................',
    '...........xxx......',
    '.......oo...........',
    '.......xx...........',
    '...xx...............',
    '##................##',
    '##................##'] },
  jellybridge: { r: [
    '....o.....o.....o.....',
    '......................',
    '......................',
    '###.===...===...===.##',
    '###....j.....j......##'] },
  ferrygull: { r: [
    '.........ooo.........',
    '.....................',
    '..........g..........',
    '.....................',
    '.....................',
    '....h................',
    '###...............###',
    '###...............###'] },
  gauntlet: { r: [
    '.....o......o......o...',
    '.......................',
    '.......................',
    '...c..^.....c..^^......',
    '#######################',
    '#######################'] },

  // ---- Coast 1 · updraft vents ----
  ventup: { r: [
    '......ooo.....',
    '..............',
    '.......o......',
    '..............',
    '.......o......',
    '..............',
    '.......o......',
    '######uu######',
    '##############'] },
  ventwall: { r: [
    '.........ooooo..',
    '.........#######',
    '.........#######',
    '..o......#######',
    '..o......#######',
    '..o......#######',
    '######uu########',
    '################'] },
  ventgap: { r: [
    '.....o...o...o...o....',
    '......................',
    '......................',
    '......................',
    '......................',
    '##uu..............####',
    '####..............####'] },
  ventisles: { r: [
    '...........*..........',
    '......................',
    '......................',
    '......................',
    '....o.o....o.o...o.o..',
    '......................',
    '......................',
    '......................',
    '......................',
    '##uu.....#uu#.....#uu#',
    '####.....####.....####'] },
  ventstar: { r: [
    '.............*....',
    '..................',
    '..................',
    '..................',
    '.....ooo..........',
    '.........###uu####',
    '.........#########',
    '.........#########',
    '.........#########',
    '.........#########',
    '####uu############',
    '##################'] },
  ventcrab: { r: [
    '.....o.o.....o.o.',
    '.................',
    '.................',
    '.................',
    '.........c.......',
    '###uu########uu##',
    '#################'] },
  // ---- Coast 2 · rickety piers ----
  pierintro: { r: [
    '......ooooo.......',
    '..................',
    '...kkkkkkkkkkkk...',
    '..................',
    '##################',
    '##################'] },
  pierrun: { r: [
    '....o..o..o..o..o..o....',
    '........................',
    '........................',
    '###kkkkkkkkkkkkkkkkkk###',
    '###..................###'] },
  pierstairs: { r: [
    '..............ooo.......',
    '........................',
    '...........kkkkk........',
    '........................',
    '......kkkkk.............',
    '........................',
    '###kkkk..........#######',
    '###..............#######'] },
  piergull: { r: [
    '..........*.........',
    '....................',
    '....................',
    '.........g..........',
    '....o.o.....o.o.....',
    '....................',
    '##kkkkkkkkkkkkkkkk##',
    '##................##'] },
  pierlong: { r: [
    '.....ooo.........ooo.....',
    '.........................',
    '.........................',
    '##kkkkkkkk.....kkkkkkkk##',
    '##..........j..........##'] },
  pierdeck: { r: [
    '..............*.......',
    '......................',
    '......................',
    '.....kkkkkkkkkkkk.....',
    '......................',
    '.......o..o..o........',
    '......................',
    '..S...................',
    '#####............#####',
    '#####............#####'] },

  // ---- Coast 3 · tide pools ----
  poolintro: { r: [
    '......o...o...o......',
    '.....................',
    '.....................',
    '###.................#',
    '#####www#www#www#####',
    '#####www#www#www#####',
    '#####################',
    '#####################'] },
  poolfloor: { r: [
    '...................',
    '..##...........##..',
    '..##wwwwwwwwwww##..',
    '####wwwwwwwwwww####',
    '####wooowwwooow####',
    '###################',
    '###################'] },
  poollog: { r: [
    '.......ooo........',
    '..................',
    '..................',
    '..................',
    '###wwwwwwwwwwww###',
    '###wwwwwwlwwwww###',
    '###wwwwwwwwwwww###',
    '###wwwwwwwwwwww###'] },
  poolpair: { r: [
    '.........*........',
    '..................',
    '..................',
    '..................',
    '##wwwww##WWWWW####',
    '##wwwww##WWWWW####',
    '##################',
    '##################'] },
  poolstar: { r: [
    '..................',
    '...##.........##..',
    '..###wwwwwwww###..',
    '.####wwwwwwww####.',
    '#####wwwwwwww#####',
    '#####ww*wwwww#####',
    '##################',
    '##################'] },
  poolcrab: { r: [
    '....o.o.o....o.o.o....',
    '......................',
    '...c..............c...',
    '#######wwwwwwww#######',
    '#######wwwwwwww#######',
    '######################',
    '######################'] },

  // ---- Coast 4 · wind gusts ----
  gustintro: { r: [
    '>>>>>>>>>>>>>>>>>>>>>>>>',
    '........................',
    '........................',
    '...o.o.o.o.o.o.o.o.o.o..',
    '........................',
    '########################',
    '########################'] },
  gusthead: { r: [
    '<<<<<<<<<<<<<<<<<<<<',
    '....................',
    '......o.o.o.o.......',
    '....................',
    '....................',
    '#####..........#####',
    '#####..........#####'] },
  gustgap: { r: [
    '>>>>>>>>>>>>>>>>>>>>>>>>',
    '........................',
    '.......o...o...o...o....',
    '........................',
    '........................',
    '........................',
    '###..................###',
    '###..................###'] },
  gustcrab: { r: [
    '<<<<<<<<<<<<<<<<<<',
    '..................',
    '....o.o.....o.o...',
    '..................',
    '.......c......c...',
    '##################',
    '##################'] },
  guststar: { r: [
    '>>>>>>>>>>>>>>>>>>>>>>>>>>',
    '..........................',
    '..............*...........',
    '..........................',
    '..........................',
    '....o.o.o.................',
    '..........................',
    '..............##..........',
    '###...........##.......###',
    '###...........##.......###'] },
  gustpier: { r: [
    '<<<<<<<<<<<<<<<<<<<<<<',
    '......................',
    '....o..o..o..o..o.....',
    '......................',
    '......................',
    '##kkkkkkkkkkkkkkkkkk##',
    '##..................##'] }
};

/** A chase finale: a pursuer that sweeps right at a steady speed and wipes you out if it catches up. */
export type Chase = { kind: 'wave' | 'gull'; speed: number };
export type Level = { name: string; nameEn: string; theme: number; par: number; seq: string[]; chase?: Chase };

/**
 * Stages by id. Ids are what saves are keyed on, so the first four (the original stages) never move; new stages are
 * appended and the play order lives in COASTS. Each stage holds exactly three stars. A checkpoint is inserted after
 * every fourth chunk.
 */
export const LEVELS: Level[] = [
  { name: '晨光海滩', nameEn: 'Dawn Beach', theme: 0, par: 40,
    seq: ['fishline', 'crates', 'starhop', 'crab', 'gap3', 'urchins', 'stargap', 'step', 'crabplank', 'planks', 'cratestar', 'fishline'] },
  { name: '落日悬崖', nameEn: 'Sunset Cliffs', theme: 1, par: 48,
    seq: ['crab', 'gap3', 'springwall', 'gull', 'crumble', 'pier', 'jellygap', 'urchins', 'cratestar', 'ferry', 'crabplank', 'gullstar', 'planks', 'step'] },
  { name: '月夜港湾', nameEn: 'Moonlit Bay', theme: 2, par: 58,
    seq: ['gull', 'urchinplanks', 'gap9', 'liftstar', 'crumblejelly', 'gullcrabgap', 'springurchin', 'jellygap', 'ferry', 'springwall', 'crumble', 'gauntlet', 'pier', 'lift', 'gap3', 'crabplank'] },
  { name: '风暴灯塔', nameEn: 'Stormlight Reef', theme: 3, par: 70,
    seq: ['gauntlet', 'jellybridge', 'crumblestairs', 'gullcrabgap', 'ferrygull', 'urchinplanks', 'liftstar', 'gap9', 'crumblejelly', 'springurchin', 'jellybridge', 'gull', 'ferry', 'crumble', 'lift', 'gauntlet', 'planks', 'jellygap'] },
  // Coast 1 · Dawn: updraft vents. Introduced safely, developed into walls and gaps, then chased by a wave.
  { name: '微风沙丘', nameEn: 'Breezy Dunes', theme: 0, par: 41,
    seq: ['fishline', 'ventup', 'crates', 'ventwall', 'crab', 'starhop', 'ventgap', 'urchins', 'ventisles', 'crabplank', 'ventstar', 'fishline'] },
  { name: '追浪', nameEn: 'Rolling Tide', theme: 0, par: 42, chase: { kind: 'wave', speed: 215 },
    seq: ['fishline', 'ventup', 'gap3', 'crab', 'ventgap', 'stargap', 'ventwall', 'planks', 'ventisles', 'urchins', 'ventcrab', 'starhop'] },
  // Coast 2 · Sunset: rickety piers that collapse plank by plank once touched.
  { name: '摇晃码头', nameEn: 'Rickety Wharf', theme: 1, par: 49,
    seq: ['fishline', 'pierintro', 'crab', 'pierrun', 'cratestar', 'pierstairs', 'gull', 'piergull', 'urchins', 'pierlong', 'jellygap', 'pierdeck', 'fishline'] },
  { name: '海鸥劫鱼', nameEn: 'Gull Raid', theme: 1, par: 46, chase: { kind: 'gull', speed: 225 },
    seq: ['fishline', 'pierrun', 'crab', 'pierstairs', 'stargap', 'pierlong', 'gap3', 'piergull', 'crumble', 'pierrun', 'jellygap', 'pierdeck'] },
  // Coast 3 · Moonlit: tide pools that fill and drain on a steady beat.
  { name: '潮池阶地', nameEn: 'Tidepool Terraces', theme: 2, par: 48,
    seq: ['fishline', 'poolintro', 'crab', 'poolfloor', 'starhop', 'poollog', 'gap3', 'poolpair', 'urchins', 'poolcrab', 'jellygap', 'poolstar', 'fishline'] },
  { name: '大潮', nameEn: 'Spring Tide', theme: 2, par: 45, chase: { kind: 'wave', speed: 230 },
    seq: ['fishline', 'poolintro', 'gap3', 'poolfloor', 'pierrun', 'poollog', 'stargap', 'poolcrab', 'ventup', 'poolpair', 'crabplank', 'poolstar'] },
  // Coast 4 · Storm: gust lanes that blow on a beat, helping or holding you back.
  { name: '狂风岬', nameEn: 'Gale Point', theme: 3, par: 56,
    seq: ['fishline', 'gustintro', 'crab', 'gusthead', 'cratestar', 'gustgap', 'urchins', 'gustcrab', 'jellybridge', 'guststar', 'gullcrabgap', 'gustpier', 'liftstar', 'fishline'] },
  { name: '最后的海鸥', nameEn: 'The Last Gull', theme: 3, par: 47, chase: { kind: 'gull', speed: 240 },
    seq: ['fishline', 'gustintro', 'gusthead', 'pierrun', 'stargap', 'gustgap', 'poolfloor', 'gustcrab', 'ventisles', 'gustpier', 'urchinplanks', 'guststar'] }
];

export type Coast = { name: string; nameEn: string; family: string; familyEn: string; stages: number[] };
/** Four coasts of three stages each, in play order: the familiar stage, the new idea, then the chase finale. */
export const COASTS: Coast[] = [
  { name: '晨光海岸', nameEn: 'Dawn Coast', family: '上升气流', familyEn: 'updraft vents', stages: [0, 4, 5] },
  { name: '落日海岸', nameEn: 'Sunset Coast', family: '摇晃栈桥', familyEn: 'rickety piers', stages: [1, 6, 7] },
  { name: '月夜海岸', nameEn: 'Moonlit Coast', family: '潮汐池', familyEn: 'tide pools', stages: [2, 8, 9] },
  { name: '风暴海岸', nameEn: 'Storm Coast', family: '阵风', familyEn: 'wind gusts', stages: [3, 10, 11] }
];
/** Every stage id in play order. */
export const ORDER: number[] = COASTS.flatMap((c) => c.stages);
export const coastOf = (id: number) => COASTS.findIndex((c) => c.stages.includes(id));
/** Short label such as "1-3" for a stage id. */
export function stageLabel(id: number): string {
  const ci = coastOf(id);
  return ci < 0 ? String(id + 1) : `${ci + 1}-${COASTS[ci].stages.indexOf(id) + 1}`;
}
/** Storm remixes keep the stage but ask for a quicker ride. */
export const stormPar = (id: number) => Math.round(LEVELS[id].par * 0.85);

function normChunk(ch: Chunk): string[] {
  const rows = ch.r.slice();
  while (rows.length < ROWS) rows.unshift('');
  const w = Math.max(...rows.map((s) => s.length));
  return rows.map((s, i) => {
    const pad = i >= 11 ? (s[s.length - 1] || '#') : '.';
    let res = s;
    while (res.length < w) res += pad;
    return res;
  });
}

/** The full tile rows of a stage. Stages are fixed, so best times and medals mean the same thing on every run. */
export function buildRows(idx: number): string[] {
  const L = LEVELS[idx];
  const seq: Chunk[] = [START];
  L.seq.forEach((key, k) => {
    if (k > 0 && k % 4 === 0) seq.push(CHECK);
    seq.push(CHUNKS[key]);
  });
  seq.push(END);
  const rows = Array.from({ length: ROWS }, () => '');
  for (const ch of seq) {
    const n = normChunk(ch);
    for (let r = 0; r < ROWS; r++) rows[r] += n[r];
  }
  return rows;
}
