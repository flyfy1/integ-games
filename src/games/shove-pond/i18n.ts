/** Shove Pond interface text (English / 简体中文). Lessons and puzzles carry their own pairs. */
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

export const EN = {
  'title.name': 'Shove Pond', 'title.tag': 'Everyone draws three hops in secret. Then all the frogs jump at once.',
  'menu.play': 'Quick match', 'menu.playSub': 'You and three bots', 'menu.school': 'Tadpole School', 'menu.schoolSub': '5 tiny lessons',
  'menu.puzzles': 'Pond Puzzles', 'menu.puzzlesSub': '{n} of 10 solved', 'menu.ladder': 'Bot Ladder', 'menu.ladderSub': 'Step {n} of 3',
  'menu.ladderDone': 'All three beaten', 'menu.pass': 'Pass & play', 'menu.passSub': '2-4 friends, one phone',
  'menu.online': 'Play online', 'menu.onlineSub': 'Share a link, play together', 'menu.offline': 'Online rooms are unavailable right now',
  'menu.checking': 'Checking online rooms…', 'menu.lang': '中文', 'menu.back': 'Back', 'menu.join': 'Join with a code',
  'menu.create': 'Create a room', 'menu.resume': 'Resume', 'menu.code': 'Room code', 'menu.go': 'Join', 'menu.name': 'Your name',
  'hud.round': 'Round {n}', 'hud.ready': 'Ready', 'hud.readyDone': 'Ready ✓', 'hud.brace': 'Brace', 'hud.undo': 'Undo', 'hud.menu': 'Menu',
  'hud.plan': 'Draw 3 hops', 'hud.waiting': 'Waiting for {n}…', 'hud.go': 'Go!', 'hud.braceUsed': 'One Brace per round',
  'hud.to': 'First to 6 · round {n} of 8', 'hud.sudden': 'Tie at the top: round {n}', 'hud.sink': 'The edge is sinking!',
  'hud.swipe': 'Swipe or tap arrows', 'hud.retry': 'Try again', 'hud.hint': 'Show me', 'hud.skip': 'Skip',
  'lesson.n': 'Lesson {n} of 5', 'lesson.done': 'Nice!', 'lesson.graduate': 'You graduated from Tadpole School!',
  'lesson.fail.fly': 'Missed the fly. Try again!', 'lesson.fail.splash': 'It stayed dry. Try again!', 'lesson.fail.wet': 'Splash! You fell in.',
  'lesson.fail.points': 'Not enough points. Try again!',
  'puzzle.n': 'Puzzle {n} of 10', 'puzzle.goal': 'Splash all three in one round', 'puzzle.solved': 'Solved!', 'puzzle.next': 'Next puzzle',
  'puzzle.again': 'Again', 'puzzle.fail': '{n} of 3 splashed', 'puzzle.all': 'All ten puzzles solved. Pond master!',
  'puzzle.ghost': 'Arrows show their plans',
  'ladder.step': 'Ladder {n}: {name}', 'ladder.1': 'Pollywogs', 'ladder.2': 'Croakers', 'ladder.3': 'Bullfrogs',
  'ladder.won': 'Step cleared!', 'ladder.next': 'Next step', 'ladder.lost': 'Not this time',
  'end.win': '{name} wins!', 'end.shared': 'Shared win!', 'end.you': 'You win!', 'end.rematch': 'Rematch', 'end.menu': 'Menu',
  'end.points': '{n} pts', 'end.point': '{n} pt', 'end.splashes': 'Splashes dealt: {n}',
  'pass.title': 'Pass & play', 'pass.players': 'Players', 'pass.start': 'Start', 'pass.handTo': 'Pass the phone to', 'pass.imReady': "I'm {name}",
  'pass.hidden': 'Others: look away while they plan', 'pass.bots': 'Bots fill up to 4 frogs',
  'room.title': 'Room {code}', 'room.share': 'Share link', 'room.copied': 'Link copied', 'room.invite': 'The pond has a room open. It is missing you:', 'room.start': 'Start match', 'room.wait': 'Waiting for the host to start',
  'room.players': '{n} in the room · bots fill to 4', 'room.practice': 'Practise while the room fills', 'room.gone': 'The room closed. Finishing against bots.',
  'room.reconnect': 'Reconnecting…', 'room.full': 'That room is full', 'room.missing': 'No room with that code', 'room.spectate': 'Watching: you join at the next match',
  'room.left': 'away (a bot plays)', 'room.you': 'you', 'room.bot': 'bot', 'room.host': 'host', 'room.joining': 'Joining room…', 'room.error': 'Could not reach online rooms',
  'room.taken': 'You take over a bot next round',
  'emote.0': '😂', 'emote.1': '😱', 'emote.2': '👑', 'emote.3': '🐸',
  'bark.0': 'Nothing personal.', 'bark.1': 'Rude.', 'bark.2': 'Who pushed me?!', 'bark.3': 'I meant to do that.', 'bark.4': 'My pad now.', 'bark.5': 'Ribbit happens.',
  'title.boss': 'Pond boss', 'title.shover': 'Chief shover', 'title.fish': 'Honorary fish', 'title.dry': 'Dry feet', 'title.rock': 'Immovable', 'title.there': 'Was also there',
  'end.share': 'Share result', 'end.shareText': '{winner} won Shove Pond with {n} points.', 'end.shareFish': '{fish} is now an honorary fish.', 'end.copied': 'Result copied', 'end.and': ' & ',
  'keys': 'Arrows/WASD hop · Space brace · Backspace undo · Enter ready',
  'common.on': 'On', 'common.off': 'Off'
} as const;
export type Key = keyof typeof EN;

export const ZH: Record<Key, string> = {
  'title.name': '荷塘推推蛙', 'title.tag': '每只蛙偷偷画好三步跳，然后大家一起跳！',
  'menu.play': '快速对战', 'menu.playSub': '你和三个机器人', 'menu.school': '蝌蚪学校', 'menu.schoolSub': '5 节小课',
  'menu.puzzles': '荷塘谜题', 'menu.puzzlesSub': '已解 {n} / 10', 'menu.ladder': '机器人天梯', 'menu.ladderSub': '第 {n} / 3 级',
  'menu.ladderDone': '三级全部击败', 'menu.pass': '同屏传玩', 'menu.passSub': '2-4 人，一部手机',
  'menu.online': '在线房间', 'menu.onlineSub': '分享链接一起玩', 'menu.offline': '在线房间暂时不可用',
  'menu.checking': '正在检查在线房间…', 'menu.lang': 'English', 'menu.back': '返回', 'menu.join': '输入房间码加入',
  'menu.create': '创建房间', 'menu.resume': '继续', 'menu.code': '房间码', 'menu.go': '加入', 'menu.name': '你的名字',
  'hud.round': '第 {n} 回合', 'hud.ready': '准备好了', 'hud.readyDone': '已准备 ✓', 'hud.brace': '站稳', 'hud.undo': '撤销', 'hud.menu': '菜单',
  'hud.plan': '画 3 步跳', 'hud.waiting': '等待 {n} 人…', 'hud.go': '跳！', 'hud.braceUsed': '每回合只能站稳一次',
  'hud.to': '先到 6 分 · 第 {n} / 8 回合', 'hud.sudden': '并列第一：第 {n} 回合', 'hud.sink': '边缘的荷叶要沉了！',
  'hud.swipe': '滑动或点方向键', 'hud.retry': '再试一次', 'hud.hint': '提示', 'hud.skip': '跳过',
  'lesson.n': '第 {n} / 5 课', 'lesson.done': '漂亮！', 'lesson.graduate': '你从蝌蚪学校毕业了！',
  'lesson.fail.fly': '没抓到苍蝇。再试一次！', 'lesson.fail.splash': '它还没落水。再试一次！', 'lesson.fail.wet': '扑通！你掉水里了。',
  'lesson.fail.points': '分数不够。再试一次！',
  'puzzle.n': '第 {n} / 10 题', 'puzzle.goal': '一回合内把三只都推下水', 'puzzle.solved': '解开了！', 'puzzle.next': '下一题',
  'puzzle.again': '再来', 'puzzle.fail': '推下水 {n} / 3 只', 'puzzle.all': '十道谜题全部解开。荷塘大师！',
  'puzzle.ghost': '箭头是它们的计划',
  'ladder.step': '天梯 {n}：{name}', 'ladder.1': '小蝌蚪', 'ladder.2': '呱呱蛙', 'ladder.3': '牛蛙',
  'ladder.won': '本级通过！', 'ladder.next': '下一级', 'ladder.lost': '这次没赢',
  'end.win': '{name} 获胜！', 'end.shared': '并列获胜！', 'end.you': '你赢了！', 'end.rematch': '再来一局', 'end.menu': '菜单',
  'end.points': '{n} 分', 'end.point': '{n} 分', 'end.splashes': '推下水 {n} 次',
  'pass.title': '同屏传玩', 'pass.players': '玩家', 'pass.start': '开始', 'pass.handTo': '把手机交给', 'pass.imReady': '我是{name}',
  'pass.hidden': '其他人：规划时请别偷看', 'pass.bots': '机器人补足 4 只蛙',
  'room.title': '房间 {code}', 'room.share': '分享链接', 'room.copied': '链接已复制', 'room.invite': '池塘开了个房间，就差你：', 'room.start': '开始对战', 'room.wait': '等待房主开始',
  'room.players': '房间里 {n} 人 · 机器人补足 4 只', 'room.practice': '等人时先练练', 'room.gone': '房间已关闭。和机器人打完这局。',
  'room.reconnect': '重新连接中…', 'room.full': '房间已满', 'room.missing': '没有这个房间码', 'room.spectate': '观战中：下一局加入',
  'room.left': '离开（机器人代打）', 'room.you': '你', 'room.bot': '机器人', 'room.host': '房主', 'room.joining': '正在加入房间…', 'room.error': '连不上在线房间',
  'room.taken': '下回合你接管一只机器人蛙',
  'emote.0': '😂', 'emote.1': '😱', 'emote.2': '👑', 'emote.3': '🐸',
  'bark.0': '对事不对蛙。', 'bark.1': '没礼貌。', 'bark.2': '谁推的我？！', 'bark.3': '我是故意的。', 'bark.4': '这片叶子归我了。', 'bark.5': '蛙生无常。',
  'title.boss': '塘主', 'title.shover': '推蛙王', 'title.fish': '荣誉鱼类', 'title.dry': '滴水不沾', 'title.rock': '稳如老蛙', 'title.there': '重在参与',
  'end.share': '分享战绩', 'end.shareText': '{winner} 以 {n} 分赢了荷塘推推蛙。', 'end.shareFish': '{fish} 喜提“荣誉鱼类”。', 'end.copied': '战绩已复制', 'end.and': '和',
  'keys': '方向键/WASD 跳 · 空格 站稳 · 退格 撤销 · 回车 准备',
  'common.on': '开', 'common.off': '关'
};

export function createI18n(lang: Lang) {
  const table: Record<Key, string> = lang === 'zh' ? ZH : EN;
  return {
    lang,
    t(key: Key, vars: Record<string, string | number> = {}) { return table[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')); },
    tr(loc: { en: string; zh: string }) { return loc[lang]; }
  };
}
export type I18n = ReturnType<typeof createI18n>;

export const FROG_NAMES: { en: string; zh: string }[] = [
  { en: 'Lily', zh: '莉莉' }, { en: 'Moss', zh: '青苔' }, { en: 'Pip', zh: '豆豆' }, { en: 'Reed', zh: '芦苇' }, { en: 'Plum', zh: '梅子' }, { en: 'Dot', zh: '点点' }
];
