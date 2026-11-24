import type { CasteDef, CasteId } from '../types';

/**
 * The ten castes. Stream cards hatch a brood that joins the job queue; post cards ask for a target cell.
 * Costs are per card play. A Worker play is a brood of three, so one tap is a real decision instead of a chore.
 */
export const CASTES: Record<CasteId, CasteDef> = {
  worker: { id: 'worker', name: { en: 'Workers', zh: '工蚁' }, blurb: { en: 'A brood of three. Each carries one crumb home per trip.', zh: '一窝三只。每趟搬一粒面包屑回家。' }, cost: 24, brood: 3, cooldown: 0.8, speed: 2.1, power: 1, bite: 1, kind: 'stream', size: 1, color: '#3a2418', introduced: '1-1' },
  porter: { id: 'porter', name: { en: 'Porter', zh: '大力蚁' }, blurb: { en: 'Slow, big head, lifts like three Workers. Makes big food practical.', zh: '慢，大脑袋，一只顶三只工蚁。搬大件靠它。' }, cost: 40, brood: 1, cooldown: 2, speed: 1.5, power: 3, bite: 2, kind: 'stream', size: 3, color: '#5a2e18', introduced: '1-2' },
  soldier: { id: 'soldier', name: { en: 'Soldier', zh: '兵蚁' }, blurb: { en: 'Post on a trail cell. Guards it: fights spiders and rival ants nearby.', zh: '派到一格路线上驻守，和附近的蜘蛛、敌蚁战斗。' }, cost: 25, brood: 1, cooldown: 3, speed: 2.3, power: 0, bite: 0, kind: 'post', size: 2, color: '#7a1f16', introduced: '1-3' },
  digger: { id: 'digger', name: { en: 'Digger', zh: '掘土蚁' }, blurb: { en: 'Post next to chalk, sand or a fence. Digs a two-cell tunnel: covered and safe.', zh: '派到粉笔线、沙地旁，挖出两格隧道：隐蔽又安全。' }, cost: 35, brood: 1, cooldown: 4, speed: 2, power: 0, bite: 0, kind: 'post', size: 2, color: '#6b4a2a', introduced: '2-2' },
  leafcutter: { id: 'leafcutter', name: { en: 'Leafcutter', zh: '切叶蚁' }, blurb: { en: 'Carries a leaf umbrella: ants beside it are shaded from water and sunbeams and count as hidden.', zh: '举着叶子伞：身边的蚂蚁不怕水和光斑，也不会被发现。' }, cost: 30, brood: 1, cooldown: 2, speed: 1.8, power: 1, bite: 1, kind: 'stream', size: 2, color: '#4a3a18', introduced: '2-3' },
  bridger: { id: 'bridger', name: { en: 'Bridgers', zh: '搭桥蚁' }, blurb: { en: 'Post on water next to the trail. Three Bridgers link into a living bridge. Tap the bridge to lift or lower it.', zh: '派到路线旁的水面，三只连成一座活桥。点桥可以收起或放下。' }, cost: 45, brood: 3, cooldown: 3, speed: 2, power: 0, bite: 0, kind: 'post', size: 1, color: '#3d2a20', introduced: '3-1' },
  spitter: { id: 'spitter', name: { en: 'Spitter', zh: '酸蚁' }, blurb: { en: 'Post on a trail cell. Sprays acid two cells away: dissolves tape, stings predators, slows the mower.', zh: '派到路线上，向两格内喷酸：溶掉粘纸，蛰退天敌，拖慢割草机。' }, cost: 35, brood: 1, cooldown: 3, speed: 2, power: 0, bite: 0, kind: 'post', size: 2, color: '#6d5a12', introduced: '3-2' },
  flyer: { id: 'flyer', name: { en: 'Flyer', zh: '飞蚁' }, blurb: { en: 'Flies straight to any food it can see, trail or not, and carries one crumb. Birds and lamps love it.', zh: '直接飞向看得见的食物，不用路线，一次带一粒。鸟和灯最爱它。' }, cost: 30, brood: 1, cooldown: 1.5, speed: 2.8, power: 1, bite: 1, kind: 'stream', size: 1, color: '#2b2232', introduced: '3-3' },
  scout: { id: 'scout', name: { en: 'Scout', zh: '侦察蚁' }, blurb: { en: 'Post on any cell. Runs straight there, lights up the dark around it and can unplug a bug lamp.', zh: '派到任意一格。直奔过去，照亮周围，还能拔掉灭蚊灯。' }, cost: 15, brood: 1, cooldown: 2, speed: 3.4, power: 0, bite: 0, kind: 'post', size: 1, color: '#2a3a52', introduced: '4-1' },
  honeypot: { id: 'honeypot', name: { en: 'Honeypot', zh: '蜜罐蚁' }, blurb: { en: 'Post on a trail cell as a forward store. Carriers drop crumbs there and turn back; a bucket chain moves them home.', zh: '派到路线上当前哨仓库。搬运工把面包屑放下就回头，接力队把它们送回家。' }, cost: 45, brood: 1, cooldown: 4, speed: 1.6, power: 0, bite: 0, kind: 'post', size: 3, color: '#b8741a', introduced: '4-2' }
};

export const CASTE_ORDER: CasteId[] = ['worker', 'porter', 'soldier', 'digger', 'leafcutter', 'bridger', 'spitter', 'flyer', 'scout', 'honeypot'];
export const STARTING_CASTES: CasteId[] = ['worker'];
