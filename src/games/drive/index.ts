import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

export const drive: GameModule = {
  meta: { slug: 'drive', title: 'Tiny Wheels', category: 'arcade', description: 'Balance a tiny rover over a hand-drawn test track.', instructions: 'Hold DRIVE to climb and BRAKE to slow; use left and right keys too.', accent: '#ffcb6b', mechanic: 'Physics driving' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'drive', 360, 420);
    let raf = 0, paused = false, crashed = false, distance = 0, speed = 0, input = 0, lean = 0, nextMilestone = 250;
    const ground = (world: number) => 315 - Math.sin(world * .024) * 24 - Math.sin(world * .077) * 17 - Math.sin(world * .14) * Math.min(10, distance / 70);
    const reset = () => { paused = false; crashed = false; distance = 0; speed = 0; input = 0; lean = 0; nextMilestone = 250; k.fx.clear(); };
    const setPedal = (x: number) => { const next = x < 180 ? -1 : 1; if (input === 0) { k.fx.burst(next < 0 ? 89 : 271, 380, '#ffcb6b', 4); services.sound.play('move'); } input = next; };
    k.on('pointerdown', event => setPedal(k.point(event as PointerEvent).x));
    k.on('pointermove', event => { if ((event as PointerEvent).buttons) setPedal(k.point(event as PointerEvent).x); });
    k.on('pointerup', () => { input = 0; }); k.on('pointercancel', () => { input = 0; });
    k.on('keydown', event => { const key = (event as KeyboardEvent).key; if (crashed && (key === ' ' || key === 'Enter')) reset(); if (key === 'ArrowRight' || key === 'd') setPedal(360); if (key === 'ArrowLeft' || key === 'a') setPedal(0); });
    k.on('keyup', () => { input = 0; });
    const draw = () => { const c = k.ctx; k.clear(); c.fillStyle = '#172033'; c.fillRect(0, 0, 360, 420); text(c, `RIDE ${Math.floor(distance)}m`, 180, 27, 15, '#a8b1c5');
      c.beginPath(); c.moveTo(0, ground(distance - 105)); for (let sx = 0; sx <= 360; sx += 4) c.lineTo(sx, ground(distance + sx - 105)); c.lineTo(360, 420); c.lineTo(0, 420); c.fillStyle = '#2f5b65'; c.fill();
      const slope = Math.atan2(ground(distance + 4) - ground(distance - 4), 8); c.save(); c.translate(105, ground(distance) - 20); c.rotate(lean); c.fillStyle = '#ffcb6b'; c.fillRect(-30, -17, 60, 23); c.fillStyle = '#8b7cff'; c.fillRect(-6, -36, 28, 20); c.fillStyle = '#090d18'; c.beginPath(); c.arc(-20, 10, 11, 0, 7); c.arc(21, 10, 11, 0, 7); c.fill(); c.restore();
      c.fillStyle = '#273149'; c.fillRect(10, 352, 158, 56); c.fillRect(192, 352, 158, 56); text(c, 'BRAKE', 89, 386, 15); text(c, 'DRIVE', 271, 386, 15); text(c, `speed ${speed.toFixed(1)}`, 180, 340, 12, '#a8b1c5');
      k.fx.draw(); if (paused) text(c, 'PAUSED', 180, 205, 27); if (crashed) { text(c, 'ROVER ROLLED', 180, 196, 24, '#ff6b7a'); text(c, 'Tap or press Space to ride again', 180, 226, 14); }
      void slope;
    };
    const loop = () => { if (!paused && !crashed) { speed = clamp(speed + input * .045 - speed * .012, -.8, 3.5); distance = Math.max(0, distance + speed); const slope = Math.atan2(ground(distance + 4) - ground(distance - 4), 8); lean += (slope - lean) * .08 + input * .006 * Math.max(0, speed); if (Math.abs(lean) > 1.15 && distance > 45) { crashed = true; k.fx.flash('#ff6b7a'); services.sound.play('fail'); k.score(Math.floor(distance)); }
        if (distance >= nextMilestone) { services.reportComplete(nextMilestone / 250); nextMilestone += 250; k.fx.flash('#ffcb6b'); services.sound.play('upgrade'); } k.fx.step(); } draw(); raf = requestAnimationFrame(loop); };
    loop(); return { pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default drive;
