import type { BoardLayout } from './layout';
import { ENTRY_CELLS } from './layout';

/**
 * Ambient life per chapter, purely decorative and cheap (a couple of dozen dots and strokes, no gradients):
 * dust motes in the moonbeam (countertop), drips and ripples (sink), heat shimmer and sparks (stove), moths around
 * the pantry bulb, drifting frost (fridge). With reduced motion nothing moves and nothing is drawn.
 */
type Mote = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; phase: number };
export type AmbientKind = 'dust' | 'drips' | 'heat' | 'moths' | 'frost';

export class Ambient {
  private motes: Mote[] = [];
  private ripples: { x: number; y: number; life: number }[] = [];
  private seed = 9;
  private t = 0;
  constructor(private reduced: boolean) {}
  private rand(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  clear(): void { this.motes = []; this.ripples = []; }

  update(dt: number, L: BoardLayout | null, kind: AmbientKind): void {
    if (this.reduced || !L) return;
    this.t += dt;
    const target = kind === 'moths' ? 3 : kind === 'drips' ? 3 : kind === 'heat' ? 14 : 22;
    while (this.motes.length < target) this.motes.push(this.spawn(L, kind, true));
    for (const m of this.motes) {
      m.life -= dt;
      if (kind === 'moths') {
        // circle a point above the entry like moths round a bulb
        m.phase += dt * (2.2 + m.size * 0.2);
        const c = this.bulb(L), rr = L.unit * (0.35 + m.size * 0.05);
        m.x = c.x + Math.cos(m.phase) * rr * 1.4; m.y = c.y + Math.sin(m.phase * 1.3) * rr * 0.7;
      } else { m.x += m.vx * dt; m.y += m.vy * dt; m.vx += Math.sin(this.t * 1.3 + m.phase) * dt * 4; }
      if (kind === 'drips' && m.vy > 0 && m.y > m.phase) { this.ripples.push({ x: m.x, y: m.y, life: 0.7 }); m.life = 0; }
    }
    for (const r of this.ripples) r.life -= dt;
    this.ripples = this.ripples.filter(r => r.life > 0);
    for (let i = 0; i < this.motes.length; i++) if (this.motes[i].life <= 0) this.motes[i] = this.spawn(L, kind, false);
  }

  private bulb(L: BoardLayout): { x: number; y: number } {
    const p = L.point(L.cols + ENTRY_CELLS * 0.5, (L.lanes - 1) / 2);
    return L.vertical ? { x: L.field.x + L.field.w * 0.78, y: p.y } : { x: p.x, y: L.field.y + L.field.h * 0.18 };
  }

  private spawn(L: BoardLayout, kind: AmbientKind, initial: boolean): Mote {
    const f = L.field, r = () => this.rand();
    const life = 3 + r() * 4;
    switch (kind) {
      case 'drips': {
        const lane = Math.floor(r() * L.lanes), x = 1 + r() * (L.cols - 1), p = L.point(x, lane);
        return { x: p.x + (r() - 0.5) * L.across * 0.5, y: f.y - 10 - r() * 60, vx: 0, vy: 180 + r() * 60, life: 6, max: 6, size: 2.2, phase: p.y };
      }
      case 'heat': {
        const p = L.point(L.cols + ENTRY_CELLS * 0.3 - r() * L.cols * 0.9, r() * (L.lanes - 1));
        return { x: p.x, y: p.y, vx: (r() - 0.5) * 6, vy: -14 - r() * 18, life: initial ? r() * 3 : 2 + r() * 2, max: 4, size: 1 + r() * 1.6, phase: r() * 6 };
      }
      case 'frost': return { x: f.x + r() * f.w, y: f.y + (initial ? r() * f.h : -6), vx: (r() - 0.5) * 10, vy: 8 + r() * 12, life: initial ? r() * life : life + 4, max: life + 4, size: 1 + r() * 1.8, phase: r() * 6 };
      case 'moths': return { x: 0, y: 0, vx: 0, vy: 0, life: 1e9, max: 1e9, size: r() * 3, phase: r() * 6 };
      default: return { x: f.x + r() * f.w, y: f.y + r() * f.h, vx: (r() - 0.5) * 6, vy: -3 - r() * 5, life: initial ? r() * life : life, max: life, size: 0.8 + r() * 1.5, phase: r() * 6 };
    }
  }

  draw(ctx: CanvasRenderingContext2D, L: BoardLayout | null, kind: AmbientKind): void {
    if (this.reduced || !L) return;
    if (kind === 'moths') {
      const c = this.bulb(L), s = Math.max(5, L.unit * 0.09);
      // the bare bulb
      ctx.fillStyle = 'rgba(255,220,140,0.22)'; ctx.beginPath(); ctx.arc(c.x, c.y, s * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x, Math.max(0, c.y - L.unit * 1.2)); ctx.stroke();
      ctx.fillStyle = '#fff2b8'; ctx.beginPath(); ctx.arc(c.x, c.y, s, 0, Math.PI * 2); ctx.fill();
    }
    for (const m of this.motes) {
      const k = Math.min(1, m.life / Math.max(0.01, m.max) * 3, (m.max - m.life) * 2);
      switch (kind) {
        case 'drips':
          ctx.fillStyle = 'rgba(200,235,255,0.8)'; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.size, m.size * 1.6, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'heat':
          ctx.globalAlpha = Math.max(0, k) * 0.7; ctx.fillStyle = m.size > 2 ? '#ffb454' : 'rgba(255,220,180,0.6)';
          ctx.fillRect(m.x, m.y, m.size, m.size * 1.8); break;
        case 'frost':
          ctx.globalAlpha = Math.max(0, k) * 0.85; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2); ctx.fill(); break;
        case 'moths': {
          const flap = Math.abs(Math.sin(this.t * 22 + m.phase)) * 4 + 1;
          ctx.fillStyle = 'rgba(230,215,240,0.9)'; ctx.beginPath(); ctx.ellipse(m.x - 2.5, m.y, flap, 2.5, 0.4, 0, Math.PI * 2); ctx.ellipse(m.x + 2.5, m.y, flap, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#4a3a5a'; ctx.fillRect(m.x - 0.8, m.y - 2, 1.6, 4); break;
        }
        default:
          ctx.globalAlpha = Math.max(0, k) * 0.55; ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const r of this.ripples) {
      const k = 1 - r.life / 0.7;
      ctx.strokeStyle = `rgba(210,240,255,${(1 - k) * 0.7})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 3 + k * 12, (3 + k * 12) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
