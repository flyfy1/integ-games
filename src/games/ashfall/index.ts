import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAshfall } from './game.js';

export const ashfall: GameModule = {
  meta: {
    slug: 'ashfall',
    title: 'Ashfall',
    category: 'action',
    description: 'Three cinematic levels: the First Descent, the Rising Deep and the Last Descent. Choose your starting level and face three guardians.',
    instructions: 'Select Level I, II or III with 1/2/3, arrows or touch, then Start. Runs continue forward through Level III. Enter continues between levels. A/D move, W or Space jump, J slash (tap for a 3-hit combo), K shotgun, L or Shift roll, R reload. Touch buttons on mobile.',
    accent: '#ff9a4a',
    mechanic: 'Slash, shoot, roll, topple the Warden'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    return createAshfall(host, services);
  }
};

export default ashfall;
