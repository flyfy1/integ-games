/**
 * Night lighting, done cheaply. A quarter-resolution light map is filled with the chapter's night tint, then
 * light "holes" are punched with one pre-rendered radial stamp (destination-out); warm pools are the same kind of
 * stamp added on top with `lighter`. Nothing creates a gradient per frame.
 *
 * Dawn: `dawn` 0..1 (the wave bar) thins the night and warms the window side; a won night runs it to a sunrise.
 * Defeat cools and dims the board around the cake. No full-canvas flashes in any of it.
 */
export type LightSource = { x: number; y: number; r: number; strength: number; warm?: number; color?: 'warm' | 'cool' | 'mold' | 'pink' | 'gold' };

const STAMP = 128;
function radial(inner: string, outer: string, mid?: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = STAMP;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(STAMP / 2, STAMP / 2, 0, STAMP / 2, STAMP / 2, STAMP / 2);
    g.addColorStop(0, inner); if (mid) g.addColorStop(0.45, mid); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, STAMP, STAMP);
  }
  return c;
}

export class Lighting {
  private map: HTMLCanvasElement | null = null;
  private hole = radial('rgba(0,0,0,1)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)');
  private pools: Record<string, HTMLCanvasElement> = {
    warm: radial('rgba(255,170,70,0.55)', 'rgba(255,150,60,0)', 'rgba(255,150,60,0.2)'),
    cool: radial('rgba(150,200,255,0.45)', 'rgba(150,200,255,0)', 'rgba(150,200,255,0.15)'),
    mold: radial('rgba(110,230,190,0.45)', 'rgba(110,230,190,0)', 'rgba(110,230,190,0.14)'),
    pink: radial('rgba(255,170,200,0.5)', 'rgba(255,170,200,0)', 'rgba(255,170,200,0.18)'),
    gold: radial('rgba(255,215,120,0.6)', 'rgba(255,215,120,0)', 'rgba(255,215,120,0.22)')
  };
  /** A soft dark blob for unit shadows (drawn squashed). */
  readonly shadow = radial('rgba(16,8,24,0.6)', 'rgba(16,8,24,0)', 'rgba(16,8,24,0.42)');
  private dawnWash: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private size = { w: 0, h: 0, vertical: false };
  private readonly scale = 0.25;

  resize(w: number, h: number, vertical: boolean): void {
    this.size = { w, h, vertical };
    this.map = document.createElement('canvas');
    this.map.width = Math.max(1, Math.ceil(w * this.scale)); this.map.height = Math.max(1, Math.ceil(h * this.scale));
    // dawn comes in through the window above the board: a warm wash from the top edge
    this.dawnWash = document.createElement('canvas'); this.dawnWash.width = 4; this.dawnWash.height = 128;
    const d = this.dawnWash.getContext('2d');
    if (d) { const g = d.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,170,110,0.9)'); g.addColorStop(0.45, 'rgba(255,200,150,0.35)'); g.addColorStop(1, 'rgba(255,220,180,0)'); d.fillStyle = g; d.fillRect(0, 0, 4, 128); }
    this.vignette = radial('rgba(0,0,0,0)', 'rgba(6,8,24,0.75)', 'rgba(0,0,0,0)');
  }

  /** Soft contact shadow under a unit: one stamp, squashed. */
  drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, alpha = 1): void {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.shadow, x - rx * 1.25, y - rx * 0.42, rx * 2.5, rx * 0.84);
    ctx.globalAlpha = 1;
  }

  /** A coloured glow stamp, added. */
  glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, color: keyof Lighting['pools'] = 'warm'): void {
    const stamp = this.pools[color] ?? this.pools.warm;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(stamp, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /**
   * Composite the night over the frame. `night` is [r, g, b, alpha]; `dawn` 0..1 thins it and warms the top;
   * `sunrise` 0..1 is the victory sunrise on top of that; `gloom` 0..1 is the defeat dim.
   */
  draw(ctx: CanvasRenderingContext2D, lights: LightSource[], night: [number, number, number, number], dawn: number, sunrise: number, gloom: number, darkCells: { x: number; y: number; w: number; h: number }[]): void {
    const map = this.map;
    if (!map) return;
    const m = map.getContext('2d');
    if (!m) return;
    const s = this.scale, { w, h } = this.size;
    const fade = Math.max(0, 1 - dawn * 0.55 - sunrise * 0.45);
    const [r, g, b, a] = night;
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, map.width, map.height);
    // dawn shifts the night from blue toward a lilac pre-sunrise
    const k = Math.min(1, dawn * 0.8 + sunrise);
    m.fillStyle = `rgba(${Math.round(r + (70 - r) * k)},${Math.round(g + (40 - g) * k)},${Math.round(b + (80 - b) * k)},${(a * fade + gloom * 0.25).toFixed(3)})`;
    m.fillRect(0, 0, map.width, map.height);
    // unlit pantry cells are properly dark
    if (darkCells.length) { m.fillStyle = `rgba(4,2,8,${(0.55 * fade + 0.1).toFixed(3)})`; for (const c of darkCells) m.fillRect(c.x * s, c.y * s, c.w * s, c.h * s); }
    m.globalCompositeOperation = 'destination-out';
    for (const l of lights) { m.globalAlpha = Math.max(0, Math.min(1, l.strength)); m.drawImage(this.hole, (l.x - l.r) * s, (l.y - l.r) * s, l.r * 2 * s, l.r * 2 * s); }
    m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
    // light pools are round but the sim lights whole cells: keep unlit pantry cells dark even inside a pool's fringe,
    // so what looks placeable is what is placeable
    if (darkCells.length) { m.fillStyle = `rgba(4,2,8,${(0.42 * fade).toFixed(3)})`; for (const c of darkCells) m.fillRect(c.x * s, c.y * s, c.w * s, c.h * s); }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map, 0, 0, w, h);
    // warm pools on top
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.warm) continue;
      const stamp = this.pools[l.color ?? 'warm'] ?? this.pools.warm, rr = l.r * 0.75;
      ctx.globalAlpha = Math.min(1, l.warm * (1 - sunrise * 0.5));
      ctx.drawImage(stamp, l.x - rr, l.y - rr, rr * 2, rr * 2);
    }
    // dawn through the window, and the sunrise
    const wash = Math.min(1, dawn * 0.35 + sunrise * 0.6);
    if (wash > 0.01 && this.dawnWash) { ctx.globalAlpha = wash; ctx.drawImage(this.dawnWash, 0, 0, w, h * (0.55 + sunrise * 0.45)); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (gloom > 0.01 && this.vignette) { ctx.globalAlpha = Math.min(1, gloom); ctx.drawImage(this.vignette, -w * 0.25, -h * 0.25, w * 1.5, h * 1.5); ctx.globalAlpha = 1; }
    ctx.restore();
  }
}
