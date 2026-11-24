/**
 * Display text for Pocket Survivor in English and Chinese. The simulation only emits ids and English keys; everything
 * the player reads is picked here at draw time, following the arcade's `navigator.language` convention.
 */
import { BOSS_NAMES, GENERALS, PASSIVE_CARDS, STAGES, WEAPON_CARDS, type BossVariant, type GeneralId, type PassiveId, type StageId, type WeaponId } from './data';
import type { Card } from './sim';

export const zh = () => /^zh\b/i.test(globalThis.navigator?.language || '');
export const tr = (en: string, cn: string) => (zh() ? cn : en);

export const itemName = (key: string, evolved = false): string => {
  if (key in WEAPON_CARDS) { const info = WEAPON_CARDS[key as WeaponId]; return evolved ? tr(info.evolved ?? info.name, info.evolvedZh ?? info.zh) : tr(info.name, info.zh); }
  if (key in PASSIVE_CARDS) { const info = PASSIVE_CARDS[key as PassiveId]; return tr(info.name, info.zh); }
  if (key === 'heal') return tr('Second Wind', '回气');
  if (key === 'bounty') return tr('Bounty', '赏金');
  return key;
};
export const stageName = (id: StageId) => tr(STAGES[id].name, STAGES[id].zh);
export const generalName = (id: GeneralId) => tr(GENERALS[id].name, GENERALS[id].zh);
export const generalTrait = (id: GeneralId) => tr(GENERALS[id].trait, GENERALS[id].zhTrait);
export const bossName = (variant: BossVariant) => tr(BOSS_NAMES[variant].name, BOSS_NAMES[variant].zh);

/** Card text, localised from the card's id and target level. */
export function cardText(card: Card): { name: string; tag: string; desc: string } {
  if (card.kind === 'bonus') return { name: itemName(card.key), tag: tr('BONUS', '奖励'), desc: card.key === 'heal' ? tr('Restore 40% of your HP', '回复 40% 生命') : tr('+60 score', '分数 +60') };
  if (card.kind === 'weapon') {
    const info = WEAPON_CARDS[card.key as WeaponId], from = card.level - 1;
    const tag = from === 0 ? tr('NEW WEAPON', '新武器') : card.evolve ? tr('EVOLVE', '进化') : `LV ${from} > ${card.level}`;
    return { name: itemName(card.key, card.evolve), tag, desc: tr(info.levels[from], info.zhLevels[from]) };
  }
  const info = PASSIVE_CARDS[card.key as PassiveId], from = card.level - 1;
  return { name: itemName(card.key), tag: from === 0 ? tr('NEW', '新') : `LV ${from} > ${card.level}`, desc: tr(info.each, info.zhEach) };
}

const FOES: Record<string, [string, string]> = {
  grub: ['Foot Soldier', '步卒'], skitter: ['Bandit', '山贼'], brute: ['Hammer Bruiser', '铁锤力士'], spitter: ['Archer', '弓手'], charger: ['Cavalry Lancer', '骑兵'], warden: ['The Warlord', '霸王']
};
/** Name of anything in the bestiary: enemy kinds, `mid:<kind>` and `boss:<variant>`. */
export function foeName(key: string): string {
  if (key.startsWith('boss:')) return bossName(key.slice(5) as BossVariant);
  if (key.startsWith('mid:')) { const kind = key.slice(4), stage = Object.values(STAGES).find(def => def.mid.kind === kind && def.scene !== null) ?? STAGES.march; return tr(stage.mid.name, stage.mid.zh); }
  const pair = FOES[key]; return pair ? tr(pair[0], pair[1]) : key;
}
/** "Struck down by ..." line on the result scroll. */
export function killerLine(key: string, won: boolean): string {
  const name = key ? foeName(key) : tr('the horde', '敌军');
  return won ? tr(`Fell in endless battle to ${name}`, `在无尽战斗中被${name}击倒`) : tr(`Struck down by ${name}`, `被${name}击倒`);
}
const BANNERS: Record<string, [string, string]> = {
  'SWARM CLOSING IN': ['BANDIT AMBUSH!', '山贼伏击！'], 'ELITE INCOMING': ['ENEMY OFFICER APPROACHES', '敌将来袭'],
  'MID BOSS DOWN': ['OFFICER DEFEATED - TREASURE!', '击败敌将，宝箱掉落！'], 'SECOND LIFE': ['SECOND LIFE!', '还魂！']
};
/** Banner text from the simulation, re-themed per stage at display time only. */
export function bannerText(text: string, boss: BossVariant, mid: string): string {
  if (text === 'THE WARDEN AWAKENS') return tr(`${BOSS_NAMES[boss].name.toUpperCase()} TAKES THE FIELD`, `${BOSS_NAMES[boss].zh}出阵`);
  if (text === 'ANOTHER WARDEN RISES') return tr(`${BOSS_NAMES[boss].name.toUpperCase()} RETURNS`, `${BOSS_NAMES[boss].zh}再临`);
  if (text === 'WARDEN DOWN - ENDLESS MODE') return tr(`${BOSS_NAMES[boss].name.toUpperCase()} FALLS - ENDLESS`, `${BOSS_NAMES[boss].zh}倒下 - 无尽模式`);
  if (text === 'WARDEN DOWN') return tr(`${BOSS_NAMES[boss].name.toUpperCase()} FALLS`, `${BOSS_NAMES[boss].zh}倒下`);
  if (text === 'MID BOSS') return tr(`${mid.toUpperCase()} CHARGES IN`, `${mid}杀到`);
  const pair = BANNERS[text]; return pair ? tr(pair[0], pair[1]) : text;
}
