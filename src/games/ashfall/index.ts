import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAshfall } from './game.js';

export const ashfall: GameModule = {
  meta: {
    slug: 'ashfall',
    title: 'Ashfall',
    category: 'action',
    description: 'A cinematic descent through dead woods, a hollow city and an iron foundry.',
    instructions: 'A/D move, W or Space jump, J slash (tap for a 3-hit combo), K shotgun, L or Shift roll, R reload. Touch buttons on mobile.',
    accent: '#ff9a4a',
    mechanic: 'Slash, shoot, roll, topple the Warden'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    return createAshfall(host, services);
  }
};

export default ashfall;
