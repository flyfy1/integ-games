import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

type Platform = { x: number; y: number; width: number };
type Spike = { x: number; y: number; width: number };

export const platformer: GameModule = {
  meta: { slug: 'platformer', title: 'Trap Trail', category: 'action', description: 'Navigate a tiny temple whose floor has opinions.', instructions: 'Use arrows or touch sides to move; tap upper screen to jump.', accent: '#70f0c2', mechanic: 'Reach exit through surprise traps' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'platformer');
    const platforms: Platform[] = [{ x: 0, y: 510, width: 110 }, { x: 145, y: 450, width: 75 }, { x: 255, y: 390, width: 80 }, { x: 110, y: 325, width: 72 }, { x: 235, y: 260, width: 100 }, { x: 45, y: 195, width: 80 }, { x: 170, y: 130, width: 130 }];
    const spikes: Spike[] = [{ x: 112, y: 510, width: 33 }, { x: 220, y: 510, width: 35 }, { x: 180, y: 450, width: 25 }, { x: 110, y: 325, width: 25 }];
    let raf = 0, paused = false, won = false, dead = false, x = 32, y = 458, vx = 0, vy = 0, stage = 1, elapsed = 0, airborne = false;
    const reset = () => { paused = false; won = false; dead = false; x = 32; y = 458; vx = 0; vy = 0; stage = 1; elapsed = 0; airborne = false; k.fx.clear(); };
    const jump = () => { if (!paused && !won && !dead && !airborne) { vy = -11; airborne = true; k.fx.burst(x + 9, y + 26, '#ffcb6b', 4); services.sound.play('jump'); } };
    const touchMove = (event: PointerEvent) => { const point = k.point(event); if (point.y < 355) jump(); else vx = point.x < 180 ? -4 : 4; };
    k.on('pointerdown', event => { if (dead || won) { reset(); return; } touchMove(event as PointerEvent); }); k.on('pointermove', event => { if ((event as PointerEvent).buttons) touchMove(event as PointerEvent); }); k.on('pointerup', () => { vx = 0; }); k.on('pointercancel', () => { vx = 0; });
    k.on('keydown', event => { const key = (event as KeyboardEvent).key; if ((dead || won) && (key === ' ' || key === 'Enter' || key === 'r')) { reset(); return; } if (key === 'ArrowUp' || key === 'w' || key === ' ') jump(); if (key === 'ArrowLeft' || key === 'a') vx = -4; if (key === 'ArrowRight' || key === 'd') vx = 4; }); k.on('keyup', () => { vx = 0; });
    const draw = () => { const c = k.ctx; k.clear(); c.fillStyle = '#101b26'; c.fillRect(0, 0, 360, 560); text(c, `TRAIL ${stage}  ·  ${Math.floor(elapsed / 60)}s`, 180, 28, 15, '#a8b1c5'); platforms.forEach(platform => { c.fillStyle = '#2f5b65'; c.fillRect(platform.x, platform.y, platform.width, 14); c.fillStyle = '#70f0c2'; c.fillRect(platform.x, platform.y, platform.width, 3); }); spikes.forEach(spike => { c.fillStyle = '#ff6b7a'; for (let i = 0; i < spike.width; i += 9) { c.beginPath(); c.moveTo(spike.x + i, spike.y); c.lineTo(spike.x + i + 5, spike.y - 12); c.lineTo(spike.x + i + 10, spike.y); c.fill(); } }); c.fillStyle = '#8b7cff'; c.fillRect(285, 218, 22, 42); c.fillStyle = '#ffcb6b'; c.fillRect(x, y, 18, 26); k.fx.draw(); if (paused) text(c, 'PAUSED', 180, 280, 28); if (dead) { text(c, 'TRAP SPRUNG', 180, 270, 25, '#ff6b7a'); text(c, 'Tap or Space to retry', 180, 300, 14); } if (won) { text(c, 'EXIT FOUND!', 180, 270, 25, '#70f0c2'); text(c, 'Tap or Space to run again', 180, 300, 14); } };
    const loop = () => { if (!paused && !dead && !won) { elapsed++; if (k.keys.has('ArrowLeft') || k.keys.has('a')) vx = -4; if (k.keys.has('ArrowRight') || k.keys.has('d')) vx = 4; x = clamp(x + vx, 0, 342); vy += .55; y += vy; let landed = false; for (const platform of platforms) if (vy >= 0 && x + 16 > platform.x && x < platform.x + platform.width && y + 26 >= platform.y && y + 26 <= platform.y + 18) { y = platform.y - 26; vy = 0; landed = true; } if (landed && airborne) { airborne = false; k.fx.burst(x + 9, y + 26, '#70f0c2', 4); services.sound.play('hit'); } if (!landed && y > 540) { dead = true; k.fx.flash('#ff6b7a'); services.sound.play('fail'); } for (const spike of spikes) if (x + 16 > spike.x && x < spike.x + spike.width && y + 26 > spike.y - 13 && y < spike.y + 4) { dead = true; k.fx.flash('#ff6b7a'); services.sound.play('fail'); }
      if (x > 272 && x < 315 && y < 260 && y > 205) { won = true; stage++; k.score(Math.max(10, 600 - Math.floor(elapsed / 3))); services.reportComplete(stage); k.fx.flash('#70f0c2'); services.sound.play('clear'); } k.fx.step(); } draw(); raf = requestAnimationFrame(loop); };
    loop(); return { pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default platformer;
