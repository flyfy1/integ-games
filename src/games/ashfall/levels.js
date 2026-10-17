import * as descent from './level.js';
import * as storm from './level2.js';

// Keep the original module and its exports intact for existing consumers.
export const LEVELS = [
  { ...descent, id: 1, buildSeed: 7, BOSS: { armor: 400, hp: 480, w: 140, h: 220, name: 'THE FOUNDRY WARDEN', unbound: 'WARDEN · UNBOUND', sub: '铸 炉 守 卫' } },
  { ...storm, id: 2, buildSeed: 23 }
];
export const levelFromParam = (value) => value === '2' ? LEVELS[1] : LEVELS[0];
