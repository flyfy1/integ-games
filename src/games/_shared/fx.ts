/**
 * TransientFeedback (docs/IMPROVEMENT-PLAN-2026-10-20.md §5): bounded, local, deterministic canvas FX.
 *
 * The shared layer owns only *how* feedback moves: timing, caps, reduced-motion mapping, pause/clear and a private PRNG.
 * What it looks like (palette, shape, physics, intensity) lives in each game's own recipe. There is deliberately no
 * shared preset library and no default colour.
 *
 * Never pass or call `services.random` here: gameplay draws from that seeded sequence, and every extra draw would change
 * later levels. Shards use their own PRNG seeded from (recipe id, emit counter), so a recipe replays identically.
 */

export type Range = readonly [min: number, max: number];
/** Particles. Speeds are px/s, gravity px/s², drag is the exponential damping rate per second, life is ms. */
export type ShardsLayer = { kind: 'shards'; count: Range; speed: Range; spread: number; gravity: number; drag: number; size: Range; shape: 'square' | 'circle'; life: Range; colors: readonly string[] };
/** Shock ring growing from `from` to `to` px. `tint` takes the first runtime colour instead of `color`. */
export type RingLayer = { kind: 'ring'; from: number; to: number; width: number; life: number; color: string; tint?: boolean };
/** Local flash core: a circle, or the emit box grown by `radius` when the emit has `w`/`h`. Never full-screen. */
export type CoreLayer = { kind: 'core'; radius: number; life: number; color: string; alpha?: number; tint?: boolean };
export type FxLayer = ShardsLayer | RingLayer | CoreLayer;
/** Reduced-motion stand-in: a static outline at the event, no displacement, at most 160ms. */
export type FxOutline = { kind: 'outline'; radius: number; life: number; color: string; tint?: boolean };
export type FxRecipe = { id: string; layers: readonly FxLayer[]; reduced: 'none' | FxOutline };
/**
 * Runtime parameters. `colors` replaces shard colours; `w`/`h` turn the emit point into a box; `dir` (rad) aims shards;
 * `scale` maps event intensity (count ×scale, speed/ring/core ×√scale); `delay` (ms) staggers several emits.
 */
export type EmitOptions = { dir?: number; scale?: number; colors?: readonly string[]; w?: number; h?: number; delay?: number };

export type FxItem =
  | { kind: 'legacy'; x: number; y: number; dx: number; dy: number; life: number; max: number; color: string; flash: boolean }
  | { kind: 'shard'; x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string; circle: boolean; gravity: number; drag: number }
  | { kind: 'ring'; x: number; y: number; age: number; life: number; from: number; to: number; width: number; color: string }
  | { kind: 'core'; x: number; y: number; w: number; h: number; radius: number; age: number; life: number; color: string; alpha: number }
  | { kind: 'outline'; x: number; y: number; w: number; h: number; radius: number; age: number; life: number; color: string };

export type Fx = {
  /** Legacy 7-point square ring, frame-stepped exactly as the original arcade-kit implementation. */
  burst(x: number, y: number, color: string, count?: number): void;
  /** Legacy whole-canvas wash for waves and endings; reduced motion gets a static edge outline instead. */
  flash(color: string, life?: number): void;
  emit(recipe: FxRecipe, x: number, y: number, options?: EmitOptions): void;
  step(): void;
  draw(): void;
  clear(): void;
  setPaused(value: boolean): void;
  active(): boolean;
  /** Plain copies of the live items, for tests and the dev contact sheet. */
  inspect(): FxItem[];
};

export type FxOptions = { reducedMotion: boolean; now?: () => number };

export const FX_LIMITS = { perEmit: 24, live: 160, maxDt: 50, maxLife: 1200, reducedLife: 160, maxDelay: 400, coreRadius: 64, coreBox: .6 } as const;

const pick = (range: Range, rand: () => number) => range[0] + (range[1] - range[0]) * rand();
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
const prng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function createFx(ctx: CanvasRenderingContext2D, width: number, height: number, options: FxOptions): Fx {
  const reduced = options.reducedMotion;
  const now = options.now ?? (() => performance.now());
  let items: FxItem[] = [], paused = false, stepped = false, emits = 0, last: number | undefined;

  const push = (item: FxItem) => { items.push(item); if (items.length > FX_LIMITS.live) items.splice(0, items.length - FX_LIMITS.live); last ??= now(); };
  // Legacy effects keep their per-frame motion so the ten kit games look exactly as before.
  const frame = () => { items = items.filter(item => { if (item.kind !== 'legacy') return true; item.life--; item.x += item.dx; item.y += item.dy; return item.life > 0; }); };
  const age = () => {
    const time = now(), dt = last === undefined ? 0 : Math.min(FX_LIMITS.maxDt, Math.max(0, time - last)), s = dt / 1000; last = time;
    if (!dt) return;
    items = items.filter(item => {
      if (item.kind === 'legacy') return true;
      const wasWaiting = item.age < 0; item.age += dt;
      if (item.kind === 'shard' && item.age > 0) {
        const moving = wasWaiting ? item.age / 1000 : s, damp = Math.exp(-item.drag * moving);
        item.vy += item.gravity * moving; item.vx *= damp; item.vy *= damp; item.x += item.vx * moving; item.y += item.vy * moving;
      }
      return item.age < item.life;
    });
    if (!items.length) last = undefined;
  };

  const emit = (recipe: FxRecipe, x: number, y: number, opts: EmitOptions = {}) => {
    const rand = prng(hash(recipe.id) ^ Math.imul(++emits, 0x9e3779b9));
    const w = Math.min(opts.w ?? 0, width * FX_LIMITS.coreBox), h = Math.min(opts.h ?? 0, height * FX_LIMITS.coreBox), box = w > 0 || h > 0;
    const delay = -Math.min(FX_LIMITS.maxDelay, Math.max(0, opts.delay ?? 0));
    const scale = Math.min(3, Math.max(.25, opts.scale ?? 1)), root = Math.sqrt(scale);
    const tint = (layer: { color: string; tint?: boolean }) => layer.tint && opts.colors?.length ? opts.colors[0] : layer.color;
    const life = (ms: number) => Math.min(FX_LIMITS.maxLife, Math.max(1, ms));
    if (reduced) {
      const outline = recipe.reduced;
      if (outline !== 'none') push({ kind: 'outline', x, y, w, h, radius: outline.radius, age: delay, life: Math.min(FX_LIMITS.reducedLife, life(outline.life)), color: tint(outline) });
      return;
    }
    let budget = FX_LIMITS.perEmit;
    for (const layer of recipe.layers) {
      if (layer.kind === 'ring') push({ kind: 'ring', x, y, age: delay, life: life(layer.life), from: layer.from, to: layer.from + (layer.to - layer.from) * root, width: layer.width, color: tint(layer) });
      else if (layer.kind === 'core') push({ kind: 'core', x, y, w, h, radius: Math.min(FX_LIMITS.coreRadius, layer.radius * root), age: delay, life: life(layer.life), color: tint(layer), alpha: layer.alpha ?? .8 });
      else {
        const colors = opts.colors?.length ? opts.colors : layer.colors, count = Math.min(budget, Math.round(pick(layer.count, rand) * scale)), aim = opts.dir ?? -Math.PI / 2;
        budget -= count;
        for (let i = 0; i < count; i++) {
          const angle = aim + (rand() - .5) * layer.spread, speed = pick(layer.speed, rand) * root;
          push({ kind: 'shard', x: x + (rand() - .5) * w, y: y + (rand() - .5) * h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: delay, life: life(pick(layer.life, rand)), size: pick(layer.size, rand), color: colors[Math.floor(rand() * colors.length)], circle: layer.shape === 'circle', gravity: layer.gravity, drag: layer.drag });
        }
      }
    }
  };

  const render = () => {
    const alpha = ctx.globalAlpha, lineWidth = ctx.lineWidth;
    items.forEach(item => {
      if (item.kind === 'legacy') { ctx.globalAlpha = Math.max(.08, item.life / item.max) * .8; ctx.strokeStyle = item.color; ctx.fillStyle = item.color; if (item.flash) ctx.fillRect(0, 0, width, height); else ctx.fillRect(item.x - 2, item.y - 2, 4, 4); return; }
      if (item.age < 0) return;
      const k = Math.min(1, item.age / item.life);
      if (item.kind === 'shard') {
        const size = item.size * (1 - .4 * k); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = item.color;
        if (item.circle) { ctx.beginPath(); ctx.arc(item.x, item.y, size / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(Math.round(item.x - size / 2), Math.round(item.y - size / 2), Math.max(1, Math.round(size)), Math.max(1, Math.round(size)));
      } else if (item.kind === 'ring') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = item.color; ctx.lineWidth = Math.max(.5, item.width * (1 - k * .7));
        ctx.beginPath(); ctx.arc(item.x, item.y, item.from + (item.to - item.from) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); ctx.stroke();
      } else if (item.kind === 'core') {
        const grow = item.radius * (.6 + .4 * k); ctx.globalAlpha = item.alpha * (1 - k) * (1 - k); ctx.fillStyle = item.color;
        if (item.w || item.h) ctx.fillRect(item.x - item.w / 2 - grow, item.y - item.h / 2 - grow, item.w + grow * 2, item.h + grow * 2);
        else { ctx.beginPath(); ctx.arc(item.x, item.y, grow, 0, Math.PI * 2); ctx.fill(); }
      } else {
        // Reduced motion: constant, static, local. No fade, no growth, no fill.
        ctx.globalAlpha = .9; ctx.strokeStyle = item.color; ctx.lineWidth = 2;
        if (item.w || item.h) ctx.strokeRect(item.x - item.w / 2 - item.radius, item.y - item.h / 2 - item.radius, item.w + item.radius * 2, item.h + item.radius * 2);
        else { ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2); ctx.stroke(); }
      }
    });
    ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth;
  };

  return {
    burst(x, y, color, count = 7) {
      if (reduced) { push({ kind: 'outline', x, y, w: 0, h: 0, radius: 9, age: 0, life: 140, color }); return; }
      for (let index = 0; index < count; index++) { const angle = Math.PI * 2 * index / count; push({ kind: 'legacy', x, y, dx: Math.cos(angle) * (1.2 + (index % 3)), dy: Math.sin(angle) * (1.2 + (index % 2)), life: 18, max: 18, color, flash: false }); }
    },
    flash(color, life = 10) {
      if (reduced) { push({ kind: 'outline', x: width / 2, y: height / 2, w: width - 6, h: height - 6, radius: 0, age: 0, life: FX_LIMITS.reducedLife, color }); return; }
      push({ kind: 'legacy', x: width / 2, y: height / 2, dx: 0, dy: 0, life, max: life, color, flash: true });
    },
    emit,
    // Games may call step() only while playing; draw() then keeps advancing so an ending flash fades instead of freezing.
    step() { if (paused) return; age(); frame(); stepped = true; },
    draw() { if (!paused) { age(); if (!stepped) frame(); } stepped = false; render(); },
    clear() { items = []; emits = 0; last = undefined; stepped = false; },
    setPaused(value) { paused = value; last = undefined; },
    active: () => items.length > 0,
    inspect: () => items.map(item => ({ ...item }))
  };
}
