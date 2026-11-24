import type { ChapterDef, LevelDef } from '../types';

/**
 * The campaign: four chapters of five levels. Each level introduces one new problem and at most one new part that
 * answers it. Every level ships with stored reference solutions (tests/lantern-works-solutions.ts) that the content
 * test replays; the Tidy (parts) and Swift (beats) pars are set from them.
 */
const L = (def: LevelDef) => def;

export const LEVELS: LevelDef[] = [
  // ---------------------------------------------------------------- Chapter 1: Paper Lane
  L({
    id: '1-1', chapter: 1, index: 1, introduces: 'belt',
    name: { en: 'First Belt', zh: '第一条带子' },
    hint: { en: 'Drag from the paper chute to the stall to lay a belt, then press Run.', zh: '从纸槽拖到摊位铺一条传送带，然后按“开工”。' },
    grid: ['.......', '.......', '.......', '.......'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 2, wants: [{ good: 'paper', n: 5 }] }],
    tray: { belt: 14 }, parTidy: 6, parSwift: 16
  }),
  L({
    id: '1-2', chapter: 1, index: 2, introduces: 'folder',
    name: { en: 'Fold', zh: '折一折' },
    hint: { en: 'Paper that rides through a Folder comes out as a lantern shell.', zh: '纸经过折纸机，就变成灯笼壳。' },
    grid: ['.......', '.......', '...#...', '...#...', '.......'],
    sources: [{ x: 0, y: 2, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 3, wants: [{ good: 'shell round', n: 6 }] }],
    tray: { belt: 14, folder: 1 }, parTidy: 8, parSwift: 20
  }),
  L({
    id: '1-3', chapter: 1, index: 3, introduces: 'vat',
    name: { en: 'Red', zh: '一抹红' },
    hint: { en: 'The Dye vat colours shells. Only shells take dye: what has to come first?', zh: '染缸只给灯笼壳上色。哪台机器该排在前面？' },
    grid: ['.......', '.......', '.......', '.......', '.......'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 3, wants: [{ good: 'shell round red', n: 6 }] }],
    tray: { belt: 14, folder: 1, vat: 1 }, vatColors: ['red'], parTidy: 7, parSwift: 20
  }),
  L({
    id: '1-4', chapter: 1, index: 4, introduces: 'joiner',
    name: { en: 'Hoop and Shell', zh: '竹圈与纸' },
    hint: { en: 'A Joiner waits for one shell and one bamboo hoop, then makes a lantern.', zh: '组装台等一个壳和一个竹圈到齐，就做出一盏灯笼。' },
    grid: ['........', '........', '........', '..#.....', '........', '........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 7, y: 4, dir: 2, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 4, y: 5, wants: [{ good: 'lantern', n: 6 }] }],
    tray: { belt: 18, folder: 1, joiner: 1 }, parTidy: 9, parSwift: 21
  }),
  L({
    id: '1-5', chapter: 1, index: 5, introduces: null, rush: true,
    name: { en: 'Eve of the Fair', zh: '庙会前夜' },
    hint: { en: 'Two orders, one paper chute. Fill one, then change the line while it runs (Enter or the Pause button stops the clock while you work).', zh: '两张订单，一个纸槽。先做完一张，再趁运行时改线（回车或“暂停”按钮可以先停表再改）。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 8, y: 3, wants: [{ good: 'lantern round red', n: 10 }, { good: 'lantern square plain', n: 10 }] }],
    tray: { belt: 24, folder: 1, vat: 1, joiner: 1 }, vatColors: ['red'], parTidy: 14, parSwift: 54
  }),
  // ---------------------------------------------------------------- Chapter 2: The Dye Yard
  L({
    id: '2-1', chapter: 2, index: 1, introduces: 'splitter',
    name: { en: 'Share Alike', zh: '一人一半' },
    hint: { en: 'One chute, two colours. A Splitter sends goods left and right in turn.', zh: '一个纸槽，两种颜色。分流器把东西左右轮流分开。' },
    grid: ['........', '........', '........', '........', '........', '........'],
    sources: [{ x: 0, y: 2, dir: 0, goods: ['paper'], every: 1 }],
    stalls: [{ x: 7, y: 3, wants: [{ good: 'shell red', n: 6 }, { good: 'shell blue', n: 6 }] }],
    tray: { belt: 20, folder: 2, vat: 2, splitter: 1 }, vatColors: ['red', 'blue'], parTidy: 13, parSwift: 22
  }),
  L({
    id: '2-2', chapter: 2, index: 2, introduces: 'mixer',
    name: { en: 'Orange', zh: '橙色' },
    hint: { en: 'There is no orange dye, only red and yellow, and just one vat. A Mixer makes a new colour; a vat set to "fed" takes dye from a belt into its side.', zh: '没有橙色染料，只有红和黄，染缸也只有一个。调色盘能调出新颜色；设为“喂染料”的染缸从侧面收染料。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [
      { x: 0, y: 2, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 5, dir: 0, goods: ['hoop'], every: 2 },
      { x: 3, y: 0, dir: 1, goods: ['dye red'], every: 2 }, { x: 5, y: 0, dir: 1, goods: ['dye yellow'], every: 2 }
    ],
    stalls: [{ x: 8, y: 3, wants: [{ good: 'lantern orange', n: 8 }] }],
    tray: { belt: 24, folder: 1, vat: 1, mixer: 1, joiner: 1 }, parTidy: 18, parSwift: 27
  }),
  L({
    id: '2-3', chapter: 2, index: 3, introduces: 'sorter',
    name: { en: 'Odd One Out', zh: '挑出来' },
    hint: { en: 'The chute sends every shape, the stall wants only lotus. A Sorter turns its chosen kind aside; a Bin takes the rest.', zh: '纸槽什么形状都送，摊位只要莲花。分拣器把选中的转开，废纸篓收走其余。' },
    grid: ['........', '........', '........', '........', '........'],
    sources: [{ x: 0, y: 2, dir: 0, goods: ['shell round', 'shell lotus', 'shell square', 'shell lotus', 'shell square', 'shell round'], every: 1 }],
    stalls: [{ x: 7, y: 1, wants: [{ good: 'shell lotus', n: 8 }] }],
    tray: { belt: 14, sorter: 2, bin: 2 }, parTidy: 8, parSwift: 31
  }),
  L({
    id: '2-4', chapter: 2, index: 4, introduces: null,
    name: { en: 'Small Room', zh: '小房间' },
    hint: { en: 'No room for long belts. Machines can hand goods straight to each other.', zh: '放不下长带子。机器可以直接把东西递给下一台。' },
    grid: ['..#...', '......', '#.#.#.', '......', '...#..'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 3, dir: 0, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 5, y: 4, wants: [{ good: 'lantern red', n: 6 }] }],
    tray: { belt: 12, folder: 1, vat: 1, joiner: 1, splitter: 1, sorter: 1, bin: 1 }, vatColors: ['red'], parTidy: 7, parSwift: 20
  }),
  L({
    id: '2-5', chapter: 2, index: 5, introduces: null, rush: true,
    name: { en: 'Rainbow Row', zh: '彩虹街' },
    hint: { en: 'Two dye chutes, each with its own rhythm. Dye a shell twice and the colours mix: listen to the order they come in.', zh: '两个染料槽，各有各的节奏。一个壳染两次，颜色就会混合：留意它们来的顺序。' },
    grid: ['..........', '..........', '..........', '..........', '..........', '..........', '..........'],
    sources: [
      { x: 0, y: 3, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 6, dir: 0, goods: ['hoop'], every: 2 },
      { x: 3, y: 0, dir: 1, goods: ['dye red', 'dye red', 'dye blue'], every: 2 }, { x: 6, y: 0, dir: 1, goods: ['dye yellow', 'dye blue', 'dye yellow'], every: 2 }
    ],
    stalls: [{ x: 9, y: 4, wants: [{ good: 'lantern orange', n: 5 }, { good: 'lantern purple', n: 5 }, { good: 'lantern green', n: 5 }] }],
    tray: { belt: 30, folder: 1, vat: 2, mixer: 1, joiner: 1, splitter: 2, sorter: 2, bin: 1 }, parTidy: 21, parSwift: 42
  }),
  // ---------------------------------------------------------------- Chapter 3: The Frame Loft
  L({
    id: '3-1', chapter: 3, index: 1, introduces: 'bridge',
    name: { en: 'Over and Under', zh: '上上下下' },
    hint: { en: 'Two lines have to cross. A Bridge lets each go straight over the other.', zh: '两条线必须交叉。天桥让它们各自直行越过。' },
    grid: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
    sources: [{ x: 0, y: 3, dir: 0, goods: ['paper'], every: 2 }, { x: 3, y: 0, dir: 1, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 6, y: 3, wants: [{ good: 'shell round', n: 6 }] }, { x: 3, y: 6, wants: [{ good: 'hoop', n: 6 }] }],
    tray: { belt: 16, folder: 1, bridge: 1, sorter: 1 }, parTidy: 9, parSwift: 18
  }),
  L({
    id: '3-2', chapter: 3, index: 2, introduces: 'wick',
    name: { en: 'Light It', zh: '点亮' },
    hint: { en: 'A Wick lights a lantern with a candle. Candles come slowly; the rest can wait in line.', zh: '点灯台用蜡烛点亮灯笼。蜡烛来得慢，其余的排队等着。' },
    grid: ['........', '........', '........', '........', '........', '........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 2 }, { x: 5, y: 0, dir: 1, goods: ['candle'], every: 4 }],
    stalls: [{ x: 7, y: 3, wants: [{ good: 'lantern lit', n: 6 }] }],
    tray: { belt: 20, folder: 1, joiner: 1, wick: 1 }, parTidy: 13, parSwift: 28
  }),
  L({
    id: '3-3', chapter: 3, index: 3, introduces: 'gate',
    name: { en: 'In Step', zh: '合拍' },
    hint: { en: 'Paper and hoops must share the doorway. Too much paper and the Joiner chokes: a Gate lets goods through one every few beats.', zh: '纸和竹圈只能挤一个门洞。纸太多，组装台就卡住：闸门每隔几拍放行一件。' },
    grid: ['....#....', '....#....', '.........', '....#....', '....#....'],
    sources: [{ x: 0, y: 0, dir: 0, goods: ['paper'], every: 1 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 3 }],
    stalls: [{ x: 8, y: 4, wants: [{ good: 'lantern', n: 6 }] }],
    fixed: [{ kind: 'folder', x: 5, y: 2, dir: 0, dial: 'round' }],
    tray: { belt: 22, joiner: 1, gate: 2 }, parTidy: 14, parSwift: 30
  }),
  L({
    id: '3-4', chapter: 3, index: 4, introduces: null,
    name: { en: 'Borrowed Machines', zh: '借来的机器' },
    hint: { en: 'These machines are bolted down where the last owner left them. Only belts are yours: thread them through.', zh: '这些机器被上一任主人钉死在原地。你只有带子：把它们串起来。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [{ x: 0, y: 5, dir: 0, goods: ['paper'], every: 2 }, { x: 8, y: 5, dir: 2, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 8, y: 0, wants: [{ good: 'lantern square red', n: 6 }] }],
    fixed: [{ kind: 'folder', x: 2, y: 1, dir: 1, dial: 'square' }, { kind: 'joiner', x: 4, y: 3, dir: 3 }, { kind: 'vat', x: 6, y: 4, dir: 2, dial: 'red' }],
    tray: { belt: 32, bridge: 1 }, vatColors: ['red'], parTidy: 24, parSwift: 34
  }),
  L({
    id: '3-5', chapter: 3, index: 5, introduces: null, rush: true,
    name: { en: 'Inspector Mittens', zh: '巡检猫' },
    hint: { en: 'The workshop cat naps on warm belts (paw prints show where, just before). Nothing gets past her: give the line a spare path.', zh: '工坊的猫爱在暖和的带子上打盹（爪印会提前出现）。她挡着谁也过不去：给线路留一条备用路。' },
    grid: ['.........', '.........', '......#..', '.........', '......#..', '.........', '.........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 5, dir: 0, goods: ['hoop'], every: 2 }, { x: 4, y: 0, dir: 1, goods: ['candle'], every: 2 }],
    stalls: [{ x: 8, y: 3, wants: [{ good: 'lantern lit', n: 10 }] }],
    cat: { period: 20, stops: [{ x: 6, y: 3, at: 4, for: 11 }] },
    tray: { belt: 30, folder: 1, joiner: 1, wick: 1, splitter: 1, gate: 1, bridge: 1 }, parTidy: 15, parSwift: 34
  }),
  // ---------------------------------------------------------------- Chapter 4: The Night Market
  L({
    id: '4-1', chapter: 4, index: 1, introduces: 'stamp',
    name: { en: 'Good Fortune', zh: '福字' },
    hint: { en: 'A Stamp presses 福 onto a shell. Like dye, it only takes on a shell, before the Joiner.', zh: '印章把“福”盖在灯笼壳上。和染色一样，要在组装之前。' },
    grid: ['........', '........', '........', '........', '........', '........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 7, y: 3, wants: [{ good: 'lantern red fu', n: 8 }] }],
    tray: { belt: 20, folder: 1, vat: 1, stamp: 1, joiner: 1, sorter: 1, bin: 1 }, vatColors: ['red', 'yellow'], parTidy: 10, parSwift: 26
  }),
  L({
    id: '4-2', chapter: 4, index: 2, introduces: 'bundler',
    name: { en: 'A String of Three', zh: '三连串' },
    hint: { en: 'A Bundler ties three lanterns in the order they arrive. Each string must read red, orange, yellow.', zh: '捆扎机按到达顺序把三盏灯笼串起来。每串都要是红、橙、黄。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [
      { x: 0, y: 3, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 6, dir: 0, goods: ['hoop'], every: 2 },
      { x: 2, y: 0, dir: 1, goods: ['dye red', 'dye red', 'dye yellow'], every: 2 }, { x: 5, y: 0, dir: 1, goods: ['dye red', 'dye yellow', 'dye yellow'], every: 2 }
    ],
    stalls: [{ x: 8, y: 4, wants: [{ good: 'string red orange yellow', n: 4 }] }],
    tray: { belt: 28, folder: 1, vat: 2, mixer: 1, joiner: 1, bundler: 1, sorter: 1, bin: 1 }, parTidy: 20, parSwift: 35
  }),
  L({
    id: '4-3', chapter: 4, index: 3, introduces: null,
    name: { en: 'Two Stalls', zh: '两个摊位' },
    hint: { en: 'Stall A sells red, stall B sells blue, and each sends back the other\'s goods. Keep them apart.', zh: 'A 摊卖红灯笼，B 摊卖蓝灯笼，送错了都会被退回。把它们分开。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [{ x: 0, y: 3, dir: 0, goods: ['paper'], every: 1 }, { x: 0, y: 6, dir: 0, goods: ['hoop'], every: 1 }, { x: 3, y: 0, dir: 1, goods: ['dye red', 'dye blue'], every: 1 }],
    stalls: [{ x: 8, y: 1, wants: [{ good: 'lantern red', n: 6 }] }, { x: 8, y: 5, wants: [{ good: 'lantern blue', n: 6 }] }],
    tray: { belt: 30, folder: 1, vat: 2, joiner: 2, splitter: 1, sorter: 1, bin: 1 }, vatColors: ['red', 'blue'], parTidy: 22, parSwift: 27
  }),
  L({
    id: '4-4', chapter: 4, index: 4, introduces: null,
    name: { en: 'Change of Plan', zh: '临时改单' },
    hint: { en: 'First round lanterns, then the customer changes their mind: lotus. Lotus too early is wrong; round too late is fine. Pause, turn a dial, carry on.', zh: '先要圆灯笼，客人中途改主意：要莲花。莲花来早了算错件，圆的来晚了没关系。暂停、拨一下、继续。' },
    grid: ['......#.', '........', '........', '........', '......#.', '........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 7, y: 2, sequential: true, wants: [{ good: 'lantern round', n: 6 }, { good: 'lantern lotus', n: 6 }] }],
    tray: { belt: 22, folder: 2, joiner: 1, splitter: 1, sorter: 1, bin: 1 }, parTidy: 12, parSwift: 34
  }),
  L({
    id: '4-5', chapter: 4, index: 5, introduces: null, rush: true,
    name: { en: 'Thousand-Lantern Night', zh: '千灯夜' },
    hint: { en: 'The whole market at once: three stalls, every part. Light the night.', zh: '整个夜市一起开张：三个摊位，所有零件。点亮这一夜。' },
    grid: ['..........', '..........', '....#.....', '..........', '.....#....', '..........', '..........', '..........'],
    sources: [
      { x: 0, y: 1, dir: 0, goods: ['paper'], every: 1 }, { x: 0, y: 6, dir: 0, goods: ['hoop'], every: 1 }, { x: 7, y: 0, dir: 1, goods: ['candle'], every: 2 }
    ],
    stalls: [
      { x: 9, y: 1, wants: [{ good: 'lantern red lit', n: 5 }] },
      { x: 9, y: 4, wants: [{ good: 'lantern lotus yellow fu', n: 5 }] },
      { x: 9, y: 7, wants: [{ good: 'lantern square blue', n: 5 }] }
    ],
    tray: { belt: 44, folder: 3, vat: 3, joiner: 3, splitter: 2, sorter: 2, bin: 1, bridge: 2, wick: 1, gate: 1, stamp: 1 }, vatColors: ['red', 'yellow', 'blue'], parTidy: 45, parSwift: 40
  })
];

export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: { en: 'Paper Lane', zh: '纸巷' }, blurb: { en: 'A quiet lane of paper and bamboo. Learn the belts.', zh: '一条安静的纸巷。先学会铺带子。' }, levels: ['1-1', '1-2', '1-3', '1-4', '1-5'] },
  { id: 2, name: { en: 'The Dye Yard', zh: '染坊' }, blurb: { en: 'Vats, mixers and a sorter with sharp eyes. Colour by colour.', zh: '染缸、调色盘和眼尖的分拣器。一色一色来。' }, levels: ['2-1', '2-2', '2-3', '2-4', '2-5'] },
  { id: 3, name: { en: 'The Frame Loft', zh: '竹架阁' }, blurb: { en: 'Crossings, candles and a cat who inspects everything.', zh: '交叉、蜡烛，还有一只什么都要检查的猫。' }, levels: ['3-1', '3-2', '3-3', '3-4', '3-5'] },
  { id: 4, name: { en: 'The Night Market', zh: '夜市' }, blurb: { en: 'Stamps, strings and changing orders under a sky of lanterns.', zh: '印章、灯串和说变就变的订单，头顶是满天灯笼。' }, levels: ['4-1', '4-2', '4-3', '4-4', '4-5'] }
];

/** Night Shift / Daily Order board: chutes for paper, hoops and candles, two stalls, a seeded order queue. */
export const NIGHT_LEVEL: LevelDef = {
  id: 'night', chapter: 0, index: 0, introduces: null, endless: true,
  name: { en: 'Night Shift', zh: '夜班' },
  hint: { en: 'Orders arrive at stalls A and B. Fill them before their bars run out; three missed orders end the shift.', zh: '订单送到 A、B 两个摊位。进度条走完前做好；误了三单就收工。' },
  grid: ['..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  sources: [
    { x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 5, dir: 0, goods: ['paper'], every: 2 },
    { x: 3, y: 0, dir: 1, goods: ['hoop'], every: 2 }, { x: 3, y: 6, dir: 3, goods: ['hoop'], every: 2 },
    { x: 6, y: 0, dir: 1, goods: ['candle'], every: 3 }
  ],
  stalls: [{ x: 9, y: 2, wants: [] }, { x: 9, y: 5, wants: [] }],
  tray: { belt: 70, folder: 4, vat: 6, joiner: 4, splitter: 4, sorter: 3, bin: 2, bridge: 3, wick: 3, gate: 2, stamp: 2, mixer: 2 },
  vatColors: ['red', 'yellow', 'blue'], parTidy: 0, parSwift: 0
};

export const levelById = (id: string) => LEVELS.find(l => l.id === id);
export const LEVEL_IDS = LEVELS.map(l => l.id);
export const nextLevelId = (id: string) => { const i = LEVEL_IDS.indexOf(id); return i >= 0 ? LEVEL_IDS[i + 1] : undefined; };
