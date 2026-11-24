import type { Loc } from './types';

/** Lantern Works interface text (English / 简体中文). Levels, parts and dial settings carry their own pairs. */
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

export const EN = {
  'title.name': 'Lantern Works', 'title.tag': 'Lay belts, fold, dye and light: build a little workshop that fills every festival order.',
  'title.campaign': 'Workshop', 'title.continue': 'Continue', 'title.night': 'Night Shift', 'title.daily': 'Daily Order', 'title.settings': 'Settings',
  'title.nightLocked': 'Clear 1-5 to open', 'title.stars': '{n} of {total} stars',
  'map.chapter': 'Chapter {n}', 'map.locked': 'Locked', 'map.back': 'Back', 'map.records': 'Best: {parts} parts · {beats} beats', 'map.rush': 'Festival rush',
  'hud.menu': 'Menu', 'hud.run': 'Run', 'hud.pause': 'Pause', 'hud.resume': 'Resume', 'hud.reset': 'Reset', 'hud.undo': 'Undo', 'hud.erase': 'Erase', 'hud.speed': 'Speed',
  'hud.beat': 'Beat {n}', 'hud.parts': 'Parts {n}', 'hud.tidy': 'Tidy ≤ {n}', 'hud.swift': 'Swift ≤ {n}', 'hud.delivered': 'Delivered',
  'hud.order': 'Order', 'hud.then': 'then', 'hud.wrong': 'Wrong {n}/3', 'hud.score': 'Score {n}', 'hud.strikes': 'Missed {n}/3', 'hud.left': '{n} left',
  'hud.rotate': 'Rotate', 'hud.remove': 'Remove', 'hud.dial': 'Setting', 'hud.close': 'Done', 'hud.fixed': 'Bolted down', 'hud.new': 'New part',
  'hud.paused': 'Paused: edit freely, then Resume', 'hud.building': 'Build, then press Run', 'hud.running': 'Running',
  'fail.blocked': 'Nothing can go there', 'fail.fixed': 'That machine is bolted down', 'fail.empty': 'Nothing there', 'fail.none-left': 'None left in the tray',
  'fail.not-in-tray': 'Not in this workshop', 'fail.no-dial': 'No setting to change', 'fail.bad-dial': 'Not available here',
  'card.start': 'Start building', 'card.order': 'The order', 'card.intro': 'Level {id}',
  'win.title': 'Order filled!', 'win.sub': 'The stall lights up.', 'win.next': 'Next level', 'win.stay': 'Keep tinkering', 'win.map': 'Map', 'win.again': 'Run again',
  'win.delivered': 'Delivered', 'win.tidy': 'Tidy: {n} parts (par {par})', 'win.swift': 'Swift: {n} beats (par {par})', 'win.best': 'Best: {parts} parts, {beats} beats',
  'win.chapter': 'Chapter complete!', 'win.final': 'Thousand-Lantern Night. Every order filled; the sky is full of lanterns.',
  'spoil.title': 'Spoiled', 'spoil.sub': 'Three wrong items reached the stall. Your build is safe: fix it and run again.', 'spoil.reset': 'Reset and fix',
  'night.title': 'Night Shift', 'night.sub': 'Orders keep coming. Build while the lines run; three missed orders end the shift.',
  'night.over': 'Shift over', 'night.score': 'Score {n}', 'night.served': '{n} orders served', 'night.best': 'Best {n}', 'night.newBest': 'New best!', 'night.again': 'Another shift',
  'daily.title': 'Daily Order', 'daily.sub': 'Everyone gets the same order queue today.', 'daily.streak': 'Streak {n}', 'daily.share': 'Copy result', 'daily.copied': 'Copied',
  'settings.title': 'Settings', 'settings.lang': 'Language', 'settings.sound': 'Sound', 'settings.music': 'Workshop hum', 'settings.glyphs': 'Colour glyphs on lanterns',
  'settings.reduced': 'Reduce motion', 'settings.reset': 'Reset progress', 'settings.resetConfirm': 'Erase every star and saved build?', 'settings.resetDone': 'Progress reset',
  'common.back': 'Back', 'common.on': 'On', 'common.off': 'Off', 'common.storage': 'Saving is unavailable: progress lasts until you leave.',
  'keys': 'Keys: arrows move · 1-9 / Q E pick · Space place (hold to draw) · R rotate · T setting · X remove · Z undo · Enter run · Backspace reset · F speed'
} as const;

export type Key = keyof typeof EN;

export const ZH: Record<Key, string> = {
  'title.name': '灯笼工坊', 'title.tag': '铺传送带，折纸、染色、点灯：搭一座小工坊，把节日订单全部做完。',
  'title.campaign': '工坊', 'title.continue': '继续', 'title.night': '夜班', 'title.daily': '每日订单', 'title.settings': '设置',
  'title.nightLocked': '通过 1-5 后开放', 'title.stars': '{n} / {total} 星',
  'map.chapter': '第 {n} 章', 'map.locked': '未解锁', 'map.back': '返回', 'map.records': '最佳：{parts} 件 · {beats} 拍', 'map.rush': '节日赶工',
  'hud.menu': '菜单', 'hud.run': '开工', 'hud.pause': '暂停', 'hud.resume': '继续', 'hud.reset': '清空', 'hud.undo': '撤销', 'hud.erase': '拆除', 'hud.speed': '速度',
  'hud.beat': '第 {n} 拍', 'hud.parts': '零件 {n}', 'hud.tidy': '省料 ≤ {n}', 'hud.swift': '快手 ≤ {n}', 'hud.delivered': '交货',
  'hud.order': '订单', 'hud.then': '然后', 'hud.wrong': '错件 {n}/3', 'hud.score': '得分 {n}', 'hud.strikes': '误单 {n}/3', 'hud.left': '还差 {n}',
  'hud.rotate': '旋转', 'hud.remove': '拆除', 'hud.dial': '设定', 'hud.close': '完成', 'hud.fixed': '固定机器', 'hud.new': '新零件',
  'hud.paused': '已暂停：随意修改，再按继续', 'hud.building': '先搭好，再按开工', 'hud.running': '运行中',
  'fail.blocked': '这里放不了', 'fail.fixed': '这台机器是固定的', 'fail.empty': '这里没有东西', 'fail.none-left': '托盘里没有了',
  'fail.not-in-tray': '这间工坊没有这个', 'fail.no-dial': '没有可调的设定', 'fail.bad-dial': '这里用不了',
  'card.start': '开始搭建', 'card.order': '订单', 'card.intro': '第 {id} 关',
  'win.title': '订单完成！', 'win.sub': '摊位亮起来了。', 'win.next': '下一关', 'win.stay': '继续琢磨', 'win.map': '地图', 'win.again': '再跑一次',
  'win.delivered': '交货', 'win.tidy': '省料：{n} 件（目标 {par}）', 'win.swift': '快手：{n} 拍（目标 {par}）', 'win.best': '最佳：{parts} 件，{beats} 拍',
  'win.chapter': '本章完成！', 'win.final': '千灯夜。所有订单都做完了，满天都是灯笼。',
  'spoil.title': '坏了一单', 'spoil.sub': '三件错货送到了摊位。搭好的机器还在：改一改再开工。', 'spoil.reset': '清空重来',
  'night.title': '夜班', 'night.sub': '订单源源不断。边运行边改线；误了三单就收工。',
  'night.over': '收工', 'night.score': '得分 {n}', 'night.served': '完成 {n} 单', 'night.best': '最佳 {n}', 'night.newBest': '新纪录！', 'night.again': '再上一班',
  'daily.title': '每日订单', 'daily.sub': '今天所有人拿到同一串订单。', 'daily.streak': '连续 {n} 天', 'daily.share': '复制成绩', 'daily.copied': '已复制',
  'settings.title': '设置', 'settings.lang': '语言', 'settings.sound': '音效', 'settings.music': '工坊背景音', 'settings.glyphs': '灯笼上显示颜色符号',
  'settings.reduced': '减少动画', 'settings.reset': '重置进度', 'settings.resetConfirm': '清除所有星星和保存的搭建？', 'settings.resetDone': '进度已重置',
  'common.back': '返回', 'common.on': '开', 'common.off': '关', 'common.storage': '无法保存：离开后进度不会保留。',
  'keys': '按键：方向键移动 · 1-9 / Q E 选零件 · 空格放置（按住可连铺）· R 旋转 · T 设定 · X 拆除 · Z 撤销 · 回车开工 · 退格清空 · F 速度'
};

export function createI18n(lang: Lang) {
  const table: Record<Key, string> = lang === 'zh' ? ZH : EN;
  return {
    lang,
    t(key: Key, vars: Record<string, string | number> = {}) { return table[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')); },
    tr(loc: Loc) { return loc[lang]; }
  };
}
export type I18n = ReturnType<typeof createI18n>;
