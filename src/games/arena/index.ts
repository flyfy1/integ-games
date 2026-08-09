import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

type Mob = { x: number; y: number; hp: number };
type Stick = { x: number; y: number; dx: number; dy: number } | null;

export const arena: GameModule = {
  meta: { slug: 'arena', title: 'Pocket Survivor', category: 'action', description: 'Survive a pocket swarm and choose your evolution.', instructions: 'Move with WASD, arrows, or the virtual stick; choose an upgrade each level.', accent: '#70f0c2', mechanic: 'Move, auto-attack, choose upgrades' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'arena');
    let raf = 0, paused = false, dead = false, upgrading = false, score = 0, hp = 5, maxHp = 5, px = 180, py = 280, level = 1, xp = 0, power = 1, speed = 3.4, frames = 0;
    let stick: Stick = null, mobs: Mob[] = [];
    const reset = () => { paused = false; dead = false; upgrading = false; score = 0; hp = 5; maxHp = 5; px = 180; py = 280; level = 1; xp = 0; power = 1; speed = 3.4; frames = 0; stick = null; mobs = []; };
    const choose = (choice: number) => { if (!upgrading) return; if (choice === 0) power++; if (choice === 1) speed += .45; if (choice === 2) { maxHp++; hp = maxHp; } upgrading = false; services.reportComplete(level); services.sound.play('merge'); };
    k.on('pointerdown', event => { const point = k.point(event as PointerEvent); if (dead) { reset(); return; } if (upgrading) { choose(clamp(Math.floor(point.x / 120), 0, 2)); return; } stick = { x: point.x, y: point.y, dx: 0, dy: 0 }; });
    k.on('pointermove', event => { if (stick) { const point = k.point(event as PointerEvent); stick.dx = clamp((point.x - stick.x) / 36, -1, 1); stick.dy = clamp((point.y - stick.y) / 36, -1, 1); } });
    k.on('pointerup', () => { stick = null; }); k.on('pointercancel', () => { stick = null; });
    k.on('keydown', event => { const key = (event as KeyboardEvent).key; if (dead && (key === ' ' || key === 'Enter' || key === 'r')) { reset(); return; } if (upgrading && key >= '1' && key <= '3') choose(Number(key) - 1); });
    const draw = () => { const c = k.ctx; k.clear(); c.fillStyle = '#0d1b22'; c.fillRect(0, 0, 360, 560); for (let n = 0; n < 18; n++) { c.fillStyle = '#ffffff12'; c.fillRect((n * 83) % 360, (n * 137) % 560, 2, 2); } text(c, `WAVE ${level}   KILLS ${score}`, 180, 27, 15, '#a8b1c5'); c.fillStyle = '#273149'; c.fillRect(18, 42, 120, 8); c.fillStyle = '#ff6b7a'; c.fillRect(18, 42, 120 * hp / maxHp, 8);
      mobs.forEach(mob => { c.fillStyle = '#ff6b7a'; c.beginPath(); c.arc(mob.x, mob.y, 12, 0, 7); c.fill(); }); c.strokeStyle = '#70f0c2'; c.globalAlpha = .25; c.beginPath(); c.arc(px, py, 58, 0, 7); c.stroke(); c.globalAlpha = 1; c.fillStyle = '#70f0c2'; c.beginPath(); c.arc(px, py, 14, 0, 7); c.fill();
      c.strokeStyle = '#70f0c2'; c.lineWidth = 3; c.globalAlpha = stick ? .8 : .25; c.beginPath(); c.arc(55, 495, 35, 0, 7); c.stroke(); if (stick) { c.beginPath(); c.arc(55 + stick.dx * 19, 495 + stick.dy * 19, 12, 0, 7); c.stroke(); } c.globalAlpha = 1;
      if (paused) text(c, 'PAUSED', 180, 280, 27); if (dead) { text(c, 'SWARMED', 180, 270, 27, '#ff6b7a'); text(c, 'Tap or press Space to survive again', 180, 300, 15); } if (upgrading) { c.fillStyle = '#090d18ee'; c.fillRect(0, 150, 360, 185); text(c, 'CHOOSE AN UPGRADE', 180, 186, 18, '#f7f9ff'); [['POWER', '+ pulse damage'], ['HASTE', '+ move speed'], ['REPAIR', 'heal to full']].forEach(([title, sub], index) => { c.fillStyle = '#273149'; c.fillRect(index * 120 + 8, 210, 104, 92); text(c, `${index + 1}  ${title}`, index * 120 + 60, 244, 13, '#70f0c2'); text(c, sub, index * 120 + 60, 274, 11, '#a8b1c5'); }); }
    };
    const loop = () => { if (!paused && !dead && !upgrading) { frames++; let dx = 0, dy = 0; if (k.keys.has('ArrowLeft') || k.keys.has('a')) dx--; if (k.keys.has('ArrowRight') || k.keys.has('d')) dx++; if (k.keys.has('ArrowUp') || k.keys.has('w')) dy--; if (k.keys.has('ArrowDown') || k.keys.has('s')) dy++; if (stick) { dx += stick.dx; dy += stick.dy; } const magnitude = Math.hypot(dx, dy) || 1; px = clamp(px + dx / magnitude * speed, 14, 346); py = clamp(py + dy / magnitude * speed, 62, 546);
        const spawnEvery = Math.max(15, 68 - level * 4); if (frames % spawnEvery === 0) { const edge = Math.floor(services.random() * 4); mobs.push({ x: edge < 2 ? (edge ? 360 : 0) : services.random() * 360, y: edge < 2 ? services.random() * 560 : (edge === 2 ? 0 : 560), hp: 1 + Math.floor(level / 3) }); }
        mobs.forEach(mob => { const distance = Math.hypot(px - mob.x, py - mob.y) || 1; mob.x += (px - mob.x) / distance * (.48 + level * .045); mob.y += (py - mob.y) / distance * (.48 + level * .045); if (distance < 58 && frames % 13 === 0) { mob.hp -= power; if (mob.hp <= 0) { score++; xp++; k.score(score); services.sound.play('success'); } } if (distance < 22 && frames % 25 === 0) hp -= .25; }); mobs = mobs.filter(mob => mob.hp > 0); if (xp >= level * 8) { xp = 0; level++; upgrading = true; services.sound.play('tap'); } if (hp <= 0) { dead = true; services.sound.play('fail'); } } draw(); raf = requestAnimationFrame(loop); };
    loop(); return { pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default arena;
