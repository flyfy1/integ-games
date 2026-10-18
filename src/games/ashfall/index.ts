import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAshfall } from './game.js';

export const ashfall: GameModule = {
  meta: {
    slug: 'ashfall',
    title: 'Ashfall',
    category: 'action',
    description: 'Twenty stages. Twenty guardians. Five acts to reclaim the sun. Choose Easy, Normal or Hard; chain kills, forge upgrades and resume your campaign.',
    instructions: 'Choose an act, stage and difficulty, then Start. Runs continue through Level XX; Resume restores the next saved stage. Choose a forge blessing after each boss. Build heat with hits for Overdrive. A/D move, W or Space jump, J slash (tap for a 3-hit combo), K shotgun, L or Shift roll, R reload. Touch buttons on mobile.',
    accent: '#ff9a4a',
    mechanic: 'Slash, shoot, roll, reclaim the sun'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    return createAshfall(host, services);
  }
};

export default ashfall;
