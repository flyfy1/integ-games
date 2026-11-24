/** Tide Bell interface text (English / 简体中文). Level names and lessons carry their own pairs. */
export type Lang = 'en' | 'zh';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

const EN = {
  title: 'Tide Bell',
  undo: 'Undo', reset: 'Reset', hint: 'Hint', levels: 'Levels', next: 'Next', replay: 'Replay', back: 'Back', daily: 'Daily tide',
  moves: 'Moves {n}', par: 'Best {n}', tide: 'Tide', tideNames0: 'low', tideNames1: 'high', tideNames1of3: 'middle', tideNames2: 'high',
  stuck: 'The flag is out of reach now.', stuckUndo: 'Undo', hintLeft: '{n} moves to go from here',
  clear: 'Cleared!', perfect: 'Shortest possible: {n} moves', yours: 'You: {n} moves · shortest {par}', tryShorter: 'It can be done in {par}.',
  chapter: 'Chapter {n}', locked: 'Clear the one before', allDone: 'Every tide answered. Thank you for playing.',
  dailyTitle: 'Daily tide', dailyDone: 'Solved today. Streak {n}', dailyNew: 'A new cove every day', share: 'Copy result', copied: 'Copied',
  keys: 'Arrows / WASD move · Z undo · R reset · H hint · L levels',
  lang: '中文', menuTitle: 'Coves', solvedCount: '{n} of {total} solved'
};
const ZH: typeof EN = {
  title: '潮汐铃',
  undo: '撤销', reset: '重来', hint: '提示', levels: '关卡', next: '下一关', replay: '再玩', back: '返回', daily: '每日潮汐',
  moves: '步数 {n}', par: '最少 {n}', tide: '潮位', tideNames0: '低', tideNames1: '高', tideNames1of3: '中', tideNames2: '高',
  stuck: '现在到不了旗子了。', stuckUndo: '撤销', hintLeft: '从这里还要 {n} 步',
  clear: '过关！', perfect: '最短解：{n} 步', yours: '你用了 {n} 步 · 最短 {par} 步', tryShorter: '其实 {par} 步就能完成。',
  chapter: '第 {n} 章', locked: '先通过前一关', allDone: '所有潮汐都已应答，谢谢游玩。',
  dailyTitle: '每日潮汐', dailyDone: '今天已解开 · 连续 {n} 天', dailyNew: '每天一个新海湾', share: '复制成绩', copied: '已复制',
  keys: '方向键 / WASD 移动 · Z 撤销 · R 重来 · H 提示 · L 关卡',
  lang: 'EN', menuTitle: '海湾', solvedCount: '已解开 {n} / {total}'
};
export type Key = keyof typeof EN;
export function createI18n(lang: Lang) {
  const table = lang === 'zh' ? ZH : EN;
  return { lang, t(key: Key, vars: Record<string, string | number> = {}) { return table[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')); } };
}
export type I18n = ReturnType<typeof createI18n>;
