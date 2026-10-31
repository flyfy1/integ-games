/** Pad Pals in-game localisation (English / 简体中文), scoped to this game like Geo Quiz. SPOKEN lines also ship as recorded audio. */
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

const EN = {
  'title': 'Pad Pals', 'title.sub': 'Learn your game controller, one button at a time',
  'title.press': 'Press any button to start!', 'title.keys': 'No controller? Keyboard, mouse and touch work too.',
  'map.stars': 'Stars {n}', 'map.lab': 'Playground', 'map.help': 'Move to pick · Bottom button to go · L / R shoulders change difficulty',
  'world.0': 'Buttons', 'world.1': 'Directions', 'world.2': 'Shoulders', 'world.3': 'Both hands', 'world.4': 'Party',
  'diff.0': 'Chick', 'diff.1': 'Bunny', 'diff.2': 'Tiger',
  'ready': 'Get ready…', 'locked': 'Finish the level before this one first',
  'result.great': 'Amazing!', 'result.good': 'Well done!', 'result.ok': 'You did it!', 'result.misses': 'Oops: {n}',
  'result.next': 'Bottom button: next', 'result.again': 'Left button: again', 'result.map': 'Right button: map',
  'result.p1': 'Bear wins!', 'result.p2': 'Bunny wins!',
  'lab.title': 'Playground', 'lab.hint': 'Press everything! Start button goes back.',
  'calib.title': 'Set up buttons', 'calib.press': 'Press: {name}', 'calib.done': 'All set!', 'calib.nopad': 'Press a button on the controller to set up.',
  'btn.connect': '🎮 Connect 2-in-1 receiver', 'btn.map': 'Map', 'btn.skip': 'Skip level', 'btn.setup': 'Set up buttons', 'btn.skipButton': 'No such button', 'btn.cancel': 'Cancel',
  'pad.none': 'No controller', 'pad.on': 'P{n} ready', 'pad.wait': 'P{n}: press a button', 'pad.needConnect': 'Click Connect to use both pads', 'pad.lost': 'Controller unplugged. Plug it back in.', 'pad.fail': 'Could not connect: {error}',
  'name.south': 'bottom button', 'name.east': 'right button', 'name.west': 'left button', 'name.north': 'top button',
  'name.l1': 'left shoulder', 'name.r1': 'right shoulder', 'name.l2': 'left trigger', 'name.r2': 'right trigger', 'name.select': 'select button', 'name.start': 'start button', 'name.l3': 'press the left stick', 'name.r3': 'press the right stick',
  'level.hello': 'Hello Flowers', 'hint.hello': 'Press any button to grow a flower!',
  'level.two': 'Frog Pond', 'hint.two': 'Press the button that glows!',
  'level.mole': 'Mole Party', 'hint.mole': 'Moles match the four buttons. Bonk them!',
  'level.maze': 'Carrot Path', 'hint.maze': 'Use the cross pad to walk to the carrot.',
  'level.roam': 'Star Flight', 'hint.roam': 'Push the left stick to fly. A little push goes slow!',
  'level.flick': 'Balloon Arrows', 'hint.flick': 'Push the stick the way the arrow points.',
  'level.catch': 'Apple Catch', 'hint.catch': 'Your fingers on top! Left shoulder or right shoulder?',
  'level.hold': 'Big Balloon', 'hint.hold': 'Hold the trigger to pump. Let go in the green!',
  'level.simon': 'Copy Parrot', 'hint.simon': 'Watch the parrot, then press the same buttons.',
  'level.aim': 'Bubble Cannon', 'hint.aim': 'Right stick aims. Right shoulder fires!',
  'level.hop': 'Kangaroo Run', 'hint.hop': 'Left stick runs. Bottom button jumps!',
  'level.rhythm': 'Music Rain', 'hint.rhythm': 'Press when the note lands on the line.',
  'level.boss': 'Silly Robot', 'hint.boss': 'Do what the robot asks!',
  'level.tug': 'Tug of War', 'hint.tug': 'Press the glowing button first to pull!',
  'simon.watch': 'Watch the parrot…', 'simon.turn': 'Your turn!', 'simon.again': 'Almost! Try again.',
  'calib.press.south': 'Press the bottom button', 'calib.press.east': 'Press the right button', 'calib.press.west': 'Press the left button', 'calib.press.north': 'Press the top button', 'calib.press.l1': 'Press the left shoulder', 'calib.press.r1': 'Press the right shoulder', 'calib.press.l2': 'Press the left trigger', 'calib.press.r2': 'Press the right trigger', 'calib.press.select': 'Press the select button', 'calib.press.start': 'Press the start button'
} as const;
export type Key = keyof typeof EN;

const ZH: Record<Key, string> = {
  'title': '手柄小伙伴', 'title.sub': '一个按键一个按键，慢慢认识游戏手柄',
  'title.press': '按手柄上任意一个键开始！', 'title.keys': '没有手柄也可以用键盘、鼠标或触屏。',
  'map.stars': '星星 {n}', 'map.lab': '游乐场', 'map.help': '选关卡 · 下面的键进入 · 左右肩键换难度',
  'world.0': '认识按键', 'world.1': '学方向', 'world.2': '肩键扳机', 'world.3': '双手配合', 'world.4': '一起玩',
  'diff.0': '小鸡', 'diff.1': '小兔', 'diff.2': '老虎',
  'ready': '准备好…', 'locked': '先完成前面一关',
  'result.great': '太棒了！', 'result.good': '真不错！', 'result.ok': '完成啦！', 'result.misses': '小失误：{n}',
  'result.next': '下面的键：下一关', 'result.again': '左边的键：再玩一次', 'result.map': '右边的键：回地图',
  'result.p1': '小熊赢了！', 'result.p2': '小兔赢了！',
  'lab.title': '游乐场', 'lab.hint': '什么键都按按看！开始键返回。',
  'calib.title': '设置按键', 'calib.press': '请按：{name}', 'calib.done': '设置好了！', 'calib.nopad': '先按一下手柄上的键，再开始设置。',
  'btn.connect': '🎮 连接一拖二接收器', 'btn.map': '地图', 'btn.skip': '跳过这关', 'btn.setup': '设置按键', 'btn.skipButton': '没有这个键', 'btn.cancel': '取消',
  'pad.none': '未检测到手柄', 'pad.on': '{n}号手柄正常', 'pad.wait': '{n}号：按一下手柄', 'pad.needConnect': '点“连接”才能用两个手柄', 'pad.lost': '手柄断开了，请重新插好。', 'pad.fail': '连接失败：{error}',
  'name.south': '下面的键', 'name.east': '右边的键', 'name.west': '左边的键', 'name.north': '上面的键',
  'name.l1': '左肩键', 'name.r1': '右肩键', 'name.l2': '左扳机', 'name.r2': '右扳机', 'name.select': '选择键', 'name.start': '开始键', 'name.l3': '按下左摇杆', 'name.r3': '按下右摇杆',
  'level.hello': '你好小花', 'hint.hello': '按任意一个键，小花就长出来！',
  'level.two': '青蛙池塘', 'hint.two': '哪个键在发光，就按哪个！',
  'level.mole': '地鼠派对', 'hint.mole': '地鼠的位置和四个键一样，敲它！',
  'level.maze': '萝卜小路', 'hint.maze': '用十字键走到胡萝卜那里。',
  'level.roam': '星星飞行', 'hint.roam': '推左摇杆飞起来，轻轻推就飞得慢！',
  'level.flick': '箭头气球', 'hint.flick': '箭头指哪边，摇杆就推哪边。',
  'level.catch': '接苹果', 'hint.catch': '手指放到手柄顶上！按左肩键还是右肩键？',
  'level.hold': '吹大气球', 'hint.hold': '按住扳机打气，到绿色就松手！',
  'level.simon': '学舌鹦鹉', 'hint.simon': '先看鹦鹉按，再照着按一遍。',
  'level.aim': '泡泡大炮', 'hint.aim': '右摇杆瞄准，右肩键发射！',
  'level.hop': '袋鼠快跑', 'hint.hop': '左摇杆跑，下面的键跳！',
  'level.rhythm': '音符雨', 'hint.rhythm': '音符落到线上时按下去。',
  'level.boss': '呆萌机器人', 'hint.boss': '机器人说什么，你就做什么！',
  'level.tug': '拔河比赛', 'hint.tug': '谁先按发光的键，谁就拉一下！',
  'simon.watch': '看鹦鹉怎么按…', 'simon.turn': '轮到你了！', 'simon.again': '差一点！再来一次。',
  'calib.press.south': '请按下面的键', 'calib.press.east': '请按右边的键', 'calib.press.west': '请按左边的键', 'calib.press.north': '请按上面的键', 'calib.press.l1': '请按左肩键', 'calib.press.r1': '请按右肩键', 'calib.press.l2': '请按左扳机', 'calib.press.r2': '请按右扳机', 'calib.press.select': '请按选择键', 'calib.press.start': '请按开始键'
};

/** Every line the game says out loud. scripts/generate-pad-pals-voice.mjs records one file per line and language. */
export const SPOKEN = [
  ...(['hello', 'two', 'mole', 'maze', 'roam', 'flick', 'catch', 'hold', 'simon', 'aim', 'hop', 'rhythm', 'boss', 'tug'] as const).map((id) => `hint.${id}` as const),
  ...(['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start'] as const).map((id) => `calib.press.${id}` as const),
  'simon.watch', 'simon.turn', 'simon.again', 'diff.0', 'diff.1', 'diff.2', 'locked', 'calib.done', 'result.great', 'result.good', 'result.ok', 'result.p1', 'result.p2'
] as const;
export type SpokenKey = typeof SPOKEN[number];

export function t(lang: Lang, key: Key, params?: Record<string, string | number>) {
  const text: string = lang === 'zh' ? ZH[key] : EN[key];
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}
