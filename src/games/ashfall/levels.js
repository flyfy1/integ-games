import * as descent from './level.js';
import * as aftermath from './level3.js';
import * as storm from './level2.js';
import { buildArt, buildLevel3Art } from './art.js';
import { buildStormArt } from './art2.js';

/**
 * @typedef {Object} LevelCapabilities
 * @property {'descent'|'ascent'|'raised-descent'} terrain
 * @property {object|null} flood
 * @property {Array<object>} upgrades
 * @property {number} enemyHpMultiplier
 * @property {boolean} containDrones
 * @property {(seed:number) => object} artBuilder
 * @property {number} buildSeed
 * @property {string} title
 * @property {string} numeral
 * @property {string} descriptor
 * @property {object} visuals
 */
const defaults = { terrain: 'descent', flood: null, upgrades: [], enemyHpMultiplier: 1, containDrones: false, artBuilder: buildArt, buildSeed: 7 };
const originalVisuals = { pits: 'original', fog: ['130,150,148', '140,120,110', '160,90,60'], grade: ['#2a4a4a', '#4a3a40', '#7a3a1a'], ambient: [0.5, 0.46, 0.4], ember: '#ff9a4a' };
// Original data modules remain intact. Capabilities have explicit defaults and do not depend on IDs.
export const LEVELS = [
  { ...defaults, ...descent, id: 1, numeral: 'I', title: 'THE FIRST DESCENT', descriptor: 'Original descent', visuals: originalVisuals,
    BOSS: { variant: 'warden', armor: 400, hp: 480, w: 140, h: 220, name: 'THE FOUNDRY WARDEN', unbound: 'WARDEN · UNBOUND', bar2: 'THE WARDEN · UNBOUND', sub: '铸 炉 守 卫', sub2: '核 心 暴 露' },
    completion: { title: 'THE FOUNDRY FALLS SILENT', bridge: 'The deep is rising. Climb toward the storm.' } },
  { ...defaults, ...storm, id: 2, numeral: 'II', title: 'THE RISING DEEP', descriptor: 'Rising-water ascent', terrain: 'ascent', flood: storm.FLOOD, upgrades: storm.UPGRADES, containDrones: true, artBuilder: buildStormArt, buildSeed: 23,
    visuals: { pits: 'storm', fog: storm.ZONES.map(z => z.fog), grade: storm.ZONES.map(z => z.palette[1]), ambient: originalVisuals.ambient, ember: '#a8dfff' },
    BOSS: { ...storm.BOSS, bar2: storm.BOSS.unbound, sub2: '核 心 暴 露' },
    completion: { title: 'THE STORM BREAKS', bridge: 'The storm breaks. Below the crown, the drowned rails lead to a colder fire.' } },
  { ...defaults, ...aftermath, id: 3, numeral: 'III', title: 'THE LAST DESCENT', descriptor: 'Harder descent', terrain: 'raised-descent', enemyHpMultiplier: 1.15, containDrones: true, artBuilder: buildLevel3Art,
    visuals: { pits: 'aftermath', fog: aftermath.ZONES.map(z => z.fog), grade: aftermath.ZONES.map(z => z.grade), ambient: aftermath.ZONES.map(z => z.ambient), ember: '#ff9a4a' },
    BOSS: { variant: 'reforged', armor: 460, hp: 560, w: 140, h: 220, name: 'THE WARDEN REFORGED', sub: '重 铸 守 卫', bar2: 'THE WARDEN · ASCENDANT', unbound: 'WARDEN · ASCENDANT', sub2: '余 烬 升 腾' },
    completion: { title: 'THE ASH SETTLES', sub: '灰 烬 落 定' }
  }
];
export const levelFromParam = (value) => LEVELS.find(level => String(level.id) === value) || LEVELS[0];
export const nextLevel = (level) => LEVELS[LEVELS.indexOf(level) + 1] || null;
