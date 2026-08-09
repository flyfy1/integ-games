import type { GameModule } from '../../core/game-types';
import { best, keyPrevent, makeFrame, rr, xy } from '../_shared/game-ui';

const FORMS = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]];
const COLORS = ['#59C9FF', '#FFDA74', '#B18CFF', '#6DE0C2', '#6D91FF', '#74E28B', '#FF8195'];
const rotate = (shape: number[][]) => shape[0].map((_, x) => shape.map(row => row[x]).reverse());

export const game: GameModule = {
  meta: { slug: 'block-drop', title: 'Block Drop', category: 'arcade', description: 'Build glowing rows before the well fills.', instructions: 'Use arrows to move and rotate; swipe on the board on touch.', accent: '#8B7CFF', mechanic: 'Rotate, drop, clear' },
  mount(host, services) {
    const frame = makeFrame(host, '#8B7CFF', 'Block Drop'); const { ctx, canvas } = frame; const W = 10, H = 20, S = 30;
    let board: number[][], piece: { form: number[][]; color: number; x: number; y: number }, score: number, lines: number, stopped: boolean, paused = false, raf = 0, last = 0, carry = 0, pointer: { x: number; y: number } | null = null;
    const newPiece = () => ({ form: FORMS[rr(services, FORMS.length)].map(row => [...row]), color: rr(services, COLORS.length), x: 3, y: 0 });
    const valid = (p = piece) => p.form.every((row, y) => row.every((v, x) => !v || (p.x + x >= 0 && p.x + x < W && p.y + y < H && (p.y + y < 0 || !board[p.y + y][p.x + x]))));
    const draw = () => { ctx.fillStyle = '#0C1020'; ctx.fillRect(0, 0, 600, 600); ctx.fillStyle = '#171C31'; ctx.fillRect(150, 0, 300, 600); ctx.strokeStyle = '#ffffff10'; for (let i = 0; i <= W; i++) { ctx.beginPath(); ctx.moveTo(150 + i * S, 0); ctx.lineTo(150 + i * S, 600); ctx.stroke(); } for (let i = 0; i <= H; i++) { ctx.beginPath(); ctx.moveTo(150, i * S); ctx.lineTo(450, i * S); ctx.stroke(); }
      const cell = (x: number, y: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(152 + x * S, 2 + y * S, 26, 26); ctx.fillStyle = '#ffffff38'; ctx.fillRect(155 + x * S, 5 + y * S, 20, 4); }; board.forEach((row, y) => row.forEach((v, x) => { if (v) cell(x, y, COLORS[v - 1]); })); if (!stopped) piece.form.forEach((row, y) => row.forEach((v, x) => { if (v && piece.y + y >= 0) cell(piece.x + x, piece.y + y, COLORS[piece.color]); })); ctx.fillStyle = '#A8B1C5'; ctx.font = '700 15px system-ui'; ctx.fillText('← → MOVE', 18, 94); ctx.fillText('↑ ROTATE', 18, 122); ctx.fillText('↓ SOFT', 18, 150); ctx.fillText('SPACE DROP', 18, 178); frame.setHud(`SCORE ${score} · LINES ${lines} · BEST ${services.storage.get<number>('block-drop-best', 0)}`); };
    const settle = () => { piece.form.forEach((row, y) => row.forEach((v, x) => { if (v && piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.color + 1; })); let cleared = 0; board = board.filter(row => { if (row.every(Boolean)) { cleared++; return false; } return true; }); while (board.length < H) board.unshift(Array(W).fill(0)); if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(lines / 10)); services.sound.play(cleared > 1 ? 'success' : 'merge'); services.reportScore(score); } piece = newPiece(); if (!valid()) { stopped = true; services.sound.play('fail'); frame.setMessage(`Well full — ${score}. Press R to rebuild.`); best(services, 'block-drop-best', score); } draw(); };
    const move = (dx: number, dy: number) => { if (stopped || paused) return; const p = { ...piece, x: piece.x + dx, y: piece.y + dy }; if (valid(p)) { piece = p; services.sound.play('move'); draw(); return true; } if (dy) settle(); return false; };
    const turn = () => { if (paused || stopped) return; const p = { ...piece, form: rotate(piece.form) }; if (valid(p)) { piece = p; services.sound.play('tap'); draw(); } };
    const drop = () => { if (paused || stopped) return; while (move(0, 1)) undefined; };
    const restart = () => { board = Array.from({ length: H }, () => Array(W).fill(0)); score = 0; lines = 0; stopped = false; piece = newPiece(); frame.setMessage('Clear lines to accelerate the drop.'); draw(); };
    const loop = (time: number) => { carry += time - last; last = time; const interval = Math.max(110, 700 - Math.floor(lines / 10) * 60); if (!paused && !stopped && carry > interval) { carry = 0; move(0, 1); } raf = requestAnimationFrame(loop); };
    frame.on(frame.root, 'keydown', ((e: KeyboardEvent) => { keyPrevent(e, ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'r', 'R']); if (e.key === 'ArrowLeft') move(-1, 0); if (e.key === 'ArrowRight') move(1, 0); if (e.key === 'ArrowDown') move(0, 1); if (e.key === 'ArrowUp') turn(); if (e.key === ' ') drop(); if (e.key.toLowerCase() === 'r') restart(); }) as EventListener);
    frame.on(canvas, 'pointerdown', ((e: PointerEvent) => { pointer = xy(canvas, e); canvas.setPointerCapture(e.pointerId); }) as EventListener);
    frame.on(canvas, 'pointerup', ((e: PointerEvent) => { if (!pointer) return; const p = xy(canvas, e), dx = p.x - pointer.x, dy = p.y - pointer.y; if (Math.abs(dx) < 12 && Math.abs(dy) < 12) turn(); else if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0); else if (dy > 0) drop(); else turn(); pointer = null; }) as EventListener);
    restart(); last = performance.now(); raf = requestAnimationFrame(loop);
    return { pause: () => { paused = true; }, resume: () => { paused = false; last = performance.now(); }, restart, destroy: () => { cancelAnimationFrame(raf); frame.destroy(); } };
  },
};
export default game;
