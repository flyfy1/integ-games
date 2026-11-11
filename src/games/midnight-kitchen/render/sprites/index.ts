import { ant, shieldant } from './ant';
import { baron } from './baron';
import { bloom } from './bloom';
import { brute } from './brute';
import { burner } from './burner';
import { chili } from './chili';
import { dough } from './dough';
import { drainking } from './drainking';
import { egg } from './egg';
import { fruitfly } from './fruitfly';
import { garlic } from './garlic';
import { granny } from './granny';
import { greasegolem } from './greasegolem';
import { honey } from './honey';
import { ice } from './ice';
import { kettle } from './kettle';
import { INK, oval, shape, shine, star, withoutShading, type SpriteDraw, type SpriteParams } from './kit';
import { ladle } from './ladle';
import { moth } from './moth';
import { mouse } from './mouse';
import { onion } from './onion';
import { pepper } from './pepper';
import { pip } from './pip';
import { queen } from './queen';
import { ricecooker } from './ricecooker';
import { roach } from './roach';
import { salt } from './salt';
import { slug } from './slug';
import { spore } from './spore';
import { stew } from './stew';
import { toaster } from './toaster';
import { weevil } from './weevil';
import { whisk } from './whisk';

/**
 * Sprite registry. One draw function per defender, enemy and story character, each in its own file so the art can
 * be replaced one at a time: keep the export name and the 100-unit box (see `kit.ts`) and nothing else changes.
 * The renderer never calls a draw function directly: it goes through `SpriteCache`, which rasterises each distinct
 * pose once to an offscreen canvas (with a baked rim light) and blits it, so a full board costs a few dozen
 * drawImage calls per frame.
 */
export type SpriteKind = 'defender' | 'enemy' | 'character';
export const DEFENDER_SPRITES: Record<string, SpriteDraw> = { burner, pepper, dough, ice, egg, chili, onion, whisk, kettle, honey, garlic, toaster, salt, ricecooker };
export const ENEMY_SPRITES: Record<string, SpriteDraw> = { ant, shieldant, fruitfly, roach, slug, spore, weevil, mouse, moth, brute, queen, drainking, greasegolem, baron, bloom, stew };
export const BOSS_SPRITES = ['queen', 'drainking', 'greasegolem', 'baron', 'bloom'];
/** Story speakers. Several reuse their defender or enemy sprite. */
export const CHARACTER_SPRITES: Record<string, SpriteDraw> = {
  pip, ladle, grind: pepper, bun: dough, shelly: egg, frost: ice, scout: ant, queen, drainking, greasegolem, baron, bloom, granny, stew
};

/** Unknown ids still get a friendly body: a little dome with a question mark, never a crash. */
const unknown: SpriteDraw = ctx => {
  oval(ctx, 0, -32, 30, 30, '#8a8fa3'); shine(ctx, -10, -44, 8, 5, 0.4);
  withoutShading(() => { ctx.fillStyle = INK; ctx.font = '700 36px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, -19); });
};
export function spriteFor(kind: SpriteKind, id: string): SpriteDraw {
  return (kind === 'defender' ? DEFENDER_SPRITES : kind === 'enemy' ? ENEMY_SPRITES : CHARACTER_SPRITES)[id] ?? (kind === 'character' ? DEFENDER_SPRITES[id] ?? ENEMY_SPRITES[id] : undefined) ?? unknown;
}

/** The part of the 100-unit sprite space that gets rasterised: generous margins for crowns, flames and feelers. */
const BOX = { x: -72, y: -118, w: 144, h: 136 };
export type Blit = { alpha?: number; flash?: number; sx?: number; sy?: number; rotation?: number; silhouette?: boolean };
const bucket = (value: number | undefined, steps: number) => value === undefined ? steps : Math.max(0, Math.min(steps, Math.ceil(value * steps)));
/** Only these sprites draw their health or shield, so only they get extra cache frames for it. */
const SHOWS_HP = new Set(['dough', 'fruitfly']);
const SHOWS_SHIELD = new Set(['shieldant']);
const STATES = new Set(['bite', 'flee', 'grab', 'hurt', 'dead', 'calm']);
/** Rim light baked around each frame: warm from the burners' side for the Guard, cool moonlight for the pests. */
const RIM: Record<SpriteKind, { color: string; dx: number; dy: number } | null> = {
  defender: { color: 'rgba(255,226,170,0.9)', dx: -1, dy: -1.6 },
  enemy: { color: 'rgba(170,200,255,0.85)', dx: 1, dy: -1.6 },
  character: null
};

export class SpriteCache {
  private frames = new Map<string, HTMLCanvasElement>();
  private pixels = 0;
  /** Frames rasterised since the last `takeMisses()`; for the perf probe. */
  misses = 0;
  /** `budget` is the most pixels kept (4 bytes each); least recently used frames go first. */
  constructor(private budget = 12_000_000) {}

  clear(): void { this.frames.clear(); this.pixels = 0; }
  takeMisses(): number { const n = this.misses; this.misses = 0; return n; }
  get size(): number { return this.frames.size; }

  private frame(kind: SpriteKind, id: string, scale: number, p: SpriteParams): HTMLCanvasElement {
    const state = p.state && STATES.has(p.state) ? p.state : '';
    const hp = SHOWS_HP.has(id) ? bucket(p.hp, 5) : '', shield = SHOWS_SHIELD.has(id) ? bucket(p.shield, 4) : '';
    // Brief poses (a strike, a flinch) hold one or two drawings, so the working set stays small enough to keep.
    const f = state === 'hurt' || state === 'dead' ? 0 : p.act ? p.frame & 1 : state ? p.frame & 3 : p.frame & 7;
    if (f !== p.frame) p = { ...p, frame: f };
    const key = `${kind}:${id}:${f}:${p.act}:${p.tier}:${p.mood ?? ''}:${state}:${hp}:${shield}:${p.dir ?? 0}:${Math.round(scale * 100)}`;
    const hit = this.frames.get(key);
    if (hit) { this.frames.delete(key); this.frames.set(key, hit); return hit; }
    this.misses++;
    const canvas = bake(kind, id, scale, p);
    this.frames.set(key, canvas); this.pixels += canvas.width * canvas.height;
    for (const [oldKey, old] of this.frames) { if (this.pixels <= this.budget) break; this.frames.delete(oldKey); this.pixels -= old.width * old.height; }
    return canvas;
  }

  /** Rasterise ahead of time (level start) so the first appearance of a pest or a boss does not hitch. */
  warm(kind: SpriteKind, id: string, size: number, pixelRatio: number, params: Partial<SpriteParams>, frames = 8): void {
    const scale = Math.max(0.2, Math.ceil(size * pixelRatio / 100 * 8) / 8);
    for (let f = 0; f < frames; f++) this.frame(kind, id, scale, { frame: f, act: 0, tier: 0, ...params });
  }

  /**
   * Draws a sprite with its feet at (x, y). `size` is the on-screen size of the 100-unit box in the context's
   * current units; `pixelRatio` is how many backing pixels one of those units covers.
   */
  draw(ctx: CanvasRenderingContext2D, kind: SpriteKind, id: string, x: number, y: number, size: number, pixelRatio: number, p: SpriteParams, blit: Blit = {}): void {
    // Quantise the raster size so a resize does not mint a new frame for every pixel of difference.
    const scale = Math.max(0.2, Math.ceil(size * pixelRatio / 100 * 8) / 8);
    const image = this.frame(kind, id, scale, p), k = size / 100;
    ctx.save();
    ctx.translate(x, y);
    if (blit.rotation) ctx.rotate(blit.rotation);
    ctx.scale((blit.sx ?? 1) * k, (blit.sy ?? 1) * k);
    if (blit.alpha !== undefined) ctx.globalAlpha *= blit.alpha;
    if (blit.silhouette) ctx.filter = 'brightness(0) opacity(0.55)';
    ctx.drawImage(image, BOX.x, BOX.y, BOX.w, BOX.h);
    if (blit.flash && blit.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= Math.min(1, blit.flash) * 0.7; ctx.drawImage(image, BOX.x, BOX.y, BOX.w, BOX.h); }
    ctx.restore();
  }
}

/** One frame: the sprite, plus a rim of light offset behind it so silhouettes separate from any ground. */
function bake(kind: SpriteKind, id: string, scale: number, p: SpriteParams): HTMLCanvasElement {
  const w = Math.max(1, Math.ceil(BOX.w * scale)), h = Math.max(1, Math.ceil(BOX.h * scale));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rim = RIM[kind];
  if (!rim || p.state === 'dead') { ctx.scale(scale, scale); ctx.translate(-BOX.x, -BOX.y); spriteFor(kind, id)(ctx, p); return canvas; }
  const body = document.createElement('canvas'); body.width = w; body.height = h;
  const bctx = body.getContext('2d');
  if (!bctx) return canvas;
  bctx.scale(scale, scale); bctx.translate(-BOX.x, -BOX.y); spriteFor(kind, id)(bctx, p);
  // tint a copy of the silhouette with the rim colour, lay it down offset, then the sprite on top
  ctx.drawImage(body, 0, 0);
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = rim.color; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const off = Math.max(1, scale * 1.4);
  const tinted = document.createElement('canvas'); tinted.width = w; tinted.height = h;
  tinted.getContext('2d')?.drawImage(canvas, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tinted, rim.dx * off, rim.dy * off);
  ctx.drawImage(body, 0, 0);
  return canvas;
}

/** A standalone canvas with one sprite on it, for DOM menus (cards, Cookbook, portraits). */
export function spriteIcon(kind: SpriteKind, id: string, cssSize: number, params: Partial<SpriteParams> = {}, silhouette = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas'), ratio = Math.min(3, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  canvas.width = Math.round(cssSize * ratio); canvas.height = Math.round(cssSize * ratio);
  canvas.style.width = `${cssSize}px`; canvas.style.height = `${cssSize}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const boss = BOSS_SPRITES.includes(id) || id === 'stew';
  // bosses are drawn small inside their box so they fit the board; portraits zoom them back up
  const k = canvas.width / (boss ? 112 : 130);
  ctx.scale(k, k); ctx.translate(boss ? 56 : 65, boss ? 106 : 116);
  if (silhouette) ctx.filter = 'brightness(0) opacity(0.5)';
  spriteFor(kind, id)(ctx, { frame: 0, act: 0, tier: 0, ...params });
  return canvas;
}

/**
 * Projectiles are tiny, so they are drawn directly (cheap paths, no shading). A case per `projectile` id used in
 * `data/defenders.ts`; unknown ids get a glowing pellet in the shot's tag colour.
 */
export function drawProjectile(ctx: CanvasRenderingContext2D, sprite: string, x: number, y: number, size: number, spin: number, color = '#ffd27a'): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  withoutShading(() => {
    switch (sprite) {
      case 'peppercorn': oval(ctx, 0, 0, 9, 9, '#3a2a22', INK, 3); oval(ctx, -2, -2, 5, 5, '#5a4232', null); shine(ctx, -3, -3, 3, 2, 0.6); break;
      case 'icechip': case 'ice': ctx.rotate(spin); shape(ctx, [-12, 0, 0, -9, 12, 0, 0, 9], '#c8f0ff', INK, 3, false); shine(ctx, -2, -2, 4, 2, 0.8); break;
      case 'egg': ctx.rotate(spin); oval(ctx, 0, 0, 10, 13, '#fff6e2', INK, 3.5); shine(ctx, -3, -5, 3, 4, 0.7); break;
      case 'toast': ctx.rotate(spin * 0.5); shape(ctx, [-12, 10, -13, -4, -8, -12, 8, -12, 13, -4, 12, 10], '#e8b46a', INK, 3); shape(ctx, [-8, 6, -9, -3, -5, -8, 5, -8, 9, -3, 8, 6], '#f6d8a0', null); break;
      case 'salt': case 'saltcrystal': ctx.rotate(spin); for (const [sx, sy] of [[-6, -3], [5, -5], [0, 5]]) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.6); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.strokeRect(-3.5, -3.5, 7, 7); ctx.restore(); } break;
      case 'garlic': case 'clove': ctx.rotate(spin * 0.3); shape(ctx, [0, -12, 9, -2, 6, 10, -6, 10, -9, -2], '#f6efe2', INK, 3); break;
      case 'seed': case 'crumb': oval(ctx, 0, 0, 7, 5, '#d9a35a', INK, 2.5); break;
      case 'sugar': case 'cube': ctx.rotate(spin); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-9, -9, 18, 18, 3); ctx.fill(); ctx.stroke(); break;
      case 'grease': case 'glob': oval(ctx, 0, 0, 10, 9, '#c4782a', INK, 3); shine(ctx, -3, -3, 3, 2, 0.7); break;
      case 'spark': star(ctx, 0, 0, 10, '#ffe27a', INK, 2); break;
      default: oval(ctx, 0, 0, 8, 8, color, INK, 3); shine(ctx, -2, -3, 3, 2, 0.7);
    }
  });
  ctx.restore();
}

export type { SpriteDraw, SpriteParams } from './kit';
