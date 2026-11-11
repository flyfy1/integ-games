import { feelers, legs, legsFront } from './ant';
import { eyes, INK, line, mouth, moodOf, oval, pestLook, shape, shine, type SpriteDraw } from './kit';

/** Cockroach: low, wide, glossy mahogany shell with long feelers; quick and cocky. */
export const roach: SpriteDraw = (ctx, p) => {
  const mood = moodOf(p, 'angry'), bite = p.state === 'bite' && p.frame % 2 === 0;
  if (p.dir === 1) {
    shape(ctx, [-30, -20, -28, -46, -12, -60, 12, -60, 28, -46, 30, -20], '#7c3a1a'); line(ctx, [0, -60, 0, -22], INK, 3);
    shine(ctx, -12, -50, 8, 4, 0.45, -0.3); shine(ctx, 12, -50, 5, 3, 0.3, 0.3);
    legsFront(ctx, -10, 38, p.frame, INK, 4.5);
    feelers(ctx, -8, -30, -34, -78, p.frame, INK, 3.5); feelers(ctx, 8, -30, 34, -78, (p.frame + 4) % 8, INK, 3.5);
    oval(ctx, 0, -22, 18, 15, '#a35a2a');
    eyes(ctx, 0, -25, 7.5, 5.5, { frame: p.frame, mood, state: p.state }, pestLook(p));
    mouth(ctx, 0, -13, 6, mood, bite);
    return;
  }
  legs(ctx, -12, 38, p.frame, INK, 4.5);
  feelers(ctx, -18, -30, -50, -62, p.frame, INK, 3.5); feelers(ctx, -6, -34, -20, -80, (p.frame + 4) % 8, INK, 3.5);
  shape(ctx, [-20, -8, -30, -30, -14, -50, 24, -52, 40, -32, 34, -10, 8, -4], '#7c3a1a');
  line(ctx, [4, -50, 10, -6], INK, 3);
  shine(ctx, 16, -42, 13, 4, 0.45, 0.2); shine(ctx, 26, -30, 5, 2, 0.3, 0.2);
  oval(ctx, -18, -24, 16, 15, '#a35a2a');
  eyes(ctx, -20, -27, 7.5, 5.5, { frame: p.frame, mood, state: p.state }, pestLook(p));
  mouth(ctx, -20, -15, 6, mood, bite);
};
