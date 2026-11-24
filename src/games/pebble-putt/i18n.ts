import type { Loc } from './types';

/** Pebble Putt interface text (English / 简体中文). Holes and gardens carry their own pairs. */
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

export const EN = {
  'title.name': 'Pebble Putt', 'title.tag': 'Flick a pebble across a raked sand garden. Every hole hides one clever shot that sinks it in one.',
  'title.start': 'Play · Hole 1', 'title.continue': 'Continue · Hole {n}', 'title.gardens': 'Gardens', 'title.party': 'Pass & Play', 'title.settings': 'Settings',
  'title.stars': '{n} of {total} stars', 'title.aces': '{n} aces found', 'title.done': 'Every hole played',
  'map.title': 'Gardens', 'map.locked': 'Finish the hole before', 'map.best': 'Best {n}',
  'hud.hole': 'Hole {n}', 'hud.par': 'Par {n}', 'hud.strokes': 'Strokes {n}', 'hud.menu': 'Menu', 'hud.retry': 'Retry', 'hud.fast': 'Fast ×4',
  'hud.turn': '{name} to play', 'hud.loading': 'Raking the sand…',
  'ghost.drag': 'Drag back', 'ghost.release': 'Let go',
  'toast.water': 'Splash! +1 stroke', 'toast.pickup': 'Picked up', 'toast.knocked': '{name} holed by a knock!',
  'result.ace': 'Ace!', 'result.eagle': 'Eagle', 'result.birdie': 'Birdie', 'result.par': 'Par', 'result.bogey': 'Bogey', 'result.double': 'Double bogey', 'result.over': '+{n}', 'result.pickup': 'Picked up',
  'result.strokes': '{n} strokes · par {par}', 'result.stroke1': '1 stroke · par {par}',
  'star.finish': 'Holed', 'star.par': 'Par', 'star.ace': 'Ace',
  'result.tease': 'One clever shot sinks this in one.', 'result.next': 'Next hole', 'result.retry': 'Retry', 'result.map': 'Gardens',
  'result.garden': '{garden} complete', 'result.final': 'All eighteen holes played. The gardens are quiet; the pebbles rest.',
  'party.title': 'Pass & Play', 'party.sub': 'Share one screen. Pebbles knock each other: bump a rival away, or into the cup for them.',
  'party.players': 'Players', 'party.course': 'Course', 'party.all': 'All 18 holes', 'party.start': 'Start', 'party.card': 'Scorecard', 'party.total': 'Total',
  'party.par': 'Par', 'party.win': '{name} wins!', 'party.tie': 'A tie!', 'party.again': 'Play again', 'party.next': 'Next hole', 'party.done': 'Finish', 'party.hole': 'Hole {n}',
  'settings.title': 'Settings', 'settings.lang': 'Language', 'settings.sound': 'Sound', 'settings.reduced': 'Reduce motion', 'settings.preview': 'Long aim line on every hole',
  'settings.reset': 'Reset progress', 'settings.resetConfirm': 'Erase every star and best score?', 'settings.resetDone': 'Progress reset',
  'common.back': 'Back', 'common.on': 'On', 'common.off': 'Off', 'common.storage': 'Saving is unavailable: progress lasts until you leave.',
  'fallback.title': 'This garden needs 3D', 'fallback.body': 'Pebble Putt draws its garden with WebGL, which this browser has switched off or does not support. Try another browser, or turn on hardware acceleration, then reload.',
  'fallback.loadTitle': 'The garden did not load', 'fallback.loadBody': 'The 3D part of Pebble Putt could not be downloaded. Check your connection, then try again.',
  'fallback.retry': 'Try again',
  'keys': 'Keys: ←/→ aim (hold Shift for fine) · ↑/↓ power · Space shoot · R retry'
} as const;

export type Key = keyof typeof EN;

export const ZH: Record<Key, string> = {
  'title.name': '石子推杆', 'title.tag': '在耙过纹的沙庭里推一颗石子。每一洞都藏着一记妙招，一杆就能进。',
  'title.start': '开始 · 第 1 洞', 'title.continue': '继续 · 第 {n} 洞', 'title.gardens': '庭院', 'title.party': '轮流对战', 'title.settings': '设置',
  'title.stars': '{n} / {total} 星', 'title.aces': '已找到 {n} 个一杆进洞', 'title.done': '所有球洞都打过了',
  'map.title': '庭院', 'map.locked': '先打完前一洞', 'map.best': '最佳 {n}',
  'hud.hole': '第 {n} 洞', 'hud.par': '标准杆 {n}', 'hud.strokes': '已打 {n} 杆', 'hud.menu': '菜单', 'hud.retry': '重打', 'hud.fast': '快进 ×4',
  'hud.turn': '轮到{name}', 'hud.loading': '正在耙沙…',
  'ghost.drag': '向后拉', 'ghost.release': '松手',
  'toast.water': '落水！罚一杆', 'toast.pickup': '捡球', 'toast.knocked': '{name}被撞进洞了！',
  'result.ace': '一杆进洞！', 'result.eagle': '老鹰球', 'result.birdie': '小鸟球', 'result.par': '标准杆', 'result.bogey': '柏忌', 'result.double': '双柏忌', 'result.over': '+{n}', 'result.pickup': '捡球',
  'result.strokes': '{n} 杆 · 标准杆 {par}', 'result.stroke1': '1 杆 · 标准杆 {par}',
  'star.finish': '进洞', 'star.par': '标准杆', 'star.ace': '一杆',
  'result.tease': '这一洞有一记妙招，一杆就能进。', 'result.next': '下一洞', 'result.retry': '再打一次', 'result.map': '庭院',
  'result.garden': '{garden}已完成', 'result.final': '十八洞全部打完。庭院静了，石子也歇了。',
  'party.title': '轮流对战', 'party.sub': '同一块屏幕轮流打。石子会互相碰撞：把对手撞开，或者把它撞进洞里。',
  'party.players': '人数', 'party.course': '球场', 'party.all': '全部 18 洞', 'party.start': '开始', 'party.card': '记分卡', 'party.total': '总杆',
  'party.par': '标准杆', 'party.win': '{name}获胜！', 'party.tie': '平局！', 'party.again': '再来一局', 'party.next': '下一洞', 'party.done': '结束', 'party.hole': '第 {n} 洞',
  'settings.title': '设置', 'settings.lang': '语言', 'settings.sound': '音效', 'settings.reduced': '减少动画', 'settings.preview': '每一洞都显示长瞄准线',
  'settings.reset': '重置进度', 'settings.resetConfirm': '清除所有星星和最佳成绩？', 'settings.resetDone': '进度已重置',
  'common.back': '返回', 'common.on': '开', 'common.off': '关', 'common.storage': '无法保存：离开后进度不会保留。',
  'fallback.title': '这座庭院需要 3D', 'fallback.body': '石子推杆用 WebGL 绘制庭院，而这个浏览器关闭了或不支持 WebGL。请换一个浏览器，或打开硬件加速后刷新。',
  'fallback.loadTitle': '庭院没能加载', 'fallback.loadBody': '石子推杆的 3D 部分没能下载。请检查网络后再试一次。',
  'fallback.retry': '再试一次',
  'keys': '按键：←/→ 瞄准（按住 Shift 微调）· ↑/↓ 力度 · 空格 击球 · R 重打'
};

export const PLAYER_NAMES: Loc[] = [
  { en: 'White', zh: '白石' }, { en: 'Ink', zh: '墨石' }, { en: 'Jade', zh: '翠石' }, { en: 'Coral', zh: '红石' }
];
export const PLAYER_COLORS = ['#f4f1ea', '#4a4a52', '#6fbf9a', '#ee7a5f'];

export function createI18n(lang: Lang) {
  const table: Record<Key, string> = lang === 'zh' ? ZH : EN;
  return {
    lang,
    t(key: Key, vars: Record<string, string | number> = {}) { return table[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')); },
    tr(loc: Loc) { return loc[lang]; }
  };
}
export type I18n = ReturnType<typeof createI18n>;
