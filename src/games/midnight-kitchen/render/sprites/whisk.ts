import { aimed, arc, box, crest, eyes, line, lookOf, mouth, moodOf, oval, shine, type SpriteDraw } from './kit';

/**
 * Whisk: a wooden handle with a wire balloon held out toward the pests. The wires blur and widen while it spins.
 * Tier 2: chrome wires and a red grip band; tier 3: golden wires, dark wood and a crest.
 */
export const whisk: SpriteDraw = (ctx, p) => {
  const wire = ['#c9ccd6', '#eef1f6', '#f0c04a'][p.tier], wood = ['#c27d45', '#b8743f', '#6e4026'][p.tier], spin = p.act > 0, loops = 3 + p.tier;
  const mood = moodOf(p, spin ? 'angry' : 'neutral'), vertical = p.dir === 1;
  const balloon = () => aimed(ctx, p, vertical ? 10 : 8, vertical ? -46 : -44, () => {
    if (vertical) ctx.scale(0.82, 0.82);
    for (let i = 0; i < loops; i++) {
      const k = (i + (spin ? p.frame * 0.5 + p.act * 0.33 : 0)) / loops * Math.PI, ry = Math.abs(Math.cos(k)) * 30 + 3;
      ctx.beginPath(); ctx.ellipse(24, 0, 26 + p.tier * 3, ry, 0, 0, Math.PI * 2); ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(24, 0, 26 + p.tier * 3, ry, 0, 0, Math.PI * 2); ctx.strokeStyle = wire; ctx.lineWidth = 3; ctx.stroke();
    }
    if (spin) { arc(ctx, 24, 0, 42, -1, 0.2, '#ffffff', 3); arc(ctx, 24, 0, 42, 2.1, 3.3, '#ffffff', 3); }
  });
  if (vertical) balloon();
  oval(ctx, -12, -3, 16, 5, '#5a3420');
  box(ctx, -26, -78, 28, 76, 12, wood);
  shine(ctx, -20, -50, 3, 18, 0.3, 0);
  box(ctx, -28, -34, 32, 8, 3, p.tier === 1 ? '#e0575b' : wire);
  eyes(ctx, -12, -56, 7.5, 5.5, { frame: p.frame, mood, state: p.state }, lookOf(p));
  mouth(ctx, -12, -43, 7, mood === 'angry' ? 'neutral' : mood, spin);
  line(ctx, [-12, -78, -12, -86], '#2a1810', 5); oval(ctx, -12, -88, 5, 5, '#5a3420');
  if (p.tier === 2) crest(ctx, -12, -14, 0.7);
  if (!vertical) balloon();
};
