import { box, eyes, moodOf, mouth, oval, shape, shine, type SpriteDraw } from './kit';

/** Pip, the leftover rice ball sous-chef: a triangular onigiri with a nori wrap and a tiny chef's hat. */
export const pip: SpriteDraw = (ctx, p) => {
  oval(ctx, -14, -3, 9, 5, '#fff7ea'); oval(ctx, 14, -3, 9, 5, '#fff7ea');
  shape(ctx, [-40, -6, -42, -26, -10, -74, 10, -74, 42, -26, 40, -6], '#fffaf0');
  for (const [x, y] of [[-20, -30], [18, -40], [0, -58], [26, -18], [-28, -14]]) oval(ctx, x, y, 3, 2, '#efe6d2', null, 0, 0.5);
  box(ctx, -17, -24, 34, 22, 4, '#2f3b34');
  shine(ctx, -18, -48, 5, 8, 0.5, 0.5);
  eyes(ctx, 0, -42, 12, 7, p, [0.1, 0]);
  mouth(ctx, 0, -30, 7, moodOf(p, 'happy'));
  oval(ctx, -22, -36, 5, 3, '#ffb3ba', null); oval(ctx, 22, -36, 5, 3, '#ffb3ba', null);
  // hat
  box(ctx, -13, -84, 26, 10, 3, '#ffffff'); oval(ctx, -9, -90, 8, 8, '#ffffff'); oval(ctx, 9, -90, 8, 8, '#ffffff'); oval(ctx, 0, -95, 9, 9, '#ffffff');
  box(ctx, -11, -86, 22, 8, 2, '#ffffff', null);
};
