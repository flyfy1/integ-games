import type { Lang, Loc } from '../types';

/** Puzzle-mode words, English and Chinese. Level names and story lines live with their data as `Loc` pairs. */
export type { Lang } from '../types';
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'zh';
export function defaultLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : '';
  return /^zh/i.test(nav) ? 'zh' : 'en';
}

const STRINGS = {
  'title.name': ['Crumb Raiders', '蚂蚁进攻'],
  'title.tag': ['Draw one scent trail. Press GO. Watch the colony prove you right.', '画一条气味路线，按出发，看蚁群证明你是对的。'],
  'title.play': ['Play', '开始'],
  'title.continue': ['Continue {id}', '继续 {id}'],
  'title.levels': ['Levels', '关卡'],
  'title.settings': ['Settings', '设置'],
  'title.reset': ['Crumb Raiders is a puzzle game now. Old campaign progress was reset.', '蚂蚁进攻改成了解谜玩法，旧的闯关进度已重置。'],
  'common.back': ['Back', '返回'],
  'common.storage': ['Saving is unavailable here; progress lasts until you close the page.', '这里无法存档，进度只保留到关闭页面。'],
  'levels.title': ['Levels', '关卡'],
  'levels.locked': ['Locked', '未解锁'],
  'levels.cleared': ['Cleared', '已通过'],
  'levels.par': ['Elegant route', '精巧路线'],
  'levels.stars': ['{n} of {max} cleared', '已通过 {n} / {max}'],

  'hud.goalCrumbs': ['Bring {n} crumbs home', '搬 {n} 粒回家'],
  'hud.goalItem': ['Bring the {food} home', '把{food}搬回家'],
  'hud.goalBoth': ['The {food} + {n} crumbs', '{food} + {n} 粒'],
  'hud.squad': ['{n} ants', '{n} 只蚂蚁'],
  'hud.scent': ['Scent', '气味'],
  'hud.scentLeft': ['{n} left', '剩 {n}'],
  'hud.go': ['GO', '出发'],
  'hud.retry': ['Retry', '重来'],
  'hud.running': ['Hold to speed up', '按住加速'],
  'hud.undo': ['Undo', '撤销'],
  'hud.undoHold': ['hold: clear', '长按清空'],
  'hud.rules': ['Rules', '规则'],
  'hud.menu': ['Menu', '菜单'],
  'hud.digger': ['Digger', '掘土蚁'],
  'hud.diggerHint': ['Tap a trail cell next to chalk', '点一格挨着粉笔线的路线'],
  'hud.cleared': ['Cleared!', '过关！'],
  'hud.hint': ['Hint', '提示'],
  'hud.hintAsk': ['Stuck? Show the first part of a route', '卡住了？显示一段路线开头'],

  'badge.ants': ['ants {a}', '蚂蚁 {a}'],
  'badge.ant': ['ant {a}', '蚂蚁 {a}'],
  'badge.none': ['no ants', '没蚂蚁'],
  'badge.bridge': ['bridge {a}', '搭桥 {a}'],
  'badge.nest': ['{n} ants', '{n} 只'],

  'fail.reach': ['The trail does not reach the {food}.', '路线没连到{food}。'],
  'fail.short': ['Only {have} ants reached the {food}. It needs {need}.', '只有 {have} 只蚂蚁到了{food}，要 {need} 只。'],
  'fail.shortPower': ['Only {have} lift reached the {food}. It needs {need}.', '{food}只凑到 {have} 份力，要 {need} 份。'],
  'fail.bridge': ['The bridge needs 3 ants. Only {have} got there.', '搭桥要 3 只蚂蚁，只到了 {have} 只。'],
  'fail.crumbs': ['Only {have} of {need} crumbs can get home.', '最多只能搬回 {have} / {need} 粒。'],
  'fail.eaten': ['{lost} ants were lost: only {have} of {need} crumbs can get home.', '损失了 {lost} 只蚂蚁：最多只能搬回 {have} / {need} 粒。'],
  'fail.bridged': ['{b} ants became the bridge: only {have} of {need} crumbs can get home.', '{b} 只蚂蚁去搭桥了：最多只能搬回 {have} / {need} 粒。'],
  'fail.time': ['The ants got stuck.', '蚂蚁被困住了。'],
  'fail.retry': ['Your trail is kept. Change it and press GO.', '路线保留着。改一改再出发。'],
  'deny.scent': ['Out of Scent', '气味用完了'],
  'deny.terrain': ['Ants cannot go there', '蚂蚁过不去'],

  'results.cleared': ['Cleared!', '过关！'],
  'results.par': ['Elegant route: {n} Scent or less', '精巧路线：气味不超过 {n}'],
  'results.parGot': ['Elegant route!', '精巧路线！'],
  'results.used': ['Scent used: {n}', '用掉气味：{n}'],
  'results.next': ['Next', '下一关'],
  'results.replay': ['Replay', '再玩一次'],
  'results.levels': ['Levels', '关卡'],
  'results.done': ['That is every puzzle for now. Well done!', '目前的关卡全部通过，太棒了！'],

  'pause.title': ['Paused', '暂停'],
  'pause.resume': ['Resume', '继续'],
  'pause.clear': ['Clear trail', '清空路线'],
  'pause.levels': ['Levels', '关卡'],
  'pause.title2': ['Title screen', '回到标题'],
  'settings.title': ['Settings', '设置'],
  'settings.lang': ['Language', '语言'],
  'settings.music': ['Music', '音乐'],
  'settings.sfx': ['Sound effects', '音效'],
  'settings.reduced': ['Reduce motion and effects', '减少动画和特效'],
  'settings.reset': ['Reset progress', '重置进度'],
  'settings.resetConfirm': ['Tap again to erase all progress', '再点一次清除全部进度'],
  'settings.resetDone': ['Progress reset.', '进度已重置。'],
  'dialogue.next': ['Next', '继续'],
  'dialogue.skip': ['Skip', '跳过'],
  'rule.ok': ['Got it', '明白了'],
  'rule.new': ['New rule', '新规则'],
  'rule.all': ['Rules so far', '目前的规则'],

  'food.cookie': ['cookie', '饼干'], 'food.bread': ['bread', '面包'], 'food.strawberry': ['strawberry', '草莓'], 'food.sugarcube': ['sugar cube', '方糖'], 'food.cake': ['cake slice', '蛋糕'],
  'food.melon': ['watermelon', '西瓜'], 'food.icecream': ['ice cream', '冰淇淋'], 'food.grape': ['grapes', '葡萄'], 'food.cheese': ['cheese', '奶酪'], 'food.marshmallow': ['marshmallow', '棉花糖'],
  'food.biscuit': ['biscuit', '饼干'], 'food.jam': ['jam toast', '果酱吐司'], 'food.candy': ['candy', '糖果']
} satisfies Record<string, [string, string]>;

export type Key = keyof typeof STRINGS;
export type I18n = { lang: Lang; t(key: Key, vars?: Record<string, string | number>): string; tr(loc: Loc): string };
export function createI18n(lang: Lang): I18n {
  const k = lang === 'zh' ? 1 : 0;
  return {
    lang,
    t(key, vars) {
      let text = STRINGS[key]?.[k] ?? key;
      if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
      return text;
    },
    tr: loc => loc[lang] ?? loc.en
  };
}
