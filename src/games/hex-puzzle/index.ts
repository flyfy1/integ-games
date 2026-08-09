import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

type Cell = { q: number; r: number; on: boolean };
type Shape = ReadonlyArray<readonly [number, number]>;
const shapes: Shape[] = [ [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2]] ];

export const hexPuzzle: GameModule = {
  meta: { slug: 'hex-puzzle', title: 'Hexa Fit', category: 'puzzle', description: 'Fit shifting hex fragments and clear radiant axes.', instructions: 'Tap a tray piece, then a board cell; use 1–3, arrows, and Space.', accent: '#8b7cff', mechanic: 'Place pieces and clear lines' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'hex-puzzle');
    let raf = 0, paused = false, gameover = false, score = 0, round = 1, selected = -1, cursor = { q: 3, r: 3 };
    let cells: Cell[] = [], pieces: Array<Shape | null> = [];
    const at = (q: number, r: number) => cells.find(cell => cell.q === q && cell.r === r);
    const pos = (q: number, r: number) => ({ x: 72 + q * 31 + (r % 2) * 15, y: 100 + r * 27 });
    const makeTray = () => { pieces = [0, 1, 2].map(() => shapes[Math.floor(services.random() * Math.min(shapes.length, 3 + round))]); };
    const canPlace = (shape: Shape, q: number, r: number) => shape.every(([dq, dr]) => { const target = at(q + dq, r + dr); return Boolean(target && !target.on); });
    const hasMove = () => pieces.some(shape => shape && cells.some(cell => canPlace(shape, cell.q, cell.r)));
    const reset = () => { paused = false; gameover = false; score = 0; round = 1; selected = -1; cursor = { q: 3, r: 3 }; cells = []; for (let r = 0; r < 7; r++) for (let q = 0; q < 7; q++) cells.push({ q, r, on: false }); makeTray(); };
    const place = (q: number, r: number) => { const shape = pieces[selected]; if (gameover || !shape) return; if (!canPlace(shape, q, r)) { services.sound.play('fail'); return; } shape.forEach(([dq, dr]) => { at(q + dq, r + dr)!.on = true; }); pieces[selected] = null; selected = -1; score += shape.length; k.score(score); services.sound.play('move');
      let cleared = 0; for (let row = 0; row < 7; row++) { const line = cells.filter(cell => cell.r === row); if (line.every(cell => cell.on)) { line.forEach(cell => { cell.on = false; }); cleared++; } } for (let col = 0; col < 7; col++) { const line = cells.filter(cell => cell.q === col); if (line.every(cell => cell.on)) { line.forEach(cell => { cell.on = false; }); cleared++; } }
      if (cleared) { score += cleared * 14 * round; k.score(score); services.sound.play('success'); } if (pieces.every(piece => !piece)) { round++; makeTray(); services.reportComplete(round); } if (!hasMove()) { gameover = true; services.sound.play('fail'); }
    };
    const nearest = (x: number, y: number) => cells.reduce((best, cell) => Math.hypot(pos(cell.q, cell.r).x - x, pos(cell.q, cell.r).y - y) < Math.hypot(pos(best.q, best.r).x - x, pos(best.q, best.r).y - y) ? cell : best, cells[0]);
    k.on('pointerdown', event => { if (paused) return; const point = k.point(event as PointerEvent); if (gameover) { reset(); return; } if (point.y > 420) { const index = clamp(Math.floor(point.x / 120), 0, 2); if (pieces[index]) { selected = index; services.sound.play('tap'); } return; } const cell = nearest(point.x, point.y); cursor = { q: cell.q, r: cell.r }; place(cell.q, cell.r); });
    k.on('keydown', event => { if (paused) return; const key = (event as KeyboardEvent).key; if (gameover && (key === ' ' || key === 'Enter' || key === 'r')) { reset(); return; } if (key >= '1' && key <= '3') selected = pieces[Number(key) - 1] ? Number(key) - 1 : selected; if (key === 'ArrowLeft' || key === 'a') cursor.q = clamp(cursor.q - 1, 0, 6); if (key === 'ArrowRight' || key === 'd') cursor.q = clamp(cursor.q + 1, 0, 6); if (key === 'ArrowUp' || key === 'w') cursor.r = clamp(cursor.r - 1, 0, 6); if (key === 'ArrowDown' || key === 's') cursor.r = clamp(cursor.r + 1, 0, 6); if (key === ' ' || key === 'Enter') place(cursor.q, cursor.r); });
    const hex = (x: number, y: number, fill: string, stroke?: string) => { const c = k.ctx; c.fillStyle = fill; c.beginPath(); for (let i = 0; i < 6; i++) { const angle = Math.PI / 3 * i + Math.PI / 6; if (i) c.lineTo(x + 14 * Math.cos(angle), y + 14 * Math.sin(angle)); else c.moveTo(x + 14 * Math.cos(angle), y + 14 * Math.sin(angle)); } c.closePath(); c.fill(); if (stroke) { c.strokeStyle = stroke; c.stroke(); } };
    const draw = () => { const c = k.ctx; k.clear(); c.fillStyle = '#14142b'; c.fillRect(0, 0, 360, 560); text(c, `FIT ${score}  ·  ROUND ${round}`, 180, 27, 14, '#a8b1c5'); cells.forEach(cell => { const point = pos(cell.q, cell.r); hex(point.x, point.y, cell.on ? '#8b7cff' : '#273149', cell.q === cursor.q && cell.r === cursor.r ? '#70f0c2' : undefined); });
      for (let i = 0; i < 3; i++) { c.fillStyle = selected === i ? '#70f0c2' : '#273149'; c.fillRect(i * 120 + 8, 440, 104, 80); const shape = pieces[i]; if (shape) shape.forEach(([q, r]) => hex(i * 120 + 38 + q * 24, 470 + r * 21, '#ffcb6b')); text(c, String(i + 1), i * 120 + 102, 505, 12, '#a8b1c5'); } if (paused) text(c, 'PAUSED', 180, 280, 27); if (gameover) { text(c, 'NO FITS LEFT', 180, 280, 24, '#ff6b7a'); text(c, 'Tap or press Space to restart', 180, 310, 14); } };
    const loop = () => { draw(); raf = requestAnimationFrame(loop); }; loop(); return { pause: () => { paused = true; }, resume: () => { paused = false; }, restart: reset, destroy: () => { cancelAnimationFrame(raf); k.dispose(); } };
  }
};
export default hexPuzzle;
