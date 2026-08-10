import type { GameModule } from '../../core/game-types';
import { best, keyPrevent, makeFrame, rr, xy } from '../_shared/game-ui';

export const snakeCollision = (snake: ReadonlyArray<readonly [number, number]>, head: readonly [number, number], eating: boolean) =>
  (eating ? snake : snake.slice(0, -1)).some(([x, y]) => x === head[0] && y === head[1]);

export const game: GameModule = {
  meta: { slug: 'snake', title: 'Neon Snake', category: 'arcade', description: 'Guide a growing neon trail through a tiny starfield.', instructions: 'Swipe or use arrow keys to eat sparks; avoid your own trail.', accent: '#70F0C2', mechanic: 'Grow, turn, survive' },
  mount(host, services) {
    const frame = makeFrame(host, '#70F0C2', 'Neon Snake'); const { ctx, canvas } = frame;
    const cells = 20, unit = 30; let snake: Array<[number, number]>, food: [number, number], direction: [number, number], queued: [number, number], score: number, dead: boolean, paused = false, raf = 0, last = 0, carry = 0, pickupPulse = 0, down: { x: number; y: number } | null = null;
    const spawn = () => { let p: [number, number]; do p = [rr(services, cells), rr(services, cells)]; while (snake.some(([x, y]) => x === p[0] && y === p[1])); return p; };
    const restart = () => { mobile?.clear(); services.sound.stop(); paused = false; snake = [[10, 11], [9, 11], [8, 11]]; direction = [1, 0]; queued = [1, 0]; food = spawn(); score = 0; dead = false; carry = 0; frame.setMessage('Collect the mint sparks.'); draw(); };
    const change = (next: [number, number]) => { if (!paused && !dead && next[0] !== -direction[0] && next[1] !== -direction[1] && (queued[0] !== next[0] || queued[1] !== next[1])) { queued = next; services.sound.play('move'); } };
    const tick = () => { if (dead || paused) return; direction = queued; const head: [number, number] = [snake[0][0] + direction[0], snake[0][1] + direction[1]], eating = head[0] === food[0] && head[1] === food[1]; if (head[0] < 0 || head[0] >= cells || head[1] < 0 || head[1] >= cells || snakeCollision(snake, head, eating)) { dead = true; services.sound.play('fail'); const record = best(services, 'snake-best', score); services.reportScore(score); frame.setMessage(`Signal lost — ${score} points. Best ${record}. Press R to retry.`); return; } snake.unshift(head); if (eating) { pickupPulse = 1; score += 10; food = spawn(); services.sound.play('collect'); services.reportScore(score); } else snake.pop(); draw(); };
    const draw = () => { ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, 600, 600); ctx.strokeStyle = '#70F0C212'; ctx.lineWidth = 1; for (let i = 0; i <= cells; i++) { ctx.beginPath(); ctx.moveTo(i * unit, 0); ctx.lineTo(i * unit, 600); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * unit); ctx.lineTo(600, i * unit); ctx.stroke(); }
      ctx.fillStyle = '#FFDD70'; ctx.beginPath(); ctx.arc(food[0] * unit + 15, food[1] * unit + 15, 9, 0, Math.PI * 2); ctx.fill(); snake.slice().reverse().forEach(([x, y], i) => { ctx.fillStyle = i === snake.length - 1 ? '#70F0C2' : '#38b997'; ctx.fillRect(x * unit + 3, y * unit + 3, 24, 24); }); const [hx, hy] = snake[0]; if (pickupPulse) { ctx.strokeStyle = `rgba(112,240,194,${pickupPulse})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hx * unit + 15, hy * unit + 15, 13 + (1 - pickupPulse) * 24, 0, Math.PI * 2); ctx.stroke(); } ctx.fillStyle = '#07130f'; ctx.fillRect(hx * unit + 8 + direction[0] * 4, hy * unit + 8 + direction[1] * 4, 4, 4); frame.setHud(`SCORE ${score} · BEST ${services.storage.get<number>('snake-best', 0)}`); };
    const loop = (time: number) => { const delta = time - last; last = time; if (!paused && !dead) { carry += delta; const speed = Math.max(72, 155 - Math.floor(score / 50) * 10); while (carry >= speed) { carry -= speed; tick(); } if (pickupPulse) { pickupPulse *= .84; draw(); } } raf = requestAnimationFrame(loop); };
    frame.on(frame.root, 'keydown', ((e: KeyboardEvent) => { keyPrevent(e, ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'r', 'R']); if (e.key === 'ArrowUp') change([0, -1]); if (e.key === 'ArrowDown') change([0, 1]); if (e.key === 'ArrowLeft') change([-1, 0]); if (e.key === 'ArrowRight') change([1, 0]); if (e.key.toLowerCase() === 'r') restart(); }) as EventListener);
    frame.on(canvas, 'pointerdown', ((e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); down = xy(canvas, e); }) as EventListener);
    frame.on(canvas, 'pointerup', ((e: PointerEvent) => { if (!down) return; const p = xy(canvas, e), dx = p.x - down.x, dy = p.y - down.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) change(Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : -1, 0] : [0, dy > 0 ? 1 : -1]); down = null; }) as EventListener);
    const mobile = frame.controls('snake'); restart(); last = performance.now(); raf = requestAnimationFrame(loop);
    return { pause: () => { paused = true; mobile?.clear(); services.sound.stop(); frame.setMessage('Paused'); }, resume: () => { paused = false; last = performance.now(); frame.setMessage(''); }, restart, destroy: () => { cancelAnimationFrame(raf); services.sound.stop(); frame.destroy(); } };
  },
};
export default game;
