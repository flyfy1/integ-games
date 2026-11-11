import { blush, box, eyes, INK, line, mouth, moodOf, oval, shape, shine, wisp, type SpriteDraw } from './kit';

/**
 * The blue-flowered casserole dish, filled with stew. `reveal` 0..1 is how much warm stew shows above the rim.
 * Shared by the Bloom (mostly hidden under mold) and Stew (the dish remembered).
 */
export function stewPot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, reveal: number, frame: number): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // handles
  box(ctx, -66, -46, 18, 12, 6, '#f4f0e6'); box(ctx, 48, -46, 18, 12, 6, '#f4f0e6');
  // body
  shape(ctx, [-56, -56, -54, -18, -40, -2, 40, -2, 54, -18, 56, -56], '#f4f0e6');
  shine(ctx, -40, -40, 5, 12, 0.6, 0.1);
  // blue flowers
  for (const [fx, fy] of [[-30, -30], [0, -24], [30, -30]]) {
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; oval(ctx, fx + Math.cos(a) * 5, fy + Math.sin(a) * 5, 4, 4, '#4f7fd0', null); }
    oval(ctx, fx, fy, 2.5, 2.5, '#ffd24a', null);
  }
  line(ctx, [-54, -48, 54, -48], '#4f7fd0', 3);
  // rim and stew
  oval(ctx, 0, -56, 58, 12, '#e6dfd0');
  if (reveal > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, reveal * 1.5);
    oval(ctx, 0, -57, 50, 8, '#c4622e', null);
    for (const [cx, cy, c] of [[-24, -58, '#ff9a3a'], [10, -56, '#f3dca0'], [28, -59, '#ff9a3a'], [-6, -60, '#7cc46a']] as const) oval(ctx, cx, cy, 6, 3.5, c, INK, 2);
    ctx.restore();
  }
  void frame;
  ctx.restore();
}

/** Stew: the Bloom's true face — a warm pot of the family's stew, steaming gently, kind and a little shy. */
export const stew: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'happy');
  ctx.save(); ctx.translate(0, -2); ctx.scale(0.72, 0.72);
  stewPot(ctx, 0, 0, 1, 1, p.frame);
  for (const [x, f] of [[-22, 0], [4, 3], [26, 5]] as const) wisp(ctx, x, -66, 22, (p.frame + f) % 8, '#ffffff', 0.75);
  eyes(ctx, 0, -32, 16, 8, { frame: p.frame, mood, state: p.state }, [0, 0.1]);
  mouth(ctx, 0, -14, 10, mood);
  blush(ctx, 0, -20, 30, 7, '#ff9a8a', 0.6);
  shine(ctx, 36, -44, 4, 8, 0.4, 0);
  ctx.restore();
};
