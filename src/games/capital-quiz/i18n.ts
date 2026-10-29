/** Geo Quiz in-game localisation (English / 简体中文). Scoped to this game on purpose; the site shell stays English. */
import { COUNTRIES, type CountryEntry, type Region } from './data';
import { NAMES_ZH, REGION_ZH } from './names-zh';

export type Lang = 'en' | 'zh';
export const LANGS: readonly Lang[] = ['en', 'zh'];
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh';
/** Chinese browsers start in Chinese, everyone else in English; the in-game toggle overrides and is remembered. */
export const defaultLang = (): Lang => (typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');

export const EN = {
  'lang.label': 'Language', 'lang.en': 'EN', 'lang.zh': '中文',
  'menu.title': 'Geo Quiz', 'menu.sub': '10 questions, easy to hard. Pick a mode.',
  'menu.rules': 'Right answers score {a} / {b} / {c} by difficulty · 🔥 answers in a row add +25 more each, up to +100',
  'menu.timer': '⏳ Beat the clock: {a}s easy, {b}s medium, {c}s hard per question. The sooner you answer, the more it scores — never less than 40% of the base points. Time out and it counts as wrong.',
  'menu.best': 'Best', 'menu.notYet': 'Not yet',
  'mode.capital.name': 'Guess the capital', 'mode.capital.blurb': 'A country, four capitals', 'mode.capital.choices': 'Capital choices', 'mode.capital.again': 'Capital genius!', 'mode.capital.short': 'capital',
  'mode.flag.name': 'Guess the flag', 'mode.flag.blurb': 'A flag, four countries', 'mode.flag.choices': 'Country choices', 'mode.flag.again': 'Flag master!', 'mode.flag.short': 'flag',
  'mode.shape.name': 'Guess the outline', 'mode.shape.blurb': 'A silhouette, four countries', 'mode.shape.choices': 'Country choices', 'mode.shape.again': 'Cartographer!', 'mode.shape.short': 'outline',
  'hud.question': 'Question', 'hud.score': 'Score', 'hud.progress': 'Progress',
  'streak.none': 'Streak', 'streak.aria': 'Streak {n}', 'streak.fresh': 'Fresh start', 'streak.max': 'Max +100', 'streak.bonus': 'Bonus +{n}',
  'diff.1': 'Easy', 'diff.2': 'Medium', 'diff.3': 'Hard', 'diff.aria': '{name}, up to {pts} points', 'diff.pts': 'up to {pts} pts',
  'timer.label': 'Time left', 'timer.worth': 'Worth now', 'timer.secs': '{n}s', 'timer.aria': 'Time left {n} seconds, worth {pts} points now', 'timer.expired': "Time's up", 'timer.earned': 'Earned',
  'card.flagAria': 'A national flag', 'card.shapeAria': 'A country outline',
  'prompt.capital': 'What is its capital?', 'prompt.flag': "Which country's flag is this?", 'prompt.shape': 'Which country has this outline?',
  'reveal.capital': 'Capital: {name}',
  'fb.correct': 'Correct! +{n}', 'fb.bonus': 'Base {base} → {timed} with {left}s left, + {bonus} streak bonus · {streak} in a row', 'fb.plain': '{diff} · base {base} → {timed} with {left}s left',
  'fb.timeoutCapital': "Time's up — it's {name}.", 'fb.timeoutCountry': "Time's up — that was {name}.", 'fb.timeoutHint': 'No points this time — the right answer is lit up in green.',
  'fb.wrongCapital': "Not quite — it's {name}.", 'fb.wrongCountry': 'Not quite — that was {name}.',
  'fb.lostRun': 'Your {n}-in-a-row run ends here — a new streak starts next question.', 'fb.hint': 'The right answer is lit up in green.',
  'btn.next': 'Next', 'btn.results': 'See results', 'btn.again': 'Play again', 'btn.menu': 'Change mode',
  'result.mid': 'Nicely navigated!', 'result.low': 'Good start — keep exploring!',
  'result.perfect': 'A perfect round — no misses!', 'result.recap': 'Worth remembering', 'result.totalAria': 'Total score {n}',
  'result.correct': 'Correct', 'result.bestStreak': 'Best streak', 'result.base': 'Base points', 'result.timeLoss': 'Time penalty', 'result.bonus': 'Streak bonus',
  'vs.first': '🏆 First {mode} best: {score}', 'vs.none': 'No best yet — every round is practice', 'vs.new': '🏆 New best! +{gain} over {prior}',
  'vs.match': 'Matched your best of {prior}', 'vs.behind': 'Best {prior} · {gap} to beat it'
} as const;
export type Key = keyof typeof EN;

export const ZH: Record<Key, string> = {
  'lang.label': '语言', 'lang.en': 'EN', 'lang.zh': '中文',
  'menu.title': 'Geo Quiz', 'menu.sub': '共 10 题，由易到难。选一个模式开始。',
  'menu.rules': '按难度答对得 {a} / {b} / {c} 分 · 🔥 连续答对每题再加 25 分，最多 +100',
  'menu.timer': '⏳ 限时作答：简单 {a} 秒、中等 {b} 秒、困难 {c} 秒。答得越快得分越高，最低保留基础分的 40%；超时算答错。',
  'menu.best': '最佳', 'menu.notYet': '暂无',
  'mode.capital.name': '猜首都', 'mode.capital.blurb': '给出国家，四选一首都', 'mode.capital.choices': '首都选项', 'mode.capital.again': '首都达人！', 'mode.capital.short': '首都',
  'mode.flag.name': '猜国旗', 'mode.flag.blurb': '给出国旗，四选一国家', 'mode.flag.choices': '国家选项', 'mode.flag.again': '国旗大师！', 'mode.flag.short': '国旗',
  'mode.shape.name': '猜轮廓', 'mode.shape.blurb': '给出轮廓，四选一国家', 'mode.shape.choices': '国家选项', 'mode.shape.again': '地图高手！', 'mode.shape.short': '轮廓',
  'hud.question': '题号', 'hud.score': '得分', 'hud.progress': '进度',
  'streak.none': '连对', 'streak.aria': '连对 {n}', 'streak.fresh': '重新开始', 'streak.max': '满额 +100', 'streak.bonus': '奖励 +{n}',
  'diff.1': '简单', 'diff.2': '中等', 'diff.3': '困难', 'diff.aria': '{name}，最高 {pts} 分', 'diff.pts': '最高 {pts} 分',
  'timer.label': '剩余时间', 'timer.worth': '现在可得', 'timer.secs': '{n} 秒', 'timer.aria': '剩余 {n} 秒，现在答对可得 {pts} 分', 'timer.expired': '时间到', 'timer.earned': '本题得分',
  'card.flagAria': '一面国旗', 'card.shapeAria': '一个国家的轮廓',
  'prompt.capital': '它的首都是哪里？', 'prompt.flag': '这是哪个国家的国旗？', 'prompt.shape': '这是哪个国家的轮廓？',
  'reveal.capital': '首都：{name}',
  'fb.correct': '答对了！+{n}', 'fb.bonus': '基础 {base} → 剩余 {left} 秒折算 {timed}，加连对奖励 {bonus} · 连对 {streak} 题', 'fb.plain': '{diff} · 基础 {base} → 剩余 {left} 秒折算 {timed}',
  'fb.timeoutCapital': '时间到——答案是{name}。', 'fb.timeoutCountry': '时间到——这是{name}。', 'fb.timeoutHint': '本题不得分——正确答案已用绿色标出。',
  'fb.wrongCapital': '差一点——答案是{name}。', 'fb.wrongCountry': '差一点——这是{name}。',
  'fb.lostRun': '连对 {n} 题的纪录到此为止——下一题重新累计。', 'fb.hint': '正确答案已用绿色标出。',
  'btn.next': '下一题', 'btn.results': '查看结果', 'btn.again': '再来一局', 'btn.menu': '换模式',
  'result.mid': '漂亮的环球之旅！', 'result.low': '好的开始——继续探索吧！',
  'result.perfect': '满分一局——全部答对！', 'result.recap': '值得记住', 'result.totalAria': '总分 {n}',
  'result.correct': '答对', 'result.bestStreak': '最长连对', 'result.base': '基础分', 'result.timeLoss': '用时折损', 'result.bonus': '连对奖励',
  'vs.first': '🏆 首个{mode}模式最佳：{score}', 'vs.none': '还没有最佳成绩——每一局都是练习', 'vs.new': '🏆 新纪录！比 {prior} 高 {gain}',
  'vs.match': '与你的最佳 {prior} 持平', 'vs.behind': '最佳 {prior} · 还差 {gap} 分超越'
};

const DICTS: Record<Lang, Record<Key, string>> = { en: EN, zh: ZH };
export function t(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  return DICTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

const byCountry = new Map<string, CountryEntry>(COUNTRIES.map((c) => [c.country, c]));
const byCapital = new Map<string, CountryEntry>(COUNTRIES.map((c) => [c.capital, c]));
export const countryName = (entry: CountryEntry, lang: Lang): string => (lang === 'zh' ? NAMES_ZH[entry.iso]?.[0] ?? entry.country : entry.country);
export const capitalName = (entry: CountryEntry, lang: Lang): string => (lang === 'zh' ? NAMES_ZH[entry.iso]?.[1] ?? entry.capital : entry.capital);
export const regionName = (region: Region, lang: Lang): string => (lang === 'zh' ? REGION_ZH[region] : region);
/** Options are stored as English strings (stable across language switches and old saves); translate for display. */
export const countryLabel = (english: string, lang: Lang): string => { const e = byCountry.get(english); return e ? countryName(e, lang) : english; };
export const capitalLabel = (english: string, lang: Lang): string => { const e = byCapital.get(english); return e ? capitalName(e, lang) : english; };
