/**
 * Pocket Survivor meta track: the saved profile (jade, talents, unlocks, records), talent costs and the feats that
 * unlock new arms and generals. Pure data and functions, no DOM, so every rule is unit-testable. The original
 * `arena-best` key is left untouched by this module and keeps holding the best score of any run.
 */
import { BASE_PASSIVES, BASE_WEAPONS, GENERAL_IDS, PASSIVE_IDS, STAGE_IDS, WEAPON_IDS, type GeneralId, type PassiveId, type StageId, type WeaponId } from './data';
import type { Bonus, State } from './sim';

export const PROFILE_KEY = 'arena-profile';
export const PROFILE_VERSION = 1;

export type TalentId = 'vigor' | 'power' | 'swift' | 'reach' | 'wisdom' | 'fortune' | 'revive';
export const TALENT_IDS: readonly TalentId[] = ['vigor', 'power', 'swift', 'reach', 'wisdom', 'fortune', 'revive'];
export type TalentDef = { name: string; zh: string; each: string; zhEach: string; max: number; cost: number; icon: string; color: string };
/** Small, capped permanent bonuses. Rank n+1 costs `cost * (n + 1)` jade. */
export const TALENTS: Record<TalentId, TalentDef> = {
  vigor: { name: 'Vigor', zh: '体魄', each: '+10 max HP', zhEach: '生命上限 +10', max: 5, cost: 15, icon: 'vitality', color: '#f07a8a' },
  power: { name: 'Power', zh: '武力', each: '+5% damage', zhEach: '伤害 +5%', max: 5, cost: 25, icon: 'might', color: '#d8342c' },
  swift: { name: 'Swiftness', zh: '身法', each: '+4% move speed', zhEach: '移动速度 +4%', max: 3, cost: 20, icon: 'haste', color: '#4aa8e0' },
  reach: { name: 'Reach', zh: '揽物', each: '+12% pickup range', zhEach: '拾取范围 +12%', max: 3, cost: 12, icon: 'magnet', color: '#e6a81e' },
  wisdom: { name: 'Wisdom', zh: '悟性', each: '+6% experience', zhEach: '经验 +6%', max: 5, cost: 20, icon: 'quick', color: '#35c79a' },
  fortune: { name: 'Fortune', zh: '财运', each: '+10% jade', zhEach: '玉石 +10%', max: 3, cost: 15, icon: 'jade', color: '#3fe2b4' },
  revive: { name: 'Second Life', zh: '还魂', each: 'Rise once per run at half HP', zhEach: '每局可复活一次（半血）', max: 1, cost: 200, icon: 'heal', color: '#ff8fab' }
};
export const talentCost = (id: TalentId, rank: number) => TALENTS[id].cost * (rank + 1);

/** All-time totals the feats read. */
export type Totals = { runs: number; kills: number; elites: number; chests: number; evolutions: number; bestLevel: number; finals: number; mids: number; noBladesTime: number };
export type Profile = {
  v: number; jade: number; talents: Record<TalentId, number>; totals: Totals;
  weapons: WeaponId[]; passives: PassiveId[]; generals: GeneralId[]; stages: StageId[];
  /** Per-stage best score and whether its final boss fell. */
  best: Partial<Record<StageId, number>>; cleared: StageId[];
  /** Collection: evolutions achieved and foes met (enemy kinds, `mid:<kind>`, `boss:<variant>`). */
  evolved: WeaponId[]; seen: string[];
  last: { stage: StageId; general: GeneralId };
};
const ZERO: Totals = { runs: 0, kills: 0, elites: 0, chests: 0, evolutions: 0, bestLevel: 0, finals: 0, mids: 0, noBladesTime: 0 };
export function freshProfile(): Profile {
  return {
    v: PROFILE_VERSION, jade: 0, talents: Object.fromEntries(TALENT_IDS.map(id => [id, 0])) as Record<TalentId, number>, totals: { ...ZERO },
    weapons: [...BASE_WEAPONS], passives: [...BASE_PASSIVES], generals: ['spear'], stages: ['bamboo', 'march'],
    best: {}, cleared: [], evolved: [], seen: [], last: { stage: 'march', general: 'spear' }
  };
}
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback);
const pick = <T extends string>(value: unknown, allowed: readonly T[], base: readonly T[]): T[] => {
  const list = Array.isArray(value) ? value.filter((item): item is T => allowed.includes(item as T)) : [];
  return [...new Set([...base, ...list])];
};
/** Reads and validates a stored profile; anything missing or malformed falls back to a fresh value. */
export function readProfile(raw: unknown): Profile {
  const fresh = freshProfile();
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Partial<Profile>;
  const talents = { ...fresh.talents };
  for (const id of TALENT_IDS) talents[id] = Math.min(TALENTS[id].max, Math.floor(num(r.talents?.[id])));
  const totals = { ...ZERO };
  for (const key of Object.keys(ZERO) as (keyof Totals)[]) totals[key] = num(r.totals?.[key]);
  const best: Partial<Record<StageId, number>> = {};
  for (const id of STAGE_IDS) if (r.best && num(r.best[id]) > 0) best[id] = num(r.best[id]);
  const last = r.last && STAGE_IDS.includes(r.last.stage) && GENERAL_IDS.includes(r.last.general) ? { stage: r.last.stage, general: r.last.general } : fresh.last;
  return {
    v: PROFILE_VERSION, jade: Math.floor(num(r.jade)), talents, totals,
    weapons: pick(r.weapons, WEAPON_IDS, BASE_WEAPONS), passives: pick(r.passives, PASSIVE_IDS, BASE_PASSIVES),
    generals: pick(r.generals, GENERAL_IDS, ['spear']), stages: pick(r.stages, STAGE_IDS, ['bamboo', 'march']),
    best, cleared: pick(r.cleared, STAGE_IDS, []), evolved: pick(r.evolved, WEAPON_IDS, []),
    seen: Array.isArray(r.seen) ? [...new Set(r.seen.filter((item): item is string => typeof item === 'string' && item.length < 40))].slice(0, 80) : [], last
  };
}

/** Converts talent ranks to the simulation's bonus block. */
export function talentBonus(p: Profile): Bonus {
  const t = p.talents;
  return { hp: t.vigor * 10, dmg: t.power * 0.05, speed: t.swift * 0.04, pickup: t.reach * 0.12, xp: t.wisdom * 0.06, jade: t.fortune * 0.1, revive: t.revive };
}
export function buyTalent(p: Profile, id: TalentId): boolean {
  const rank = p.talents[id];
  if (rank >= TALENTS[id].max) return false;
  const cost = talentCost(id, rank);
  if (p.jade < cost) return false;
  p.jade -= cost; p.talents[id] = rank + 1;
  return true;
}

// ---- feats ------------------------------------------------------------------------------------------------------------
export type Unlock = { kind: 'weapon'; id: WeaponId } | { kind: 'passive'; id: PassiveId } | { kind: 'general'; id: GeneralId };
export type Feat = { id: string; text: string; zh: string; unlock: Unlock; goal: number; progress: (t: Totals) => number };
export const FEATS: readonly Feat[] = [
  { id: 'noblades', text: 'Survive 3:00 without Crescent Blades', zh: '不带月牙刃坚持 3:00', unlock: { kind: 'weapon', id: 'crossbow' }, goal: 180, progress: t => t.noBladesTime },
  { id: 'officers', text: 'Defeat 8 enemy officers', zh: '击败 8 名敌军将领', unlock: { kind: 'weapon', id: 'firepot' }, goal: 8, progress: t => t.elites },
  { id: 'evolve', text: 'Evolve any weapon', zh: '进化任意武器', unlock: { kind: 'weapon', id: 'whirl' }, goal: 1, progress: t => t.evolutions },
  { id: 'kills', text: 'Fell 1,500 foes in total', zh: '累计击败 1500 名敌人', unlock: { kind: 'passive', id: 'armor' }, goal: 1500, progress: t => t.kills },
  { id: 'chests', text: 'Open 6 treasure chests', zh: '开启 6 个宝箱', unlock: { kind: 'passive', id: 'fortune' }, goal: 6, progress: t => t.chests },
  { id: 'level', text: 'Reach level 15 in one run', zh: '单局达到 15 级', unlock: { kind: 'general', id: 'blades' }, goal: 15, progress: t => t.bestLevel },
  { id: 'final', text: 'Defeat a final boss', zh: '击败任意最终首领', unlock: { kind: 'general', id: 'strategist' }, goal: 1, progress: t => t.finals }
];
export const hasUnlock = (p: Profile, unlock: Unlock) => unlock.kind === 'weapon' ? p.weapons.includes(unlock.id) : unlock.kind === 'passive' ? p.passives.includes(unlock.id) : p.generals.includes(unlock.id);
/** Stage order: clearing a stage's mid-boss opens the next battleground. */
export const STAGE_CHAIN: readonly StageId[] = ['bamboo', 'river', 'camp', 'fortress'];

/** Totals as they would stand if the run in progress ended now. */
export function liveTotals(p: Profile, s: State): Totals {
  const t = p.totals;
  return {
    runs: t.runs + 1, kills: t.kills + s.kills, elites: t.elites + s.elites, chests: t.chests + s.chests, evolutions: t.evolutions + s.evolved.length,
    bestLevel: Math.max(t.bestLevel, s.level), finals: t.finals + s.bossesDown, mids: t.mids + (s.midDown ? 1 : 0),
    noBladesTime: Math.max(t.noBladesTime, s.bladesEver ? 0 : s.time)
  };
}
/** Feats newly met by the totals that are not yet unlocked in the profile. */
export function newFeats(p: Profile, totals: Totals): Feat[] { return FEATS.filter(feat => !hasUnlock(p, feat.unlock) && feat.progress(totals) >= feat.goal); }

export type RunResult = { jade: number; unlocked: Feat[]; stagesOpened: StageId[]; newStageBest: boolean };
/**
 * Banks a finished run into the profile (mutates it). Daily runs pay jade and count toward feats but never set
 * stage records, because they ignore talents and use a fixed loadout.
 */
export function bankRun(p: Profile, s: State, jade: number, daily = false): RunResult {
  const totals = liveTotals(p, s), unlocked = newFeats(p, totals);
  p.totals = totals; p.jade += jade;
  for (const feat of unlocked) {
    const u = feat.unlock;
    if (u.kind === 'weapon') p.weapons.push(u.id); else if (u.kind === 'passive') p.passives.push(u.id); else p.generals.push(u.id);
  }
  for (const id of s.evolved) if (!p.evolved.includes(id)) p.evolved.push(id);
  for (const key of Object.keys(s.seen)) if (!p.seen.includes(key) && p.seen.length < 80) p.seen.push(key);
  const stagesOpened: StageId[] = [];
  let newStageBest = false;
  if (!daily) {
    if (s.score > (p.best[s.stage] ?? 0)) { p.best[s.stage] = s.score; newStageBest = true; }
    if (s.bossesDown && !p.cleared.includes(s.stage)) p.cleared.push(s.stage);
    const index = STAGE_CHAIN.indexOf(s.stage), next = STAGE_CHAIN[index + 1];
    if (s.midDown && next && !p.stages.includes(next)) { p.stages.push(next); stagesOpened.push(next); }
  }
  return { jade, unlocked, stagesOpened, newStageBest };
}
