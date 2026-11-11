import type { Sim, SimEvent } from '../types';
import type { BoardLayout } from './layout';

/**
 * Transient juice: particles, rings, ground decals (yolk, scorch, salt, grease), floating numbers, embers that
 * fly to the Heat counter, thrown sugar cubes, cake wedges, and pest corpses (the renderer draws those with the
 * sprite cache). Driven entirely by sim events, so the rules never know it exists. With reduced motion only the
 * still, readable parts remain (floating numbers, soft rings, decals); nothing shakes, flies or flashes, and
 * there are never full-canvas flashes in either mode.
 */
type Shape = 'dot' | 'star' | 'crumb' | 'puff' | 'drop' | 'shard' | 'spark' | 'heart' | 'leaf';
type Particle = { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; size: number; color: string; shape: Shape; spin: number };
type Ring = { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number; fill?: boolean; squash: number };
type Floater = { x: number; y: number; text: string; color: string; life: number; max: number; size: number; key?: string; value?: number; pop: number };
type Flyer = { x0: number; y0: number; x1: number; y1: number; life: number; max: number; kind: 'ember' | 'cube' | 'wedge' | 'glob'; arc: number; done?: () => void };
type Decal = { x: number; y: number; r: number; life: number; max: number; kind: 'yolk' | 'scorch' | 'salt' | 'grease' | 'stink'; seed: number };
export type Corpse = { def: string; x: number; y: number; size: number; life: number; max: number; boss: boolean; flip: boolean; /** The remembered Bloom: a stew pot that stays put until the level ends. */ keep?: boolean };

/**
 * On-screen size of a body's 100-unit sprite box. The tall phone board has cells much wider than they are deep, so
 * sprites there grow to fill the cell's width and are allowed to stand a little taller than the cell (they overlap
 * upward into the row behind, which is drawn first). Bosses keep their lane-spanning size; big pests are capped so
 * they never spill wider than about one lane.
 */
export function bodySize(L: BoardLayout, scale = 1, boss = false): number {
  if (!L.vertical) {
    // small wide boards (phone landscape, or a phone whose hand takes two rows): fill the cell's width
    if (boss || L.unit >= 64) return L.unit * scale;
    const base = Math.max(L.unit, Math.min(L.along * 1.04, L.across * 1.1));
    return scale <= 1 ? base * scale : Math.max(L.unit * scale, Math.min(base * scale, L.across * 1.25));
  }
  if (boss) return L.unit * scale * 1.1;
  const base = Math.max(L.unit, Math.min(L.across * 0.84, L.along * 1.27));
  return scale <= 1 ? base * scale : Math.min(base * scale, L.across * 1.2);
}
/** Max floating numbers alive at once, and how long a number keeps absorbing new amounts for the same key. */
const FLOAT_CAP = 14, MERGE_WINDOW = 0.45;

const TAG_COLORS: Record<string, string> = { pepper: '#4a3528', ice: '#bfeaff', egg: '#ffe27a', fire: '#ff8a1f', gas: '#d9b3e6', blade: '#e3e6ee', steam: '#ffffff', honey: '#f2b632', salt: '#ffffff', stink: '#a8d86a', toast: '#e8b46a', heat: '#ff8a1f' };
export const tagColor = (tag: string): string => TAG_COLORS[tag] ?? '#ffd27a';

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private floaters: Floater[] = [];
  private flyers: Flyer[] = [];
  private decals: Decal[] = [];
  corpses: Corpse[] = [];
  /** Screen shake offset and the cake's flinch, read by the renderer. */
  shake = 0;
  cakeHit = 0;
  /** Red pulse at the entry edge while a big wave is announced. */
  alarm = 0;
  /** 0..1 victory sunrise and defeat gloom, eased by `update`. */
  sunrise = 0; gloom = 0;
  private won = false; private lost = false;
  /** Pest ids the finale has turned back into Stew. */
  remembered = new Set<number>();
  /** Where embers fly to (the Heat counter), in stage pixels. */
  heatAnchor = { x: 40, y: 20 };
  private seed = 1;

  constructor(private reduced: boolean) {}

  private rand(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  clear(): void {
    this.particles = []; this.rings = []; this.floaters = []; this.flyers = []; this.decals = []; this.corpses = [];
    this.shake = 0; this.cakeHit = 0; this.alarm = 0; this.sunrise = 0; this.gloom = 0; this.won = false; this.lost = false; this.remembered.clear();
  }

  burst(x: number, y: number, color: string, count: number, speed: number, shape: Shape = 'dot', size = 4, gravity = 260): void {
    if (this.reduced) return;
    if (this.particles.length > 420) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2, v = speed * (0.35 + this.rand() * 0.65), life = 0.3 + this.rand() * 0.35;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: gravity, life, max: life, size: size * (0.6 + this.rand() * 0.7), color, shape, spin: this.rand() * 6 });
    }
  }
  /** A directed spray (steam cone, stink, breath). */
  spray(x: number, y: number, dx: number, dy: number, color: string, count: number, speed: number, shape: Shape = 'puff', size = 6, spread = 0.5): void {
    if (this.reduced) return;
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = base + (this.rand() - 0.5) * spread, v = speed * (0.5 + this.rand() * 0.5), life = 0.35 + this.rand() * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: -20, life, max: life, size: size * (0.7 + this.rand() * 0.6), color, shape, spin: 0 });
    }
  }
  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.4, width = 4, fill = false, squash = 1): void {
    if (this.rings.length > 60) this.rings.shift();
    this.rings.push({ x, y, r0, r1: this.reduced ? r0 + (r1 - r0) * 0.6 : r1, life, max: life, color, width, fill, squash });
  }
  /**
   * A floating number or word. Numbers with the same `key` (a cell, a pest) that arrive within `MERGE_WINDOW` add
   * up into one label that pops; anything else spawning on top of a young label is stacked above it in explicit
   * slots (they do not rely on rising apart, which reduced motion turns off). At most `FLOAT_CAP` live at once.
   */
  float(x: number, y: number, text: string, color: string, size = 16, key?: string): void {
    const match = /^([+-])(\d+)$/.exec(text), value = match ? (match[1] === '-' ? -1 : 1) * Number(match[2]) : undefined;
    if (key && value !== undefined) {
      const same = this.floaters.find(f => f.key === key && f.value !== undefined && Math.sign(f.value) === Math.sign(value) && f.max - f.life < MERGE_WINDOW);
      if (same) { same.value! += value; same.text = `${same.value! > 0 ? '+' : '-'}${Math.abs(same.value!)}`; same.life = same.max; same.pop = 1; return; }
    }
    // stack above young labels that sit on the same spot
    const h = Math.max(14, size) * 1.05;
    let slot = 0;
    for (let tries = 0; tries < 4; tries++) {
      const ty = y - slot * h;
      if (!this.floaters.some(f => f.max - f.life < 0.6 && Math.abs(f.x - x) < h * 1.6 && Math.abs(f.y - ty) < h * 0.9)) break;
      slot++;
    }
    while (this.floaters.length >= FLOAT_CAP) this.floaters.shift();
    this.floaters.push({ x, y: y - slot * h, text, color, life: 1, max: 1, size, key, value, pop: 0 });
  }
  decal(x: number, y: number, r: number, kind: Decal['kind'], life = 3): void {
    if (this.decals.length > 50) this.decals.shift();
    this.decals.push({ x, y, r, kind, life, max: life, seed: Math.floor(this.rand() * 1000) });
  }

  onEvent(event: SimEvent, sim: Sim, layout: BoardLayout): void {
    const u = layout.unit, cell = (col: number, lane: number) => layout.point(col + 0.5, lane), at = (x: number, lane: number) => layout.point(x, lane);
    const fwd = layout.vertical ? { x: 0, y: -1 } : { x: 1, y: 0 };
    switch (event.type) {
      case 'place': { const p = cell(event.col, event.lane); this.ring(p.x, p.y + u * 0.3, u * 0.2, u * 0.62, '#fff3d6', 0.3, 3, false, 0.4); this.burst(p.x, p.y + u * 0.3, '#e9d2a6', 8, u * 1.6, 'puff', u * 0.09, 0); break; }
      case 'upgrade': {
        const p = cell(event.col, event.lane);
        this.ring(p.x, p.y, u * 0.2, u * 0.85, '#ffd24a', 0.5, 5); this.ring(p.x, p.y + u * 0.3, u * 0.3, u * 0.7, '#fff3c4', 0.4, 3, false, 0.35);
        this.burst(p.x, p.y - u * 0.2, '#ffe27a', 14, u * 2.6, 'star', u * 0.1, 200); this.burst(p.x, p.y - u * 0.2, '#ffffff', 6, u * 1.8, 'spark', u * 0.06, 0);
        this.float(p.x, p.y - u * 0.62, event.tier === 2 ? '★★★' : '★★', '#ffe27a', 18);
        break;
      }
      case 'polish': { const p = cell(event.col, event.lane); this.burst(p.x, p.y - u * 0.3, '#ffffff', 8, u * 1.6, 'spark', u * 0.07, 0); this.float(p.x, p.y - u * 0.6, `✦${event.polish}`, '#fff3c4', 15); break; }
      case 'remove': { const p = cell(event.col, event.lane); this.burst(p.x, p.y, '#e9d2a6', 10, u * 1.8, 'puff', u * 0.1, 0); this.ring(p.x, p.y + u * 0.3, u * 0.5, u * 0.15, '#ffffff', 0.25, 3, false, 0.4); this.float(p.x, p.y - u * 0.5, `+${event.refund}`, '#ffd27a', 15); break; }
      case 'heat': {
        if (event.col < 0) break;
        const p = cell(event.col, event.lane);
        // a refund already shows its number on the `remove` puff
        if (event.source !== 'refund') this.float(p.x, p.y - u * 0.75, `+${event.amount}`, '#ffd27a', 16, `heat:${event.col},${event.lane}`);
        if (event.source === 'burner') this.ring(p.x, p.y - u * 0.3, u * 0.15, u * 0.55, '#ffb454', 0.35, 3);
        if (!this.reduced && this.flyers.length < 24) this.flyers.push({ x0: p.x, y0: p.y - u * 0.5, x1: this.heatAnchor.x, y1: this.heatAnchor.y, life: 0.7, max: 0.7, kind: 'ember', arc: u * 0.7 });
        break;
      }
      case 'hit': {
        const p = at(event.x, event.lane), color = event.shield ? '#e8bd74' : tagColor(event.tag);
        if (event.tag === 'ice') this.burst(p.x, p.y - u * 0.2, '#dff6ff', 4, u * 1.8, 'shard', u * 0.07);
        else if (event.tag === 'salt') this.burst(p.x, p.y - u * 0.2, '#ffffff', 5, u * 1.6, 'shard', u * 0.05);
        else this.burst(p.x, p.y - u * 0.15, color, event.shield ? 4 : 3, u * 1.8, event.shield ? 'crumb' : 'dot', u * 0.06);
        if (!this.reduced) this.ring(p.x, p.y - u * 0.2, u * 0.05, u * 0.22, '#ffffff', 0.12, 2.5);
        break;
      }
      case 'splash': {
        const p = at(event.x, event.lane), color = tagColor(event.tag);
        this.ring(p.x, p.y + u * 0.15, u * 0.15, event.radius * layout.along, color, 0.35, 5, true, 0.6);
        if (event.tag === 'egg') { this.decal(p.x, p.y + u * 0.2, u * 0.32, 'yolk', 3.5); this.burst(p.x, p.y, '#fff8e8', 8, u * 2.2, 'shard', u * 0.07); this.burst(p.x, p.y, '#ffd24a', 6, u * 2, 'drop', u * 0.07); }
        else { this.burst(p.x, p.y, color, 9, u * 2.2, 'dot', u * 0.07); this.burst(p.x, p.y, '#fff8e8', 5, u * 1.8, 'crumb', u * 0.06); }
        break;
      }
      case 'shieldBreak': { const p = at(event.x, event.lane), b = layout.vertical ? 0 : -u * 0.2, c = layout.vertical ? u * 0.15 : 0; this.burst(p.x + b, p.y + c, '#e8bd74', 16, u * 2.6, 'crumb', u * 0.09); this.ring(p.x, p.y, u * 0.1, u * 0.55, '#e8bd74', 0.3, 3); break; }
      case 'attack': {
        const p = cell(event.col, event.lane);
        if (event.attack === 'burst') { this.ring(p.x, p.y, u * 0.2, (event.radius ?? 1.5) * layout.along, '#e7c9f2', 0.55, 6, true); this.burst(p.x, p.y, '#e7c9f2', 10, u * 2, 'puff', u * 0.12, -40); }
        else if (event.attack === 'cone') this.spray(p.x + fwd.x * u * 0.4, p.y - u * 0.35 + fwd.y * u * 0.2, fwd.x, fwd.y, '#ffffff', 12, u * 3.4, 'puff', u * 0.12, 0.6);
        else if (event.attack === 'lanefire') this.shake = Math.max(this.shake, 0.3);
        else if ((event.attack as string) === 'stink') this.spray(p.x + fwd.x * u * 0.4, p.y - u * 0.3 + fwd.y * u * 0.2, fwd.x, fwd.y, '#a8d86a', 12, u * 2.6, 'puff', u * 0.13, 1.2);
        else if ((event.attack as string) === 'aura') { this.ring(p.x, p.y, u * 0.3, (event.radius ?? 1.2) * layout.along, '#ff9fb4', 0.6, 4, true); this.burst(p.x, p.y - u * 0.5, '#ff8fa3', 4, u * 1.2, 'heart', u * 0.08, -60); }
        else if (event.attack === 'melee') this.burst(p.x + fwd.x * u * 0.6, p.y - u * 0.3 + fwd.y * u * 0.6, '#ffffff', 4, u * 1.6, 'spark', u * 0.06, 0);
        else if (event.attack === 'shoot' && !this.reduced) this.burst(p.x + fwd.x * u * 0.45, p.y - u * 0.35 + fwd.y * u * 0.45, '#fff2b8', 2, u * 0.8, 'puff', u * 0.06, 0);
        break;
      }
      case 'status': { const p = at(event.x, event.lane); if (event.kind === 'slow') this.burst(p.x, p.y - u * 0.3, '#bfeaff', 4, u * 1.2, 'star', u * 0.06, 0); else if (event.kind === 'sticky') this.burst(p.x, p.y, '#f2b632', 3, u * 0.8, 'drop', u * 0.06); break; }
      case 'enemyDown': {
        const p = at(event.x, event.lane), boss = event.boss, def = sim.content.enemies[event.def];
        if (!this.remembered.has(event.id)) {
          this.corpses.push({ def: event.def, x: p.x, y: layout.feet(event.x, event.lane).y - (def?.flying ? u * 0.3 : 0), size: bodySize(layout, def?.size ?? 1, boss), life: boss ? 1.2 : 0.5, max: boss ? 1.2 : 0.5, boss, flip: !layout.vertical });
          if (this.corpses.length > 40) { const i = this.corpses.findIndex(c => !c.keep); if (i >= 0) this.corpses.splice(i, 1); }
        }
        this.burst(p.x, p.y - u * 0.2, '#d8d2c4', boss ? 40 : 7, u * (boss ? 5 : 2), 'puff', u * (boss ? 0.16 : 0.1), 0);
        this.burst(p.x, p.y - u * 0.2, boss ? '#ffd9e2' : '#ffe9a8', boss ? 26 : 4, u * (boss ? 5 : 2.4), 'star', u * 0.07);
        this.ring(p.x, p.y, u * 0.1, u * (boss ? 2.4 : 0.5), '#fff3d6', boss ? 0.8 : 0.25, boss ? 6 : 3);
        if (boss) this.shake = Math.max(this.shake, 0.6);
        break;
      }
      case 'defenderDown': { if (event.cause === 'spent') break; const p = cell(event.col, event.lane); this.burst(p.x, p.y, '#e9d2a6', 14, u * 2.4, 'crumb', u * 0.09); this.ring(p.x, p.y, u * 0.2, u * 0.8, '#ff6b6b', 0.4, 4); this.float(p.x, p.y - u * 0.5, event.cause === 'stolen' ? '!' : '✕', '#ff8a8a', 20); break; }
      case 'defenderHurt': { const p = cell(event.col, event.lane); this.burst(p.x + fwd.x * u * 0.3, p.y + fwd.y * u * 0.3, '#fff3d6', 2, u * 1.4, 'crumb', u * 0.05); break; }
      case 'defenderStun': { const p = cell(event.col, event.lane); this.ring(p.x, p.y, u * 0.6, u * 0.2, event.cause === 'chill' || event.cause === 'snap' ? '#bfeaff' : '#ffffff', 0.4, 4); break; }
      case 'chill': { const p = cell(event.col, event.lane); if (event.on) { this.burst(p.x, p.y - u * 0.3, '#dff6ff', 8, u * 1.4, 'shard', u * 0.07, 0); this.ring(p.x, p.y, u * 0.7, u * 0.3, '#bfeaff', 0.4, 3); } else this.burst(p.x, p.y - u * 0.3, '#ffffff', 5, u * 1.2, 'drop', u * 0.06); break; }
      case 'mold': { const p = cell(event.col, event.lane); this.burst(p.x, p.y, '#74c9ad', 14, u * 1.8, 'puff', u * 0.11, 0); this.ring(p.x, p.y, u * 0.1, u * 0.7, '#5fb59a', 0.5, 4, true); break; }
      case 'cleanse': { const p = cell(event.col, event.lane); this.burst(p.x, p.y, '#ffffff', 10, u * 1.8, 'spark', u * 0.07, 0); this.decal(p.x, p.y + u * 0.15, u * 0.3, 'salt', 2.5); this.ring(p.x, p.y, u * 0.2, u * 0.7, '#ffffff', 0.4, 3); break; }
      case 'push': {
        const from = at(event.x, event.fromLane), to = at(event.x, event.toLane);
        this.spray(from.x, from.y - u * 0.3, to.x - from.x, to.y - from.y, '#a8d86a', 8, u * 2.2, 'puff', u * 0.12, 0.8);
        this.decal(from.x, from.y + u * 0.2, u * 0.3, 'stink', 1.5);
        break;
      }
      case 'flare': { const p = cell(event.col, event.lane); this.burst(p.x, p.y, '#ff8a1f', 12, u * 2.4, 'spark', u * 0.08, -60); this.ring(p.x, p.y, u * 0.2, u * 0.8, '#ffb454', 0.4, 5, true); this.decal(p.x, p.y + u * 0.15, u * 0.4, 'scorch', 6); this.shake = Math.max(this.shake, 0.15); break; }
      case 'burrow': case 'emerge': { const p = at(event.x, event.lane); this.burst(p.x, p.y + u * 0.2, '#8a6a4a', 10, u * 1.8, 'crumb', u * 0.08); break; }
      case 'calm': { const p = at(event.x, event.lane); this.ring(p.x, p.y - u * 0.3, u * 0.3, u * 1.2, '#ffd27a', 0.6, 4); this.burst(p.x, p.y - u * 0.6, '#ff9fb4', 6, u * 1.2, 'heart', u * 0.08, -50); break; }
      case 'enemySpawn': { if (event.boss) { const p = at(layout.cols - 0.2, event.lane); this.ring(p.x, p.y, u * 0.4, u * 2.2, '#ff7080', 0.9, 6); this.burst(p.x, p.y, '#ffb0b8', 14, u * 2.4, 'puff', u * 0.14); } break; }
      case 'steal': { const p = cell(event.col, event.lane); this.float(p.x, p.y - u * 0.6, event.def ? '!' : `-${event.heat}`, '#ff8a8a', 18); break; }
      case 'recovered': { const p = cell(event.col, event.lane); this.ring(p.x, p.y, u * 0.2, u * 0.7, '#70f0c2', 0.4, 4); this.burst(p.x, p.y, '#70f0c2', 8, u * 1.6, 'star', u * 0.07); break; }
      case 'slice': {
        this.cakeHit = 1; this.shake = Math.max(this.shake, 0.5);
        const c = layout.cake;
        this.burst(c.x, c.y, '#ffd9e2', 16, u * 3, 'crumb', u * 0.1); this.burst(c.x, c.y, '#fff8ee', 10, u * 2.4, 'crumb', u * 0.08);
        this.ring(c.x, c.y, c.r * 0.5, c.r * 1.6, '#ff6b6b', 0.6, 6);
        this.float(c.x, c.y - c.r, '-1', '#ff8a8a', 24);
        if (!this.reduced) { const away = layout.point(-1.5, event.lane); this.flyers.push({ x0: c.x, y0: c.y, x1: away.x + (layout.vertical ? 0 : -c.r * 2), y1: away.y + (layout.vertical ? c.r * 3 : 0), life: 0.6, max: 0.6, kind: 'wedge', arc: c.r * 2 }); }
        break;
      }
      case 'sliceRestored': { const c = layout.cake; this.ring(c.x, c.y, c.r * 1.6, c.r * 0.6, '#ff9fc6', 0.7, 6); this.burst(c.x, c.y, '#ff9fc6', 18, u * 3, 'heart', u * 0.1); this.float(c.x, c.y - c.r, '+1', '#ff9fc6', 22); break; }
      case 'telegraph': this.alarm = Math.max(this.alarm, event.seconds); break;
      case 'waveStart': if (event.big) { this.alarm = Math.max(this.alarm, 1.2); } break;
      case 'recipe': {
        const recipe = sim.content.recipes.find(r => r.id === event.recipe), color = recipe?.color ?? '#ffd27a';
        for (const [col, lane] of event.cells) { const p = cell(col, lane); this.burst(p.x, p.y, color, event.first ? 14 : 6, u * 2.2, 'star', u * 0.09, 120); this.burst(p.x, p.y - u * 0.3, '#ffffff', event.first ? 6 : 2, u * 1.4, 'spark', u * 0.06, 0); this.ring(p.x, p.y, u * 0.2, u * 0.75, color, 0.55, 4); }
        break;
      }
      case 'bossPhase': { const boss = sim.enemies.find(e => e.id === event.enemy); if (boss) { const p = at(boss.x, boss.lane); this.ring(p.x, p.y, u * 0.4, u * 3, '#ff6b8a', 0.8, 7); this.burst(p.x, p.y - u, '#ffffff', 16, u * 3, 'spark', u * 0.08, 0); this.shake = Math.max(this.shake, 0.5); } break; }
      case 'bossAttack': {
        const p = at(event.x, event.lane);
        if (event.kind === 'toss' && event.toCol !== undefined && event.toLane !== undefined) {
          const to = cell(event.toCol, event.toLane), land = () => { this.burst(to.x, to.y, '#ffffff', 14, u * 2.6, 'crumb', u * 0.1); this.ring(to.x, to.y, u * 0.2, u * 0.8, '#ffffff', 0.35, 5); };
          if (this.reduced) land();
          else this.flyers.push({ x0: p.x, y0: p.y - u, x1: to.x, y1: to.y, life: 0.45, max: 0.45, kind: 'cube', arc: u * 1.6, done: land });
        } else if (event.kind === 'summon') { this.ring(p.x, p.y, u * 0.3, u * 1.6, '#d9627a', 0.5, 5); this.burst(p.x, p.y, '#d9627a', 10, u * 2, 'puff', u * 0.1, 0); }
        else if (event.kind === 'rally') this.ring(p.x, p.y, u * 0.3, u * 4, '#ff5a5a', 0.7, 6);
        else if (event.kind === 'splatter') for (const [c, l] of event.cells ?? []) { const to = cell(c, l), land = () => { this.decal(to.x, to.y + u * 0.15, u * 0.4, 'grease', 2); this.burst(to.x, to.y, '#c4782a', 8, u * 2, 'drop', u * 0.08); }; if (this.reduced) land(); else this.flyers.push({ x0: p.x, y0: p.y - u, x1: to.x, y1: to.y, life: 0.5, max: 0.5, kind: 'glob', arc: u * 1.4, done: land }); }
        else if (event.kind === 'breath') { const dx = layout.vertical ? 0 : -1, dy = layout.vertical ? 1 : 0; this.spray(p.x, p.y - u * 0.6, dx, dy, event.def === 'greasegolem' ? '#ff8a30' : '#dff6ff', 22, u * 5, 'puff', u * 0.18, 0.4); this.shake = Math.max(this.shake, 0.3); }
        else if (event.kind === 'flood') { for (const [c, l] of event.cells ?? []) { const to = cell(c, l); this.ring(to.x, to.y, u * 0.1, u * 0.6, '#8fd3ff', 0.6, 3, false, 0.5); } this.burst(p.x, p.y, '#8fd3ff', 16, u * 3, 'drop', u * 0.08); }
        else if (event.kind === 'dive') { this.ring(p.x, p.y, u * 0.2, u * 1.2, '#8fd3ff', 0.6, 4, false, 0.4); this.burst(p.x, p.y, '#dff6ff', 12, u * 2.6, 'drop', u * 0.08); }
        else if (event.kind === 'lightsOut') { for (const [c, l] of event.cells ?? []) { const to = cell(c, l); this.burst(to.x, to.y - u * 0.3, '#5a5060', 4, u * 1.2, 'puff', u * 0.14, -30); } }
        else if (event.kind === 'sporeRain') { for (const [c, l] of event.cells ?? []) { const to = cell(c, l); this.burst(to.x, to.y - u * 0.4, '#74c9ad', 6, u * 1.4, 'puff', u * 0.1, 80); } }
        else if (event.kind === 'hop') this.ring(p.x, p.y + u * 0.3, u * 0.3, u * 1.2, '#ffffff', 0.4, 4, false, 0.4);
        break;
      }
      case 'hazard': {
        for (const [c, l] of event.cells) {
          const p = cell(c, l);
          switch (event.kind) {
            case 'drip': this.ring(p.x, p.y + u * 0.2, u * 0.1, u * 0.55, '#bfe6ff', 0.5, 3, false, 0.45); this.burst(p.x, p.y, '#dff6ff', 8, u * 2, 'drop', u * 0.07); break;
            case 'hobOn': this.ring(p.x, p.y, u * 0.1, u * 0.5, '#ff8a30', 0.4, 4); this.burst(p.x, p.y, '#ffb454', 6, u * 1.4, 'spark', u * 0.06, -80); break;
            case 'flood': this.ring(p.x, p.y, u * 0.1, u * 0.5, '#8fd3ff', 0.5, 3, false, 0.5); break;
            case 'lightsOut': this.burst(p.x, p.y - u * 0.3, '#4a4050', 3, u * 1, 'puff', u * 0.12, -30); break;
            case 'lightsOn': this.ring(p.x, p.y, u * 0.1, u * 0.6, '#ffd27a', 0.4, 3); break;
            case 'moldSpread': case 'sporeRain': this.burst(p.x, p.y, '#74c9ad', 8, u * 1.4, 'puff', u * 0.1, 0); break;
            case 'coldSnap': this.burst(p.x, p.y - u * 0.2, '#ffffff', 6, u * 1.6, 'shard', u * 0.06, 0); this.ring(p.x, p.y, u * 0.6, u * 0.2, '#dff6ff', 0.5, 3); break;
            case 'splatter': this.decal(p.x, p.y + u * 0.15, u * 0.4, 'grease', 2); break;
            default: break;
          }
        }
        if (event.kind === 'coldSnap' || event.kind === 'flood') this.shake = Math.max(this.shake, 0.2);
        break;
      }
      case 'remembered': {
        this.remembered.add(event.enemy);
        const p = at(event.x, event.lane);
        // the sim sends everyone home, the Bloom included; it stays on the board as Granny's stew
        this.corpses.push({ def: 'stew', x: p.x, y: layout.feet(event.x, event.lane).y, size: bodySize(layout, 1.9, true), life: 1e6, max: 1e6, boss: true, flip: false, keep: true });
        this.ring(p.x, p.y, u * 0.4, u * 3.4, '#ffd27a', 1.2, 6);
        this.burst(p.x, p.y - u, '#ffd27a', 30, u * 3, 'star', u * 0.1, 40); this.burst(p.x, p.y - u, '#ff9fb4', 16, u * 2.2, 'heart', u * 0.1, -40);
        break;
      }
      case 'win': this.won = true; { const c = layout.cake; this.burst(c.x, c.y - c.r, '#ffd27a', 24, u * 3, 'star', u * 0.1, 120); this.burst(c.x, c.y - c.r, '#ff9fc6', 14, u * 2.4, 'heart', u * 0.09, 120); } break;
      case 'lose': this.lost = true; break;
      default: break;
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.4); this.cakeHit = Math.max(0, this.cakeHit - dt * 2.2); this.alarm = Math.max(0, this.alarm - dt);
    if (this.won) this.sunrise = Math.min(1, this.sunrise + dt / 1.4);
    if (this.lost) this.gloom = Math.min(1, this.gloom + dt / 1.1);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.96; p.spin += dt * 6; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const f of this.floaters) { f.life -= dt * 1.1; f.pop = this.reduced ? 0 : Math.max(0, f.pop - dt * 4); if (!this.reduced) f.y -= dt * 26; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    for (const f of this.flyers) { f.life -= dt; if (f.life <= 0) f.done?.(); }
    this.flyers = this.flyers.filter(f => f.life > 0);
    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter(d => d.life > 0);
    for (const c of this.corpses) c.life -= dt;
    this.corpses = this.corpses.filter(c => c.life > 0);
  }

  /** Ground decals, drawn under the units. */
  drawDecals(ctx: CanvasRenderingContext2D): void {
    for (const d of this.decals) {
      const a = Math.min(1, d.life / Math.min(1, d.max * 0.5));
      ctx.globalAlpha = a;
      switch (d.kind) {
        case 'yolk':
          ctx.fillStyle = 'rgba(255,250,235,0.85)'; ctx.beginPath();
          for (let i = 0; i <= 10; i++) { const ang = i / 10 * Math.PI * 2, rr = d.r * (0.85 + ((d.seed * (i + 3)) % 7) / 20); ctx.lineTo(d.x + Math.cos(ang) * rr, d.y + Math.sin(ang) * rr * 0.5); }
          ctx.fill(); ctx.fillStyle = '#ffc93a'; ctx.beginPath(); ctx.ellipse(d.x + d.r * 0.1, d.y - d.r * 0.05, d.r * 0.38, d.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(d.x, d.y - d.r * 0.1, d.r * 0.1, d.r * 0.06, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'scorch': ctx.fillStyle = 'rgba(30,14,6,0.45)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'salt': ctx.fillStyle = '#ffffff'; for (let i = 0; i < 9; i++) { const ang = (d.seed + i * 47) % 628 / 100, rr = d.r * (((d.seed + i * 13) % 10) / 10); ctx.fillRect(d.x + Math.cos(ang) * rr, d.y + Math.sin(ang) * rr * 0.5, 2.5, 2.5); } break;
        case 'grease': ctx.fillStyle = 'rgba(160,96,30,0.6)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,230,170,0.5)'; ctx.fillRect(d.x - d.r * 0.4, d.y - d.r * 0.15, d.r * 0.4, 2); break;
        case 'stink': ctx.fillStyle = 'rgba(168,216,106,0.3)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max, radius = Math.max(1, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
      ctx.globalAlpha = Math.max(0, 1 - k) * (r.fill ? 0.3 : 0.9);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, radius, radius * r.squash, 0, 0, Math.PI * 2);
      if (r.fill) { ctx.fillStyle = r.color; ctx.fill(); ctx.globalAlpha = Math.max(0, 1 - k) * 0.8; }
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k * 0.5); ctx.stroke();
    }
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'puff': ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill(); break;
        case 'star': { const s = p.size * (0.5 + k); ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + p.spin, r = i % 2 ? s * 0.4 : s; ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); } ctx.fill(); break; }
        case 'crumb': ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.8); break;
        case 'drop': ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.45, p.size * 0.7, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); break;
        case 'shard': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.4); ctx.lineTo(p.size, 0); ctx.lineTo(0, p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(42,24,16,0.6)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); break;
        case 'spark': ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break;
        case 'heart': { const s = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y + s * 0.8); ctx.bezierCurveTo(p.x - s * 1.2, p.y, p.x - s * 0.6, p.y - s, p.x, p.y - s * 0.35); ctx.bezierCurveTo(p.x + s * 0.6, p.y - s, p.x + s * 1.2, p.y, p.x, p.y + s * 0.8); ctx.fill(); break; }
        default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const f of this.flyers) {
      const k = 1 - f.life / f.max, ease = k * k * (3 - 2 * k), x = f.x0 + (f.x1 - f.x0) * ease, y = f.y0 + (f.y1 - f.y0) * ease - Math.sin(k * Math.PI) * f.arc;
      ctx.globalAlpha = 1;
      if (f.kind === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,150,60,0.35)'; ctx.beginPath(); ctx.arc(x, y, 12 - k * 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(x, y, 6 - k * 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x, y, 3 - k, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'wedge') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * 6); ctx.globalAlpha = 1 - k * 0.6;
        ctx.fillStyle = '#fff5ea'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 18, -0.5, 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(10, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else if (f.kind === 'glob') { ctx.fillStyle = '#c4782a'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, 9, 7, k * 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(k * 7); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-9, -9, 18, 18, 3); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.font = `800 ${Math.round(Math.max(14, f.size) * (1 + f.pop * 0.3))}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a12'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}
