import { INK, oval, type SpriteDraw } from './kit';

/** Fruit-fly swarm: up to five flies bobbing out of phase, red-eyed and buzzing; the swarm thins as it takes damage. */
const SPOTS: [number, number, number][] = [[0, -52, 0], [-22, -34, 3], [22, -40, 5], [-8, -74, 2], [18, -66, 6]];
export const fruitfly: SpriteDraw = (ctx, p) => {
  const count = p.state === 'dead' ? 2 : Math.max(1, Math.ceil((p.hp ?? 1) * SPOTS.length)), front = p.dir === 1;
  for (let i = 0; i < count; i++) {
    const [x, y, phase] = SPOTS[i], f = (p.frame + phase) % 8, bob = [0, -3, -4, -3, 0, 3, 4, 3][f], flap = f % 2 ? 0.9 : -0.2;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.save(); ctx.globalAlpha *= 0.8;
    oval(ctx, -7, -7, 9, 4.5, '#e8f6ff', INK, 2, -0.7 - flap); oval(ctx, 7, -7, 9, 4.5, '#e8f6ff', INK, 2, 0.7 + flap);
    ctx.restore();
    if (front) {
      oval(ctx, 0, 2, 6.5, 7, '#3e3044', INK, 3);
      oval(ctx, 0, -3, 7, 6, '#4e3e52', INK, 3);
      oval(ctx, -3.2, -3, 2.8, 3, '#ff4d5a', null); oval(ctx, 3.2, -3, 2.8, 3, '#ff4d5a', null);
      oval(ctx, -3.8, -4, 0.9, 0.9, '#ffffff', null); oval(ctx, 2.6, -4, 0.9, 0.9, '#ffffff', null);
    } else {
      oval(ctx, 3, 1, 7.5, 5.5, '#3e3044', INK, 3);
      oval(ctx, -5, 0, 5.8, 5.8, '#4e3e52', INK, 3);
      oval(ctx, -7.5, -1.5, 2.6, 2.8, '#ff4d5a', null); oval(ctx, -3, -2.5, 2.4, 2.6, '#ff4d5a', null);
      oval(ctx, -8, -2.4, 0.9, 0.9, '#ffffff', null);
    }
    ctx.restore();
  }
};
