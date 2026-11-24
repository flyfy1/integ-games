// Challenge modes: stage time attack, boss rush and mutator replays. Their records live under their own keys
// (ashfall-times-v1-*, ashfall-rush-v1-*, ashfall-marks-v1-*), so the campaign save (progress, bests, resume) and
// every difficulty number are never touched.
import { readStorage, writeStorage } from './progress.js';

export const MODES = {
  campaign: ['Campaign run', '战役挑战'],
  time: ['Stage time attack', '单关竞速'],
  rush: ['Boss rush · this act', '守卫连战 · 本章']
};
export const MUTATORS = {
  none: ['No modifier', '无修正'],
  glass: ['Glass · one hit fells you', '玻璃 · 一击即倒'],
  double: ['Double enemies', '双倍敌人'],
  noshot: ['No shotgun', '禁用霰弹枪']
};
export const MARKS = { glass: '◇', double: '×2', noshot: '⊘' };
export const MEDALS = [['—', '—'], ['Bronze', '铜牌'], ['Silver', '银牌'], ['Gold', '金牌']];
export const MEDAL_ICON = ['', '🥉', '🥈', '🥇'];

// Reference times in seconds from the seeded ordinary-input bot (2026-11-24, this branch). Stages 1-3 use the
// content-matrix campaign times; later stages are the matrix times x1.12, which matched fresh single-stage bot clears
// (no forge ranks) within about 10%. Bosses are timed from entering the arena to the guardian falling.
const STAGE_REF = [155, 165, 204, 62, 71, 75, 75, 90, 92, 86, 97, 122, 76, 111, 109, 105, 101, 86, 150, 109];
const BOSS_REF = [51, 49, 42, 36, 39, 31, 32, 31, 33, 46, 35, 32, 46, 40, 60, 35, 45, 37, 42, 38];
const validId = id => Number.isInteger(id) && id >= 1 && id <= 20;
const validAct = a => Number.isInteger(a) && a >= 0 && a <= 4;
const finite = t => Number.isFinite(t) && t > 0 && t < 36000;

/** Medal times: gold beats the bot, silver is a clean ride, bronze is generous (never under the S-rank limit). */
export function stageTargets(id) {
  const ref = STAGE_REF[id - 1] ?? 120, s = id <= 3 ? 240 : 140;
  return { gold: Math.round(ref * 0.9), silver: Math.round(ref * 1.25), bronze: Math.max(s, Math.round(ref * 1.8)) };
}
export function rushTargets(ids) {
  const ref = ids.reduce((n, id) => n + (BOSS_REF[id - 1] ?? 45), 0);
  return { gold: Math.round(ref * 0.9), silver: Math.round(ref * 1.25), bronze: Math.round(ref * 1.8) };
}
export const medalFor = (time, t) => (time <= t.gold ? 3 : time <= t.silver ? 2 : time <= t.bronze ? 1 : 0);

const key = (kind, difficulty) => `ashfall-${kind}-v1-${difficulty}`;
function cleanTimes(v, valid) {
  const out = {};
  if (v && typeof v === 'object') for (const [k, t] of Object.entries(v)) if (valid(Number(k)) && finite(t)) out[k] = t;
  return out;
}
export function loadRecords(storage, difficulty) {
  const marks = {}, raw = readStorage(storage, key('marks', difficulty), {});
  if (raw && typeof raw === 'object') for (const [k, list] of Object.entries(raw)) if (validId(Number(k)) && Array.isArray(list)) {
    const ok = [...new Set(list.filter(m => Object.hasOwn(MARKS, m)))];
    if (ok.length) marks[k] = ok;
  }
  return { times: cleanTimes(readStorage(storage, key('times', difficulty), {}), validId), rush: cleanTimes(readStorage(storage, key('rush', difficulty), {}), validAct), marks };
}
/** Keep the faster time for a stage (or act); returns the best and whether this run improved it. */
export function recordTime(storage, difficulty, kind, slot, time) {
  const recs = loadRecords(storage, difficulty), book = kind === 'rush' ? recs.rush : recs.times;
  const prev = book[slot], t = Math.round(time * 10) / 10, improved = !prev || t < prev;
  if (improved) book[slot] = t;
  const saved = improved ? writeStorage(storage, key(kind === 'rush' ? 'rush' : 'times', difficulty), book) : true;
  return { best: book[slot], prev: prev ?? null, improved, saved };
}
export function recordMark(storage, difficulty, id, mutator) {
  const recs = loadRecords(storage, difficulty), list = recs.marks[id] || [];
  const fresh = !list.includes(mutator);
  if (fresh) recs.marks[id] = [...list, mutator];
  const saved = fresh ? writeStorage(storage, key('marks', difficulty), recs.marks) : true;
  return { marks: recs.marks[id], fresh, saved };
}
