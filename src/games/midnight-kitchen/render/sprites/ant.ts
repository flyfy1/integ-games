import { eyes, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw, type SpriteParams } from './kit';

type Ctx = CanvasRenderingContext2D;
/** Six wiggling legs under a side-view body centred on x = 0. Shared by the insect sprites. */
export function legs(ctx: Ctx, y: number, reach: number, frame: number, color = INK, width = 4): void {
  const swing = [0, 3, 0, -3][frame % 4];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const s = (i % 2 ? -swing : swing) * side, x = side * (10 + i * 4);
    line(ctx, [x, y - 6 + i * 3, x + side * reach * 0.6, y - 12 + i * 8 + s, x + side * reach, y + 2 + i * 1.5], color, width);
  }
}
/** Six legs splayed left and right for a bug seen from the front (the tall board). */
export function legsFront(ctx: Ctx, y: number, reach: number, frame: number, color = INK, width = 4): void {
  const swing = [0, 3, 0, -3][frame % 4];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const s = (i % 2 ? -swing : swing), x = side * (8 + i * 2), yy = y - 14 + i * 9;
    line(ctx, [x, yy, x + side * reach * 0.62, yy - 10 + s, x + side * reach, yy + 8 + i * 3 + s], color, width);
  }
}
/** Antennae that bob with the frame. */
export function feelers(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, frame: number, color = INK, width = 4): void {
  const bob = [0, 1, 2, 1, 0, -1, -2, -1][frame % 8];
  line(ctx, [x0, y0, x0 + (x1 - x0) * 0.4, y1 + bob, x1, y1 + 4 + bob], color, width);
}

const SHELL = '#8c2f34', DARK = '#5e1c28', HEAD = '#a33a3a';
/** The ant body, side view (facing left) or front view (coming down the screen). */
export function antBody(ctx: Ctx, p: SpriteParams, shell = SHELL, dark = DARK, head = HEAD, scale = 1): void {
  const mood = moodOf(p, p.state === 'bite' ? 'angry' : 'worried'), biting = p.state === 'bite';
  const lunge = biting && p.frame % 2 ? 3 : 0;
  ctx.save(); ctx.scale(scale, scale);
  if (p.dir === 1) {
    // front view: abdomen peeks over the top, head in front
    oval(ctx, 0, -50, 19, 15, dark); shine(ctx, -6, -58, 7, 3, 0.35, 0);
    legsFront(ctx, -14, 30, p.frame);
    oval(ctx, 0, -34, 13, 11, shell);
    feelers(ctx, -6, -40, -20, -68, p.frame); feelers(ctx, 6, -40, 20, -68, (p.frame + 4) % 8);
    oval(ctx, 0, -22 + lunge, 19, 17, head); shine(ctx, -8, -30 + lunge, 6, 3, 0.35, -0.3);
    eyes(ctx, 0, -25 + lunge, 8.5, 6.2, { frame: p.frame, mood, state: p.state }, pestLook(p));
    if (biting) { const open = p.frame % 2 ? 5 : 2; shape(ctx, [-9, -12, -6, -5 + open, -2, -12], INK, null, 0, false); shape(ctx, [9, -12, 6, -5 + open, 2, -12], INK, null, 0, false); }
    else mouth(ctx, 0, -12 + lunge, 6, mood);
  } else {
    legs(ctx, -14, 30, p.frame);
    oval(ctx, 10, -50, 20, 17, dark); shine(ctx, 14, -60, 8, 3, 0.35, 0.2);
    oval(ctx, 3, -35, 14, 12, shell);
    feelers(ctx, -12, -40, -30, -66, p.frame); feelers(ctx, 2, -42, 14, -72, (p.frame + 4) % 8);
    oval(ctx, -6 - lunge, -24, 19, 17, head); shine(ctx, -12 - lunge, -32, 6, 3, 0.35, -0.3);
    eyes(ctx, -8 - lunge, -27, 8.5, 6.2, { frame: p.frame, mood, state: p.state }, pestLook(p));
    if (biting) { const open = p.frame % 2 ? 5 : 2; shape(ctx, [-18 - lunge, -14, -14 - lunge, -8 + open, -9 - lunge, -14], INK, null, 0, false); shape(ctx, [-6 - lunge, -14, -10 - lunge, -8 + open, -1 - lunge, -14], INK, null, 0, false); }
    else mouth(ctx, -8, -14, 6, mood);
  }
  ctx.restore();
}
/** Ant: three round segments in deep cherry, big worried eyes. */
export const ant: SpriteDraw = (ctx, p) => antBody(ctx, p);

/** Crumb-Shield Ant: the same ant (darker) behind a biscuit crumb that cracks as the shield wears down. */
export const shieldant: SpriteDraw = (ctx, p) => {
  antBody(ctx, p, '#7a2a3e', '#4e1a2c', '#94364a');
  const left = p.shield ?? 1;
  if (left <= 0) return;
  ctx.save();
  if (p.dir === 1) ctx.translate(30, 18);
  shape(ctx, [-44, -8, -48, -36, -38, -58, -18, -62, -8, -40, -12, -10, -28, -2], '#e8bd74');
  shine(ctx, -36, -44, 4, 8, 0.4, 0.2);
  for (const [x, y] of [[-32, -46], [-22, -28], [-36, -22], [-26, -12]]) oval(ctx, x, y, 2.6, 2.6, '#b98742', null);
  if (left < 0.7) line(ctx, [-40, -52, -30, -40, -34, -30], INK, 3);
  if (left < 0.4) line(ctx, [-14, -44, -24, -34, -18, -22, -26, -10], INK, 3);
  ctx.restore();
};
