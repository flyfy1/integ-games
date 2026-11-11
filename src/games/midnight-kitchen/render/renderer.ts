import { cellFree, defenderAt, enemyDef, waveProgress } from '../sim';
import type { AttackDef, Cell, Defender, Enemy, LevelDef, Sim, SimEvent } from '../types';
import { Ambient } from './ambient';
import { drawCake, moodFor, paintBackdrop, type BoardInfo } from './board';
import { bodySize, Effects } from './effects';
import { computeLayout, type BoardLayout, type Insets } from './layout';
import { Lighting, type LightSource } from './lighting';
import { drawProjectile, SpriteCache } from './sprites';
import { flame } from './sprites/kit';

/**
 * Draws one frame from the sim plus a little view state (what the player is pointing at). No rules live here and
 * nothing here feeds back into the sim. Order: backdrop, live terrain (wet, hobs, grease, mold), decals, hints,
 * recipe links, cake, shadows, bodies and corpses back to front, shots and fire, telegraphs, night lighting and
 * dawn, ambient life, effects, markers.
 *
 * Facing: on the tall phone board every sprite gets `dir: 1` (defenders aim up the screen, pests face the camera);
 * nothing is rotated wholesale.
 */
export type CellRef = { col: number; lane: number };
export type ViewState = {
  sim: Sim | null;
  /** Wall-clock animation time in seconds. */
  time: number;
  /** Card being placed, if any. */
  card: string | null;
  spatula: boolean;
  /** Cell under the pointer or drag. */
  hover: CellRef | null;
  /** Keyboard cursor; null hides it. */
  cursor: CellRef | null;
  /** Defender whose popover is open. */
  selected: number | null;
  /** Tutorial pointers. */
  focusCell: CellRef | null;
  focusDefender: string | null;
  /**
   * (UI, optional) What placing `card` on the hovered / cursor cell would do: whether it is allowed (and why not),
   * and the Recipes it would complete with `cells` = every member cell including the target. Computed by
   * `session.ts` every frame a card is held; null otherwise. The DOM also shows a chip for it, so drawing is a bonus.
   */
  preview?: { col: number; lane: number; ok: boolean; reason: string | null; recipes: { recipe: string; color: string; cells: [number, number][] }[] } | null;
  /** (UI, optional) Cell the player's finger is dragging a card over (touch drag), for a stronger highlight. */
  dragging?: boolean;
};

export type Renderer = {
  readonly layout: BoardLayout | null;
  readonly effects: Effects;
  resize(width: number, height: number, pixelRatio: number, insets: Insets, level: LevelDef | null): BoardLayout;
  draw(ctx: CanvasRenderingContext2D, view: ViewState): void;
  onEvent(event: SimEvent, sim: Sim): void;
  update(dt: number): void;
  reset(): void;
  /** Perf probe: sprite frames rasterised since the last call, and how many are cached. */
  stats?(): { misses: number; cached: number };
};

const MENU_BOARD: BoardInfo = { activeLanes: [0, 1, 2, 3, 4], blocked: [] };
/** A little diorama behind the menus: `[sprite id, col, lane, tier]`, then the pests peeking in from the dark. */
const MENU_CAST: [string, number, number, number][] = [['burner', 0, 1, 1], ['burner', 0, 3, 0], ['pepper', 1, 1, 1], ['dough', 2, 3, 0], ['egg', 1, 3, 0], ['ice', 1, 2, 0], ['onion', 1, 0, 0], ['whisk', 1, 4, 0], ['burner', 0, 0, 2], ['chili', 0, 4, 0], ['garlic', 2, 1, 0], ['ricecooker', 0, 2, 1], ['toaster', 2, 0, 0], ['salt', 2, 4, 0]];
const MENU_PESTS: [string, number, number][] = [['ant', 7.7, 1], ['ant', 8.4, 3], ['shieldant', 8.1, 2], ['fruitfly', 7.2, 0], ['roach', 8.6, 4], ['moth', 6.9, 4]];
const WARN_COLORS: Record<string, string> = { drip: '#8fd3ff', hob: '#ff8a30', coldSnap: '#bfeaff', moldSpread: '#74c9ad', flood: '#5fb4ff', splatter: '#d08a3a', breath: '#ff6a3a', lightsOut: '#b48cff', sporeRain: '#74c9ad', toss: '#ffffff', dive: '#5fb4ff', summon: '#ff6b8a', hop: '#ffffff', rally: '#ff5a5a' };
const BOSS_IDS = new Set(['queen', 'drainking', 'greasegolem', 'baron', 'bloom']);
/** Seconds of visible wind-up for boss attacks that have no sim warning of their own (an un-aimed toss, hop, dive, rally, summon). */
const WINDUP = 1.4;
/** Attacks that sweep a lane: their cells are drawn as one band with direction chevrons. */
const LANE_KINDS = new Set(['flood', 'breath']);
const INK = '#2a1810';
const warnColor = (kind: string, boss?: string) => (kind === 'breath' ? (boss === 'bloom' ? '#bfeaff' : '#ff6a3a') : WARN_COLORS[kind] ?? '#ffffff');
type Intent = { kind: string; left: number; total: number; slot: number; planned: boolean };
type Mark = { key: string; kind: string; boss?: string; cells: [number, number][]; left: number; total: number; isBoss: boolean };

/**
 * One small pictogram per attack or hazard, so telegraphs are told apart by shape, not colour: a sugar cube (toss),
 * pests (summon), a curved double arrow (hop), speed chevrons (rally), waves (flood), a wave with a down arrow (dive),
 * a splat (grease), a flame (fire breath, hob), a snowflake (frost breath, cold snap), a crescent moon (lights out),
 * a spore cluster (spore rain, mold), a droplet (drip). Drawn in a radius-`r` circle at (x, y).
 */
function glyph(ctx: CanvasRenderingContext2D, kind: string, boss: string | undefined, x: number, y: number, r: number, color: string): void {
  ctx.save(); ctx.translate(x, y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const w = Math.max(1.5, r * 0.16);
  const strokeBoth = (fn: () => void, width = w * 1.6) => { fn(); ctx.strokeStyle = INK; ctx.lineWidth = width + w * 1.4; ctx.stroke(); fn(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); };
  const fillBoth = (fn: () => void) => { fn(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke(); };
  const flake = () => strokeBoth(() => { ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 2; ctx.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75); ctx.lineTo(-Math.cos(a) * r * 0.75, -Math.sin(a) * r * 0.75); } for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 2, px = Math.cos(a) * r * 0.5, py = Math.sin(a) * r * 0.5; ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a + 0.8) * r * 0.22, py + Math.sin(a + 0.8) * r * 0.22); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a - 0.8) * r * 0.22, py + Math.sin(a - 0.8) * r * 0.22); } }, w * 1.2);
  const fire = () => fillBoth(() => { ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.bezierCurveTo(r * 0.5, -r * 0.3, r * 0.65, r * 0.2, r * 0.45, r * 0.5); ctx.quadraticCurveTo(0, r * 0.85, -r * 0.45, r * 0.5); ctx.bezierCurveTo(-r * 0.65, r * 0.1, -r * 0.3, -r * 0.1, -r * 0.1, -r * 0.35); ctx.quadraticCurveTo(r * 0.05, -r * 0.55, 0, -r * 0.8); ctx.closePath(); });
  const waves = (n: number, y0: number) => strokeBoth(() => { ctx.beginPath(); for (let k = 0; k < n; k++) { const yy = y0 + k * r * 0.42; ctx.moveTo(-r * 0.7, yy); ctx.quadraticCurveTo(-r * 0.35, yy - r * 0.25, 0, yy); ctx.quadraticCurveTo(r * 0.35, yy + r * 0.25, r * 0.7, yy); } });
  const spores = () => { for (const [sx, sy, sr] of [[-0.32, -0.12, 0.3], [0.3, -0.2, 0.26], [0, 0.28, 0.28]] as const) fillBoth(() => { ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2); }); };
  switch (kind) {
    case 'toss': ctx.rotate(0.35); fillBoth(() => { ctx.beginPath(); ctx.roundRect(-r * 0.5, -r * 0.5, r, r, r * 0.15); }); break;
    case 'summon': for (const [sx, sy] of [[-0.38, 0.25], [0.38, 0.25], [0, -0.3]] as const) { fillBoth(() => { ctx.beginPath(); ctx.ellipse(sx * r, sy * r, r * 0.24, r * 0.2, 0, 0, Math.PI * 2); }); } break;
    case 'hop': strokeBoth(() => { ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.55); ctx.quadraticCurveTo(-r * 0.1, -r * 1.1, r * 0.55, r * 0.35); ctx.moveTo(r * 0.55, r * 0.35); ctx.lineTo(r * 0.12, r * 0.28); ctx.moveTo(r * 0.55, r * 0.35); ctx.lineTo(r * 0.62, -r * 0.08); }); break;
    case 'rally': strokeBoth(() => { ctx.beginPath(); for (const yy of [-0.25, 0.25]) { ctx.moveTo(-r * 0.5, (yy + 0.22) * r); ctx.lineTo(0, (yy - 0.22) * r); ctx.lineTo(r * 0.5, (yy + 0.22) * r); } }); break;
    case 'flood': waves(3, -r * 0.42); break;
    case 'dive': waves(1, -r * 0.4); strokeBoth(() => { ctx.beginPath(); ctx.moveTo(0, -r * 0.1); ctx.lineTo(0, r * 0.7); ctx.moveTo(-r * 0.3, r * 0.4); ctx.lineTo(0, r * 0.7); ctx.lineTo(r * 0.3, r * 0.4); }); break;
    case 'splatter':
      fillBoth(() => { ctx.beginPath(); ctx.ellipse(-r * 0.08, r * 0.08, r * 0.5, r * 0.42, 0.3, 0, Math.PI * 2); });
      for (const [sx, sy, sr] of [[0.62, -0.42, 0.17], [-0.6, -0.5, 0.13], [0.55, 0.55, 0.12]] as const) fillBoth(() => { ctx.beginPath(); ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2); });
      break;
    case 'breath': if (boss === 'bloom') flake(); else fire(); break;
    case 'hob': fire(); break;
    case 'coldSnap': flake(); break;
    case 'lightsOut': fillBoth(() => { ctx.beginPath(); ctx.arc(0, 0, r * 0.62, Math.PI * 0.3, Math.PI * 1.7); ctx.arc(r * 0.28, -r * 0.05, r * 0.5, Math.PI * 1.55, Math.PI * 0.45, true); ctx.closePath(); }); break;
    case 'sporeRain': case 'moldSpread': spores(); break;
    case 'drip': fillBoth(() => { ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.bezierCurveTo(r * 0.25, -r * 0.35, r * 0.55, 0, r * 0.5, r * 0.25); ctx.arc(0, r * 0.25, r * 0.5, 0, Math.PI); ctx.bezierCurveTo(-r * 0.55, 0, -r * 0.25, -r * 0.35, 0, -r * 0.75); ctx.closePath(); }); break;
    default: ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = w * 1.6; ctx.font = `900 ${r * 1.4}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0);
  }
  ctx.restore();
}

/** A round dark badge with a pictogram and a ring that empties as the hit approaches (`frac` = time left / total). */
function badge(ctx: CanvasRenderingContext2D, kind: string, boss: string | undefined, x: number, y: number, r: number, frac: number, color: string): void {
  ctx.fillStyle = 'rgba(24,12,8,0.86)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(2, r * 0.16); ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r * 0.88, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, frac))); ctx.stroke(); ctx.lineCap = 'butt';
  glyph(ctx, kind, boss, x, y, r * 0.66, color);
}

/** Corner brackets inside a rect: a "target" outline that reads without colour. */
function brackets(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string, width: number, inset: number, k = 0.3): void {
  const len = Math.min(r.w, r.h) * k, x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
  ctx.strokeStyle = INK; ctx.lineWidth = width + 3; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

/** Tier stars on a dark pill, sized with a pixel floor so they stay legible on small phone cells. */
function pips(ctx: CanvasRenderingContext2D, x: number, y: number, count: number, size: number): void {
  const r = Math.max(4.6, size * 0.068), step = r * 1.85, w = step * (count - 1) + r * 2.6, h = r * 2.5;
  ctx.fillStyle = 'rgba(30,14,6,0.82)'; ctx.beginPath(); ctx.roundRect(x - r * 1.3, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, r * 0.22);
  for (let i = 0; i < count; i++) {
    const cx = x + i * step;
    ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

export function createRenderer(reduced: boolean): Renderer {
  const effects = new Effects(reduced), sprites = new SpriteCache(), lighting = new Lighting(), ambient = new Ambient(reduced);
  let layout: BoardLayout | null = null, ratio = 1;
  let backdrop: HTMLCanvasElement | null = null, backdropKey = '';
  let warmedFor = '';
  /** Eyes of pests hidden in the dark, drawn over the night layer. */
  const glints: { x: number; y: number; gap: number; r: number; blink: boolean }[] = [];

  const infoFor = (level: LevelDef | null, sim: Sim | null): BoardInfo => {
    if (!level) return MENU_BOARD;
    const info: BoardInfo = { activeLanes: level.activeLanes ?? Array.from({ length: level.lanes }, (_, i) => i), blocked: level.blocked ?? [], hobs: [], frost: [], lamps: [] };
    if (sim) sim.cells.forEach((row, lane) => row.forEach((cell: Partial<Cell>, col) => {
      if (cell.hob) info.hobs!.push([col, lane]);
      if (cell.frost) info.frost!.push([col, lane]);
      if (cell.lamp) info.lamps!.push([col, lane]);
    }));
    return info;
  };
  const ensureBackdrop = (level: LevelDef | null, sim: Sim | null = null) => {
    if (!layout) return;
    const key = `${layout.w}x${layout.h}:${ratio}:${layout.vertical}:${layout.board.x | 0},${layout.board.y | 0}:${level?.id ?? 'menu'}:${level?.backdrop ?? ''}:${sim ? 1 : 0}`;
    if (key === backdropKey && backdrop) return;
    backdropKey = key;
    backdrop = document.createElement('canvas');
    backdrop.width = Math.max(1, Math.round(layout.w * ratio)); backdrop.height = Math.max(1, Math.round(layout.h * ratio));
    const ctx = backdrop.getContext('2d');
    if (ctx) { ctx.scale(ratio, ratio); paintBackdrop(ctx, layout, level?.backdrop ?? 'countertop', infoFor(level, sim)); }
    lighting.resize(layout.w, layout.h, layout.vertical);
  };
  /** Rasterise this level's pests (and its boss) ahead of time so first appearances do not hitch. */
  const warm = (sim: Sim) => {
    if (!layout) return;
    const key = `${sim.level.id}:${layout.unit | 0}:${ratio}:${layout.vertical}`;
    if (key === warmedFor) return;
    warmedFor = key;
    const ids = new Set<string>();
    for (const wave of sim.level.waves ?? []) for (const row of wave.spawns) ids.add(row[1]);
    if (sim.level.boss) ids.add(sim.level.boss);
    const dir = layout.vertical ? 1 : 0;
    for (const id of ids) {
      const def = sim.content.enemies[id];
      if (!def) continue;
      const boss = BOSS_IDS.has(id), size = bodySize(layout, def.size ?? 1, boss);
      sprites.warm('enemy', id, size, ratio, { state: 'walk', dir, shield: def.shield ? 1 : undefined }, boss ? 8 : 4);
      // the first wind-up and every phase change would otherwise rasterise mid-fight
      if (boss) for (let phase = 0; phase < (def.boss?.phases.length ?? 1); phase++) { sprites.warm('enemy', id, size, ratio, { state: 'walk', dir, tier: phase, act: 1 }, 2); if (phase) sprites.warm('enemy', id, size, ratio, { state: 'walk', dir, tier: phase }, 8); }
    }
  };
  /** Telegraph bookkeeping: when each warning was first seen (sim time), so its countdown ring knows the total. */
  const warnSeen = new Map<string, number>();
  /** Last drawn x per pest, to spot the sim's instant set-backs (cake scare, drip push) and animate them. */
  const tracks = new Map<number, { x: number; from: number; at: number; seen: number }>();
  let frameNo = 0;
  /** Boss intent badges and rally chevrons, drawn above the night layer. */
  const overlays: (() => void)[] = [];
  let marks: Mark[] = [];

  // ------------------------------------------------------------ helpers

  const frameOf = (time: number, id: number, fps = 8) => Math.floor(time * fps + id * 3) & 7;
  const bar = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, value: number, color: string, h = 5) => {
    ctx.fillStyle = 'rgba(20,10,4,0.75)'; ctx.beginPath(); ctx.roundRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - w / 2, y, Math.max(0, w * Math.min(1, value)), h, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x - w / 2 + 1, y + 0.5, Math.max(0, w * Math.min(1, value) - 2), Math.max(1, h * 0.3));
  };
  const dirOf = (L: BoardLayout) => (L.vertical ? 1 : 0);
  /** Screen offset for "toward the pests" by `k` units. */
  const ahead = (L: BoardLayout, k: number) => (L.vertical ? { x: 0, y: -k } : { x: k, y: 0 });

  function rangeHint(ctx: CanvasRenderingContext2D, L: BoardLayout, attack: AttackDef, col: number, lane: number, ok: boolean, light = 0): void {
    const tint = ok ? 'rgba(255,240,200,0.16)' : 'rgba(255,110,110,0.14)', edge = ok ? 'rgba(255,240,200,0.6)' : 'rgba(255,120,120,0.5)';
    const band = (x0: number, x1: number, laneOf = lane) => { const r = L.laneRect(laneOf, x0, Math.min(L.cols, x1)); ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 5, r.w - 6, r.h - 10, 8); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]); };
    const circle = (radius: number) => { const p = L.point(col + 0.5, lane); ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]); };
    const a = attack as AttackDef & { range?: number; radius?: number };
    switch (attack.kind) {
      case 'shoot': case 'lob': band(col + 1, a.range === undefined ? L.cols : col + 0.5 + a.range); break;
      case 'cone': case 'melee': band(col + 1, col + 0.5 + (a.range ?? 1)); break;
      case 'burst': circle((a.radius ?? 1) * L.along); break;
      case 'lanefire': band(0, L.cols); break;
      case 'generate': circle(Math.max(0.9, light * 0.5) * L.along); break;
      default:
        if ((attack.kind as string) === 'stink') band(col + 1, col + 0.5 + (a.range ?? 1.5));
        else if ((attack.kind as string) === 'aura') circle((a.radius ?? 1.2) * L.along);
        break;
    }
  }

  function actOf(d: Defender, attack: AttackDef, st: number): number {
    const since = st - d.attackAt, kind = attack.kind as string;
    if (kind === 'lanefire') return 1;
    if (kind === 'generate') return since < 0.45 ? 2 : 0;
    if (kind === 'melee') return since < 0.3 ? 2 : 0;
    if (kind === 'aura') return since < 0.5 ? 2 : since < 0.8 ? 3 : 0;
    if (since < 0.1) return 2;
    if (since < 0.28) return 3;
    if (d.cd > 0 && d.cd < 0.18 && d.stun <= 0) return 1;
    return 0;
  }

  function drawDefender(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, d: Defender, view: ViewState, ghost = false): void {
    const def = sim.content.defenders[d.def], tier = def?.tiers[Math.min(d.tier, (def?.tiers.length ?? 1) - 1)], attack: AttackDef = tier?.attack ?? { kind: 'none' };
    const t = view.time, st = sim.time, feet = L.feet(d.col + 0.5, d.lane), size = bodySize(L);
    const sinceHurt = st - d.hurtAt, age = st - d.bornAt;
    const act = ghost ? 0 : actOf(d, attack, st);
    const stunned = d.stun > 0, frozen = !!d.chilled;
    const bob = reduced || stunned ? 0 : Math.sin(t * 2.2 + d.id * 1.7) * 0.025;
    let sx = 1 - bob, sy = 1 + bob, dx = 0;
    if (!reduced) {
      if (age < 0.28) { const k = age / 0.28, pop = 1 + Math.sin(k * Math.PI) * 0.22; sx *= 0.6 + 0.4 * k; sy *= (0.6 + 0.4 * k) * pop; }
      if (act === 2 && attack.kind !== 'generate' && attack.kind !== 'melee') { sx *= 0.92; sy *= 1.08; }
      if (act === 1) { sx *= 1.05; sy *= 0.95; }
      if (sinceHurt < 0.18) dx = Math.sin(st * 90) * size * 0.03;
    }
    const hurt = !ghost && sinceHurt < 0.16;
    sprites.draw(ctx, 'defender', d.def, feet.x + dx, feet.y, size, ratio,
      { frame: stunned || frozen && reduced ? 0 : frameOf(t, d.id), act, tier: d.tier, hp: d.hp / d.maxHp, mood: stunned ? 'worried' : undefined, state: hurt ? 'hurt' : undefined, dir: dirOf(L) },
      { sx, sy, alpha: ghost ? 0.6 : stunned ? 0.8 : 1, flash: sinceHurt < 0.14 ? 1 - sinceHurt / 0.14 : 0 });
    if (ghost) return;
    if (frozen || (stunned && sim.cells[d.lane]?.[d.col]?.frost)) {
      // an ice crust over a chilled defender
      const w = size * 0.8, h = size * 0.9;
      ctx.fillStyle = 'rgba(190,235,255,0.38)'; ctx.strokeStyle = 'rgba(240,252,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(feet.x - w / 2, feet.y - h, w, h, size * 0.12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(feet.x - w * 0.36, feet.y - h * 0.9, w * 0.08, h * 0.5);
    } else if (stunned) {
      ctx.fillStyle = '#fff6b0'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = (reduced ? 0 : t * 4) + i * 2.1, x = feet.x + Math.cos(a) * size * 0.3, y = feet.y - size * 0.92 + Math.sin(a) * size * 0.08; ctx.beginPath(); ctx.arc(x, y, Math.max(3.5, size * 0.055), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    // status strip under the feet: tier stars on the left, health / charges on the right, all with pixel floors
    const barH = Math.max(4.5, size * 0.065), stripY = feet.y + Math.max(3, size * 0.05);
    if (d.tier > 0) pips(ctx, feet.x - size * 0.36, stripY + barH / 2, d.tier + 1, size);
    const barX = d.tier > 0 ? feet.x + size * 0.16 : feet.x, barW = Math.max(22, size * (d.tier > 0 ? 0.42 : 0.6));
    if (d.polish) { ctx.font = `800 ${Math.max(12, size * 0.16)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#2a1810'; ctx.strokeText(`✦${d.polish}`, feet.x + size * 0.32, feet.y - size * 0.8); ctx.fillStyle = '#fff3c4'; ctx.fillText(`✦${d.polish}`, feet.x + size * 0.32, feet.y - size * 0.8); }
    if (d.hp < d.maxHp - 0.5) bar(ctx, barX, stripY, barW, d.hp / d.maxHp, d.hp / d.maxHp > 0.4 ? '#8fe08a' : '#ff7a6b', barH);
    if (attack.kind === 'trap') bar(ctx, barX, stripY, barW, d.uses / attack.uses, '#f2b632', barH);
    if (attack.kind === 'burst' && d.cd > 0.4) bar(ctx, feet.x, feet.y - size * 1.02, Math.max(20, size * 0.5), 1 - d.cd / attack.interval, '#d9b3e6', Math.max(4, barH * 0.8));
  }

  function enemyLane(sim: Sim, e: Enemy): number {
    const since = sim.time - e.hopAt;
    if (since >= 0.45 || e.fromLane === e.lane) return e.lane;
    const k = since / 0.45, ease = k * k * (3 - 2 * k);
    return e.fromLane + (e.lane - e.fromLane) * ease;
  }

  /**
   * The attack a boss is winding up, if any: a planned (warned) attack first, else whichever un-warned attack lands
   * within `WINDUP` seconds. `left` / `total` are real sim seconds (an Endless mini-boss runs at half pace).
   */
  function bossIntent(sim: Sim, e: Enemy): Intent | null {
    const def = enemyDef(sim, e), attacks = def?.boss?.phases[e.phase]?.attacks;
    if (!attacks || e.calm) return null;
    const pace = sim.level.boss === e.def ? 1 : 0.5;
    let best: Intent | null = null;
    attacks.forEach((attack, slot) => {
      const left = Math.max(0, (e.attackTimers[slot] ?? 99) / pace), warnLead = ('warn' in attack ? attack.warn : attack.kind === 'toss' ? attack.aim ?? 0 : 0) / pace;
      const live = warnLead > 0 ? !!e.plans?.[slot] : left < WINDUP;
      if (!live) return;
      const planned = warnLead > 0, cur: Intent | null = best;
      if (!cur || (planned && !cur.planned) || (planned === cur.planned && left < cur.left)) best = { kind: attack.kind, left, total: planned ? warnLead : WINDUP, slot, planned };
    });
    return best;
  }

  /** Render-only x of a pest: the sim's instant set-backs slide over a moment instead of teleporting. */
  function shownX(e: Enemy, t: number): number {
    const tr = tracks.get(e.id);
    if (!tr || reduced) return e.x;
    const k = Math.min(1, (t - tr.at) / scatterTime(tr.from, e.x));
    return k >= 1 ? e.x : tr.from + (e.x - tr.from) * (1 - (1 - k) * (1 - k));
  }
  /** A longer set-back (the cake scatter can throw a pest ~3 columns) takes longer, so it never reads as a teleport. */
  function scatterTime(from: number, to: number): number { return 0.3 + Math.min(3, Math.abs(to - from)) * 0.1; }
  /** Height of the scared hop over the slide (0 when settled or under reduced motion). */
  function scatterHop(e: Enemy, t: number, unit: number): number {
    const tr = tracks.get(e.id);
    if (!tr || reduced) return 0;
    const k = (t - tr.at) / scatterTime(tr.from, e.x);
    return k >= 1 || k < 0 ? 0 : Math.sin(k * Math.PI) * unit * Math.min(0.45, 0.15 * Math.abs(e.x - tr.from));
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, e: Enemy, view: ViewState): void {
    const def = enemyDef(sim, e);
    if (!def) return;
    const t = view.time, st = sim.time, scale = def.size ?? 1, size = bodySize(L, scale, !!def.boss);
    const lane = enemyLane(sim, e), ex = shownX(e, t), feet = L.feet(ex, lane);
    const sinceHurt = st - e.hurtAt, sinceBite = st - e.biteAt, age = st - e.bornAt, hopping = lane !== e.lane;
    if (e.state === 'burrowed') {
      // a moving mound of crumbs
      ctx.fillStyle = '#6b4a2e'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(feet.x, feet.y - size * 0.05, size * 0.3, size * 0.14, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a6a4a'; for (let i = 0; i < 3; i++) ctx.fillRect(feet.x - size * 0.2 + i * size * 0.18, feet.y - size * 0.02 + (i % 2) * 3, 5, 4);
      return;
    }
    const remembered = effects.remembered.has(e.id), id = remembered ? 'stew' : e.def;
    const fly = def.flying ? L.unit * 0.3 : 0, hop = (hopping ? Math.sin((st - e.hopAt) / 0.45 * Math.PI) * L.unit * 0.5 : 0) + scatterHop(e, t, L.unit);
    const moving = e.state === 'walk' || e.state === 'flee';
    const pace = moving && e.stun <= 0 ? t * (6 + def.speed * 18) + e.wobble * 9 : 0;
    const rotation = reduced || !moving || def.flying ? 0 : Math.sin(pace) * 0.05;
    const bob = reduced ? 0 : def.flying ? Math.sin(t * 3 + e.wobble * 6) * L.unit * 0.05 : moving ? Math.abs(Math.sin(pace)) * size * 0.03 : 0;
    // lunge toward the defender on a bite: left on a wide board, down on a tall one
    const lunge = sinceBite < 0.16 && !reduced ? Math.sin(sinceBite / 0.16 * Math.PI) * L.unit * 0.12 : 0;
    const lx = L.vertical ? 0 : -lunge, ly = L.vertical ? lunge : 0;
    if (e.slow > 0 || e.sticky > 0) { ctx.fillStyle = e.sticky > 0 ? 'rgba(242,182,50,0.55)' : 'rgba(150,220,255,0.5)'; ctx.beginPath(); ctx.ellipse(feet.x, feet.y, size * 0.4, size * 0.15, 0, 0, Math.PI * 2); ctx.fill(); }
    const x = feet.x + lx + (sinceHurt < 0.12 && !reduced ? Math.sin(st * 80) * 2 : 0), y = feet.y - fly - hop - bob + ly;
    const boss = !!def.boss, phase = boss ? e.phase : 0, intent = boss && !remembered ? bossIntent(sim, e) : null, windup = !!intent;
    const state = remembered ? undefined : e.calm ? 'calm' : sinceHurt < 0.12 && e.state === 'walk' ? 'hurt' : e.state;
    const params = { frame: e.stun > 0 ? 0 : frameOf(t, e.id, moving ? 6 + def.speed * 14 : 8), act: windup ? 1 : 0, tier: phase, state, hp: e.hp / e.maxHp, shield: e.maxShield ? e.shield / e.maxShield : undefined, dir: dirOf(L) };
    if (e.submerged && e.submerged > 0) {
      // under the water: just ripples and a dark shape
      ctx.save(); ctx.beginPath(); ctx.rect(x - size, y - size * 0.25, size * 2, size); ctx.clip();
      sprites.draw(ctx, 'enemy', id, x, y + size * 0.35, size, ratio, params, { silhouette: true, alpha: 0.6 });
      ctx.restore();
      ctx.strokeStyle = 'rgba(200,235,255,0.7)'; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const k = ((t * 0.8 + i * 0.5) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(x, y - size * 0.2, size * (0.3 + k * 0.4), size * (0.1 + k * 0.12), 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      return;
    }
    // wind-up: the boss rears up (taller, a little narrower) and trembles more as the hit nears, over a ground ring
    // in the attack's colour; reduced motion holds the reared pose still
    let sx = e.state === 'flee' && !L.vertical ? -1 : 1, sy = 1, tremble = 0;
    if (intent) {
      const k = Math.max(0, Math.min(1, 1 - intent.left / intent.total)), color = warnColor(intent.kind, e.def);
      if (reduced) { sy = 1.06; sx *= 0.97; } else { sy = 1 + 0.03 + 0.06 * k; sx *= 1 - 0.035 * k; tremble = Math.sin(t * 46) * size * 0.012 * k; }
      lighting.glow(ctx, feet.x, feet.y - size * 0.35, size * 0.75, 0.25 + 0.35 * k, intent.kind === 'breath' && e.def === 'bloom' ? 'cool' : intent.kind === 'sporeRain' ? 'mold' : intent.kind === 'flood' || intent.kind === 'dive' ? 'cool' : 'pink');
      const pulse = reduced ? 0.6 : 0.5 + Math.sin(t * (8 + k * 10)) * 0.5;
      ctx.lineWidth = 3 + pulse * 2; ctx.setLineDash([size * 0.09, size * 0.06]); ctx.lineDashOffset = reduced ? 0 : -t * 30;
      ctx.strokeStyle = 'rgba(30,14,6,0.7)'; ctx.beginPath(); ctx.ellipse(feet.x, feet.y, size * 0.47, size * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55 + pulse * 0.45; ctx.lineWidth = 2.5 + pulse * 1.5; ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineDashOffset = 0;
      // the intent badge sits above the health bar and is drawn over the night layer
      const top = y - size * 0.8, rb = Math.max(14, L.unit * 0.34), bx = x, by = top - 12 - rb - 4, left = intent.left / intent.total;
      overlays.push(() => badge(ctx, intent.kind, e.def, bx, by, rb, left, color));
    }
    const hidden = !!e.hidden;
    sprites.draw(ctx, 'enemy', id, x + tremble, y, size, ratio, params,
      { rotation, alpha: Math.min(1, age / 0.35), flash: sinceHurt < 0.12 ? 1 - sinceHurt / 0.12 : 0, sx, sy, silhouette: hidden });
    if (intent?.kind === 'toss' && !hidden) {
      // throw pose: the sugar cube hoisted overhead, drawn back further as the throw nears
      const k = Math.max(0, Math.min(1, 1 - intent.left / intent.total)), c = Math.max(11, size * 0.2);
      const cx = x + tremble + size * (0.36 + 0.06 * k), cy = y - size * (0.62 + 0.12 * k) * sy;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(reduced ? 0.3 : 0.3 + Math.sin(t * 9) * 0.12 * k);
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, c * 0.16);
      ctx.beginPath(); ctx.roundRect(-c / 2, -c / 2, c, c, c * 0.18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(200,210,235,0.9)'; ctx.fillRect(-c * 0.32, -c * 0.32, c * 0.22, c * 0.22); ctx.fillRect(c * 0.08, c * 0.05, c * 0.2, c * 0.2);
      ctx.restore();
    }
    // a pest just thrown back from the cake (or knocked back by a drip): a fright mark and sweat drops for a moment
    const tr = tracks.get(e.id), fright = tr ? t - tr.at : 9;
    if (fright < 0.9 && !boss) {
      const fs = Math.max(9, size * 0.17), fx = x + size * 0.3, fy = y - size * 0.78 - (reduced ? 0 : Math.sin(Math.min(1, fright / 0.25) * Math.PI) * size * 0.1);
      ctx.globalAlpha = Math.min(1, (0.9 - fright) / 0.25);
      // speed lines from where it was, while it slides back
      if (!reduced && fright < 0.35 && tr) {
        const back = L.feet(tr.from, lane), a = 1 - fright / 0.35;
        ctx.strokeStyle = `rgba(255,243,214,${0.7 * a})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
        for (const o of [-0.2, 0, 0.2]) { const px = L.vertical ? o * size : 0, py = L.vertical ? 0 : o * size; ctx.moveTo(back.x + px, back.y - size * 0.3 + py); ctx.lineTo(x + px, y - size * 0.3 + py); }
        ctx.stroke();
      }
      // a jagged "yikes" bubble with an ink "!"
      ctx.fillStyle = '#fffbe8'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = fs * (i % 2 ? 0.78 : 1.05); ctx.lineTo(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `900 ${fs * 1.35}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', fx, fy + fs * 0.05);
      ctx.globalAlpha = 1;
    }
    if (hidden) {
      // only the eyes show in the dark
      // drawn after the night layer (see glints), so they shine through the dark
      glints.push({ x: x - (L.vertical ? 0 : size * 0.06), y: y - size * 0.3, gap: size * 0.08, r: Math.max(1.5, size * 0.035), blink: frameOf(t, e.id, 2) === 7 });
      return;
    }
    if (e.carrying) { const off = L.vertical ? { x: size * 0.25, y: -size * 0.4 } : { x: size * 0.2, y: -size * 0.5 }; sprites.draw(ctx, 'defender', e.carrying.def, x + off.x, y + off.y, bodySize(L) * 0.5, ratio, { frame: 0, act: 0, tier: e.carrying.tier, mood: 'worried', dir: dirOf(L) }); }
    const top = y - size * (boss ? 0.8 : 0.86);
    if (e.burn > 0) { ctx.save(); ctx.translate(x, top + size * 0.12); ctx.scale(size / 100, size / 100); flame(ctx, 0, 0, 16, frameOf(t, e.id, 12)); ctx.restore(); }
    if (e.stun > 0) {
      ctx.fillStyle = '#fff6b0'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = (reduced ? 0 : t * 5) + i * 2.1; ctx.beginPath(); ctx.arc(x + Math.cos(a) * size * 0.26, top + Math.sin(a) * size * 0.07, Math.max(3, size * 0.05), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    if (e.rally > 0) { ctx.strokeStyle = 'rgba(255,90,90,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(feet.x, feet.y, size * 0.42, size * 0.16, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (boss) {
      if (e.calm && !remembered) { bar(ctx, x, top - 12, L.unit * 1.5, e.warmth ?? 0, '#ffc46a', 8); return; }
      if (remembered) return;
      bar(ctx, x, top - 12, L.unit * 1.5, e.hp / e.maxHp, '#ff6b8a', 8);
      // phase notches
      const phases = def.boss?.phases ?? [];
      ctx.fillStyle = '#2a1810';
      for (const p of phases) if (p.below < 1) ctx.fillRect(x - L.unit * 0.75 + L.unit * 1.5 * p.below - 1, top - 13, 2, 10);
      return;
    }
    const eh = Math.max(4.5, size * 0.06), ew = Math.max(22, size * 0.55);
    if (e.maxShield && e.shield > 0 && sinceHurt < 1.6) bar(ctx, x, top - eh, ew, e.shield / e.maxShield, '#e8bd74', eh);
    else if (e.hp < e.maxHp && (sinceHurt < 1.6 || e.maxHp >= 400)) bar(ctx, x, top - eh, ew, e.hp / e.maxHp, '#ff8a6b', eh);
  }

  /** Live terrain: wet tiles, lit hobs, grease and grease fires, mold and slime. */
  function drawTerrain(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, t: number): void {
    for (let lane = 0; lane < sim.level.lanes; lane++) for (let col = 0; col < sim.level.cols; col++) {
      const cell = sim.cells[lane]?.[col] as Partial<Cell> | undefined;
      if (!cell) continue;
      const r = L.cellRect(col, lane), cx = r.x + r.w / 2, cy = r.y + r.h / 2, m = Math.min(r.w, r.h);
      if ((cell.wet ?? 0) > 0) {
        const a = Math.min(1, (cell.wet ?? 0) / 2);
        // a puddle: darker water with a bright rim, a ripple ring and a sheen, so it reads on the steel sink too
        ctx.fillStyle = `rgba(70,140,215,${0.42 * a})`; ctx.beginPath(); ctx.ellipse(cx, cy + m * 0.08, r.w * 0.42, r.h * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(200,236,255,${0.75 * a})`; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = `rgba(230,248,255,${0.55 * a})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx + r.w * 0.08, cy + m * 0.12, r.w * 0.16, r.h * 0.11, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`; ctx.beginPath(); ctx.ellipse(cx - r.w * 0.2, cy - m * 0.03, r.w * 0.1, Math.max(1.2, m * 0.025), -0.2, 0, Math.PI * 2); ctx.fill();
      }
      if (cell.hob && (cell.hobLit ?? 0) > 0) {
        const pulse = reduced ? 0.8 : 0.7 + Math.sin(t * 8 + col) * 0.15, rr = m * 0.38;
        ctx.strokeStyle = `rgba(255,120,40,${pulse})`; ctx.lineWidth = Math.max(2, rr * 0.14);
        for (const k of [0.75, 0.5]) { ctx.beginPath(); ctx.arc(cx, cy, rr * k, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
        if (!reduced) for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t; ctx.save(); ctx.translate(cx + Math.cos(a) * rr * 0.75, cy + Math.sin(a) * rr * 0.75); ctx.scale(m / 260, m / 260); flame(ctx, 0, 0, 14, (Math.floor(t * 12) + i) & 7, '#4fa8ff', '#dff6ff'); ctx.restore(); }
      }
      if ((cell.grease ?? 0) > 0) {
        // a flat, glossy amber slick with a wobbly edge and a bright sheen, so it reads as liquid on the floor
        const burning = (cell.burning ?? 0) > 0, gy = cy + m * 0.12, rx = r.w * 0.48, ry = Math.min(r.h * 0.17, m * 0.19), s = (col * 7 + lane * 3) % 5 / 5;
        // three overlapping lobes make a soft, organic puddle outline
        const blob = (k: number, dy = 0) => {
          ctx.beginPath();
          ctx.ellipse(cx - rx * 0.18 * k, gy + dy, rx * 0.7 * k, ry * 0.85 * k, 0, 0, Math.PI * 2);
          ctx.moveTo(cx + rx * k, gy + dy - ry * 0.1); ctx.ellipse(cx + rx * 0.35 * k, gy + dy - ry * 0.1, rx * 0.65 * k, ry * 0.75 * k, 0, 0, Math.PI * 2);
          ctx.moveTo(cx + rx * (0.15 + s * 0.3) * k + rx * 0.35 * k, gy + dy + ry * 0.35 * k); ctx.ellipse(cx + rx * (0.15 + s * 0.3) * k, gy + dy + ry * 0.35 * k, rx * 0.35 * k, ry * 0.5 * k, 0, 0, Math.PI * 2);
        };
        blob(1); ctx.fillStyle = burning ? 'rgba(130,60,14,0.7)' : 'rgba(196,128,36,0.6)'; ctx.fill();
        blob(0.72, -ry * 0.08); ctx.fillStyle = burning ? 'rgba(255,140,40,0.45)' : 'rgba(255,200,96,0.42)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,248,220,0.85)'; ctx.lineWidth = Math.max(1.5, m * 0.035); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(cx - rx * 0.2, gy - ry * 0.25, rx * 0.42, ry * 0.32, 0, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
        ctx.fillStyle = 'rgba(255,248,220,0.8)'; ctx.beginPath(); ctx.arc(cx + rx * 0.4, gy + ry * 0.1, Math.max(1.5, m * 0.03), 0, Math.PI * 2); ctx.arc(cx + rx * 0.25, gy + ry * 0.35, Math.max(1, m * 0.02), 0, Math.PI * 2); ctx.fill();
      }
      if ((cell.burning ?? 0) > 0) {
        // a grease fire: a hot glow on the floor and a row of tall flames across the whole cell
        lighting.glow(ctx, cx, cy + m * 0.1, m * 0.75, 0.55, 'warm');
        for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(cx + (i - 1.5) * r.w * 0.2, cy + m * 0.28 - (i % 2) * m * 0.05); ctx.scale(m / 80, m / 80); flame(ctx, 0, 0, 22 + ((i + col) % 3) * 6, reduced ? i * 2 : (Math.floor(t * 12) + i * 3) & 7); ctx.restore(); }
      }
      if (cell.frost && cell.warm) {
        // frost thawed by a nearby Burner or Rice Cooker: a warm, melted patch (safe to stand on)
        ctx.fillStyle = 'rgba(255,190,110,0.2)'; ctx.beginPath(); ctx.roundRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 9); ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,150,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(200,236,255,0.6)'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(r.x + r.w * (0.28 + i * 0.4), r.y + r.h * (0.72 - i * 0.4), m * 0.06, m * 0.035, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      if ((cell.slime ?? 0) > 0) { ctx.fillStyle = `rgba(207,233,138,${Math.min(0.5, (cell.slime ?? 0) * 0.12)})`; ctx.beginPath(); ctx.roundRect(r.x + 2, r.y + r.h * 0.3, r.w - 4, r.h * 0.4, r.h * 0.2); ctx.fill(); ctx.fillStyle = `rgba(255,255,255,${Math.min(0.3, (cell.slime ?? 0) * 0.06)})`; ctx.fillRect(r.x + r.w * 0.2, r.y + r.h * 0.38, r.w * 0.3, 3); }
      if ((cell.mold ?? 0) > 0) {
        const a = Math.min(1, (cell.mold ?? 0) / 2);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(40,90,74,0.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + m * 0.05, r.w * 0.44, r.h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 7; i++) { const ang = i * 0.9 + col, rad = m * (0.13 + (i % 3) * 0.06); ctx.fillStyle = i % 2 ? '#4f9c86' : '#63b79c'; ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * r.w * 0.24, cy + Math.sin(ang) * r.h * 0.22, rad, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(220,255,240,0.5)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx + Math.cos(i * 1.7) * r.w * 0.24, cy + Math.sin(i * 2.3) * r.h * 0.2 - 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#2f6f5c'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx + Math.cos(i * 1.7) * r.w * 0.22, cy + Math.sin(i * 2.3) * r.h * 0.2, 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Everything about to land, as marks: the sim's warnings (hazards and warned boss attacks, with the cells it chose)
   * plus the boss moves the sim does not pre-target but whose reach is known: a hop lands in a neighbouring lane,
   * a dive goes under right where the boss stands. An aimed toss arrives as a sim warning (kind 'toss', one cell) and
   * is drawn from it only, so it is never marked twice; summon and rally get only the boss's badge and pose.
   */
  function collectMarks(sim: Sim): Mark[] {
    const marks: Mark[] = [], live = new Set<string>();
    const bossOnBoard = sim.enemies.find(e => BOSS_IDS.has(e.def) && e.hp > 0 && !e.gone)?.def;
    const since = (key: string, left: number) => { live.add(key); let start = warnSeen.get(key); if (start === undefined) { start = sim.time; warnSeen.set(key, start); } return Math.max(0.6, left + (sim.time - start)); };
    for (const w of sim.warnings) {
      let cells = w.cells as [number, number][];
      // a cold snap only bites defenders standing on frost out of reach of warmth
      if (w.kind === 'coldSnap') cells = cells.filter(([col, lane]) => defenderAt(sim, col, lane) && !sim.cells[lane]?.[col]?.warm);
      if (!cells.length) continue;
      const key = `w${w.id}`, left = Math.max(0, w.at - sim.time);
      marks.push({ key, kind: w.kind, boss: w.boss ? bossOnBoard : undefined, cells, left, total: since(key, left), isBoss: w.boss });
    }
    for (const e of sim.enemies) {
      if (!BOSS_IDS.has(e.def) || e.hp <= 0 || e.gone || e.state === 'burrowed') continue;
      const intent = bossIntent(sim, e);
      if (!intent || (intent.kind !== 'hop' && intent.kind !== 'dive')) continue;
      const col = Math.max(0, Math.min(sim.level.cols - 1, Math.floor(e.x)));
      const cells: [number, number][] = intent.kind === 'dive' ? [[col, e.lane]] : sim.activeLanes.filter(l => Math.abs(l - e.lane) === 1).map(l => [col, l] as [number, number]);
      if (cells.length) marks.push({ key: `b${e.id}:${intent.slot}`, kind: intent.kind, boss: e.def, cells, left: intent.left, total: intent.total, isBoss: true });
    }
    for (const key of warnSeen.keys()) if (!live.has(key)) warnSeen.delete(key);
    return marks;
  }

  /**
   * Telegraph floor marks, under the bodies so the defender about to be hit stays visible: a tint and corner
   * "target" brackets on each cell; boss attacks add hazard stripes; lane sweeps (flood, breath) become one band with
   * chevrons pointing the way the attack travels; a hop shows arrows into the lanes it may land in.
   */
  function drawWarningFloor(ctx: CanvasRenderingContext2D, L: BoardLayout, marks: Mark[], t: number): void {
    for (const m of marks) {
      const color = warnColor(m.kind, m.boss), urgency = Math.max(0, Math.min(1, 1 - m.left / m.total));
      const pulse = reduced ? 0.8 : 0.65 + Math.sin(t * (6 + urgency * 10)) * 0.35;
      if (LANE_KINDS.has(m.kind)) {
        const lanes = new Map<number, number[]>();
        for (const [col, lane] of m.cells) lanes.set(lane, [...(lanes.get(lane) ?? []), col]);
        for (const [lane, cols] of lanes) {
          const r = L.laneRect(lane, Math.min(...cols), Math.max(...cols) + 1), inset = 4;
          ctx.fillStyle = color; ctx.globalAlpha = 0.22 + urgency * 0.22; ctx.beginPath(); ctx.roundRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, 10); ctx.fill();
          ctx.globalAlpha = 1; ctx.setLineDash([9, 7]); ctx.lineDashOffset = reduced ? 0 : -t * 24;
          ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = pulse; ctx.stroke();
          ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
          // chevrons along the band: a breath travels toward the cake, a flood fills the whole lane (both ways)
          const n = cols.length, s = Math.min(r.w, r.h) * 0.16;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 0; i < n; i++) {
            const c = Math.min(...cols) + i + 0.5, p = L.point(c, lane), shift = reduced ? 0 : ((t * 1.6) % 1 - 0.5) * s * 0.8;
            const dirs = m.kind === 'flood' ? [1, -1] : [-1];
            for (const dir of dirs) {
              // dir -1 = toward column 0 (left on the wide board, down on the tall one)
              const ox = L.vertical ? 0 : dir * (s * 0.9 + shift), oy = L.vertical ? -dir * (s * 0.9 + shift) : 0;
              ctx.beginPath();
              if (L.vertical) { ctx.moveTo(p.x - s, p.y + oy + dir * s * 0.6); ctx.lineTo(p.x, p.y + oy - dir * s * 0.1); ctx.lineTo(p.x + s, p.y + oy + dir * s * 0.6); }
              else { ctx.moveTo(p.x + ox - dir * s * 0.6, p.y - s); ctx.lineTo(p.x + ox + dir * s * 0.1, p.y); ctx.lineTo(p.x + ox - dir * s * 0.6, p.y + s); }
              ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
            }
          }
        }
      }
      for (const [col, lane] of m.cells) {
        const r = L.cellRect(col, lane);
        if (!LANE_KINDS.has(m.kind)) {
          ctx.fillStyle = m.kind === 'lightsOut' ? 'rgba(12,6,24,0.5)' : color; ctx.globalAlpha = m.kind === 'lightsOut' ? 0.5 + urgency * 0.4 : 0.12 + urgency * 0.2;
          ctx.beginPath(); ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10); ctx.fill(); ctx.globalAlpha = 1;
        }
        if (m.isBoss && !LANE_KINDS.has(m.kind)) {
          // hazard stripes: a boss is about to land here
          ctx.save(); ctx.beginPath(); ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10); ctx.clip();
          ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = Math.max(3, Math.min(r.w, r.h) * 0.08);
          const step = Math.min(r.w, r.h) * 0.28; ctx.beginPath();
          for (let d = -r.h; d < r.w; d += step) { ctx.moveTo(r.x + d, r.y + r.h); ctx.lineTo(r.x + d + r.h, r.y); }
          ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
        }
        if (!LANE_KINDS.has(m.kind)) brackets(ctx, r, color, 3, 5 - pulse * (reduced ? 0 : 2), 0.3);
        if (m.kind === 'toss') {
          // an aimed throw: the cube's shadow on the floor, growing as it falls toward the target (crosshair: see glyphs)
          const p = L.feet(col + 0.5, lane), s = Math.min(r.w, r.h) * 0.3;
          ctx.fillStyle = 'rgba(16,8,24,0.45)'; ctx.beginPath(); ctx.ellipse(p.x, p.y - s * 0.15, s * (0.35 + urgency * 0.75), s * (0.14 + urgency * 0.3), 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  /**
   * Recipe preview while a card is held over a cell: every member cell of each Recipe it would complete gets a tint
   * in the recipe's colour, corner brackets and a small linked-rings tag, so the combo reads without colour too.
   */
  function drawRecipePreview(ctx: CanvasRenderingContext2D, L: BoardLayout, view: ViewState): void {
    const recipes = view.card ? view.preview?.recipes : undefined;
    if (!recipes?.length) return;
    const pulse = reduced ? 0.8 : 0.65 + Math.sin(view.time * 5) * 0.35;
    recipes.forEach((preview, index) => {
      for (const [col, lane] of preview.cells) {
        const r = L.cellRect(col, lane), inset = 4 + index * 3;
        ctx.fillStyle = preview.color; ctx.globalAlpha = 0.22 * pulse + 0.08;
        ctx.beginPath(); ctx.roundRect(r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, 10); ctx.fill(); ctx.globalAlpha = 1;
        brackets(ctx, r, preview.color, 3.5, inset + 1, 0.34);
        // linked rings: "these combine"
        const s = Math.max(5, Math.min(r.w, r.h) * 0.11), x = r.x + inset + s * 2.2, y = r.y + r.h - inset - s * 1.6;
        ctx.fillStyle = 'rgba(30,14,6,0.8)'; ctx.beginPath(); ctx.roundRect(x - s * 1.9, y - s * 1.25, s * 3.8, s * 2.5, s * 1.2); ctx.fill();
        ctx.lineWidth = Math.max(2, s * 0.38); ctx.strokeStyle = preview.color;
        ctx.beginPath(); ctx.arc(x - s * 0.55, y, s * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + s * 0.55, y, s * 0.72, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }

  /**
   * Finale: golden ribbons from every warm guard that is reaching the calm Bloom (the same reach rule the sim uses),
   * so the player sees which defenders are warming it and where to put more.
   */
  function drawWarmth(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, t: number): void {
    for (const e of sim.enemies) {
      if (!e.calm || effects.remembered.has(e.id)) continue;
      const to = L.point(e.x, e.lane);
      lighting.glow(ctx, to.x, to.y - L.unit * 0.3, L.unit * (1.2 + (e.warmth ?? 0) * 1.4), 0.25 + (e.warmth ?? 0) * 0.4, 'gold');
      for (const d of sim.defenders) {
        const warm = sim.content.defenders[d.def]?.warm, reach = warm ? warm + d.tier * 0.5 : 0;
        if (reach <= 0 || d.stun > 0 || Math.hypot(d.col + 0.5 - e.x, d.lane - e.lane) > reach + 0.75) continue;
        const from = L.point(d.col + 0.5, d.lane), mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 - L.unit * 0.5;
        const path = () => { ctx.beginPath(); ctx.moveTo(from.x, from.y - L.unit * 0.3); ctx.quadraticCurveTo(mx, my, to.x, to.y - L.unit * 0.4); };
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.strokeStyle = '#ffc46a'; ctx.lineWidth = L.unit * 0.26; path(); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(120,60,20,0.55)'; ctx.lineWidth = Math.max(5, L.unit * 0.11); path(); ctx.stroke();
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = Math.max(3, L.unit * 0.07); path(); ctx.stroke();
        ctx.strokeStyle = '#fff1c4'; ctx.lineWidth = Math.max(2, L.unit * 0.035); ctx.setLineDash([L.unit * 0.1, L.unit * 0.12]); ctx.lineDashOffset = reduced ? 0 : -t * 30; path(); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        // a little heart rides each ribbon toward the Bloom
        const k = reduced ? 0.5 : (t * 0.6 + d.id * 0.37) % 1, hx = (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * mx + k * k * to.x, hy = (1 - k) * (1 - k) * (from.y - L.unit * 0.3) + 2 * (1 - k) * k * my + k * k * (to.y - L.unit * 0.4), hs = Math.max(4, L.unit * 0.09);
        ctx.fillStyle = '#ff8fa3'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, hy + hs * 0.8); ctx.bezierCurveTo(hx - hs * 1.2, hy, hx - hs * 0.6, hy - hs, hx, hy - hs * 0.35); ctx.bezierCurveTo(hx + hs * 0.6, hy - hs, hx + hs * 1.2, hy, hx, hy + hs * 0.8); ctx.fill(); ctx.stroke();
      }
    }
  }

  /** Rally wind-up: speed chevrons over every pest that is about to be hurried along. */
  function drawRally(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, t: number): void {
    const rallying = sim.enemies.some(e => BOSS_IDS.has(e.def) && !e.gone && bossIntent(sim, e)?.kind === 'rally');
    if (!rallying) return;
    for (const e of sim.enemies) {
      const def = enemyDef(sim, e);
      if (!def || def.boss || e.gone || e.hidden || e.state === 'burrowed') continue;
      const size = bodySize(L, def.size ?? 1), f = L.feet(shownX(e, t), e.lane), x = f.x - size * 0.32, y = f.y - size * 0.75 - (def.flying ? L.unit * 0.3 : 0) - (reduced ? 0 : (t * 2 % 1) * size * 0.08), s = Math.max(5, size * 0.1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      for (const k of [0, 1]) { const yy = y + k * s * 0.9; ctx.moveTo(x - s, yy + s * 0.6); ctx.lineTo(x, yy - s * 0.2); ctx.lineTo(x + s, yy + s * 0.6); }
      ctx.strokeStyle = INK; ctx.lineWidth = 5.5; ctx.stroke(); ctx.strokeStyle = WARN_COLORS.rally; ctx.lineWidth = 2.8; ctx.stroke();
    }
  }

  /** Telegraph pictograms with countdown rings, drawn over the night so they stay readable in the dark Pantry. */
  function drawWarningGlyphs(ctx: CanvasRenderingContext2D, L: BoardLayout, marks: Mark[]): void {
    for (const m of marks) {
      const color = warnColor(m.kind, m.boss), frac = m.left / m.total;
      // a lane sweep gets one pictogram per lane, at its cake-side end (where it hurts most)
      const cells = LANE_KINDS.has(m.kind) ? [...new Set(m.cells.map(c => c[1]))].map(lane => [Math.min(...m.cells.filter(c => c[1] === lane).map(c => c[0])), lane] as [number, number]) : m.cells;
      for (const [col, lane] of cells) {
        const r = L.cellRect(col, lane), rb = Math.max(10, Math.min(17, Math.min(r.w, r.h) * 0.27));
        if (m.kind === 'toss') {
          // an aimed throw: a crosshair over the guard it will hit, open in the middle so the face stays readable
          const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5, s = Math.min(r.w, r.h) * 0.42;
          ctx.lineCap = 'round';
          for (const [w, c] of [[5, INK], [2.5, color]] as [number, string][]) {
            ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2);
            ctx.moveTo(cx - s * 1.2, cy); ctx.lineTo(cx - s * 0.7, cy); ctx.moveTo(cx + s * 0.7, cy); ctx.lineTo(cx + s * 1.2, cy);
            ctx.moveTo(cx, cy - s * 1.2); ctx.lineTo(cx, cy - s * 0.7); ctx.moveTo(cx, cy + s * 0.7); ctx.lineTo(cx, cy + s * 1.2); ctx.stroke();
          }
        }
        badge(ctx, m.kind, m.boss, r.x + r.w - rb - 3, r.y + rb + 3, rb, frac, color);
      }
    }
  }

  /** Recipe links: a glowing ribbon with sparks running along it and a badge in the middle. */
  function drawLinks(ctx: CanvasRenderingContext2D, L: BoardLayout, sim: Sim, view: ViewState): void {
    const draw = (points: { x: number; y: number }[], color: string, ghost: boolean, seed: number) => {
      if (points.length < 2) return;
      const lift = L.unit * 0.06;
      const path = () => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - lift) : ctx.moveTo(p.x, p.y - lift)); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (!ghost) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.strokeStyle = color; ctx.lineWidth = L.unit * 0.3; path(); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      ctx.strokeStyle = 'rgba(30,14,6,0.6)'; ctx.lineWidth = L.unit * 0.13; path(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = L.unit * 0.075; ctx.globalAlpha = ghost ? 0.55 + Math.sin(view.time * 6) * 0.25 : 1;
      ctx.setLineDash([L.unit * 0.12, L.unit * 0.09]); ctx.lineDashOffset = reduced ? 0 : -view.time * 22; path(); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (ghost || reduced) return;
      // sparks travelling along the ribbon
      ctx.fillStyle = '#ffffff';
      for (let s = 0; s < points.length - 1; s++) for (let i = 0; i < 2; i++) {
        const k = (view.time * 0.7 + i * 0.5 + seed * 0.13) % 1, a = points[s], b = points[s + 1];
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k - lift - Math.sin(k * Math.PI) * L.unit * 0.12;
        ctx.globalAlpha = Math.sin(k * Math.PI); ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, L.unit * 0.035), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const order = (points: { x: number; y: number }[], cells: { col: number; lane: number }[]) => {
      // order a triple so the line passes through the middle member
      if (points.length !== 3) return points;
      const mid = cells.findIndex(m => cells.every(o => o === m || Math.abs(o.col - m.col) + Math.abs(o.lane - m.lane) === 1));
      if (mid < 0) return points;
      const out = [...points]; [out[1], out[mid]] = [out[mid], out[1]]; return out;
    };
    for (const link of sim.links) {
      const recipe = sim.content.recipes.find(r => r.id === link.recipe), members = link.ids.map(id => sim.defenders.find(d => d.id === id)).filter((d): d is Defender => !!d);
      if (!recipe || members.length < 2) continue;
      draw(order(members.map(d => L.feet(d.col + 0.5, d.lane)), members), recipe.color, false, link.ids[0]);
    }
    for (const preview of view.preview?.recipes ?? []) {
      const cells = preview.cells.map(([col, lane]) => ({ col, lane }));
      draw(order(cells.map(c => L.feet(c.col + 0.5, c.lane)), cells), preview.color, true, 0);
    }
  }

  function collectLights(L: BoardLayout, view: ViewState, flicker: number): { lights: LightSource[]; dark: { x: number; y: number; w: number; h: number }[] } {
    const sim = view.sim, lights: LightSource[] = [], dark: { x: number; y: number; w: number; h: number }[] = [];
    lights.push({ x: L.cake.x, y: L.cake.y, r: L.cake.r * 3.4 * flicker, strength: 0.95, warm: 0.55, color: 'gold' });
    if (!sim) {
      for (const [id, col, lane] of MENU_CAST) if (id === 'burner' || id === 'ricecooker') { const p = L.point(col + 0.5, lane); lights.push({ x: p.x, y: p.y, r: L.along * 2.6 * flicker, strength: 1, warm: 0.5 }); }
      return { lights, dark };
    }
    for (const d of sim.defenders) {
      const def = sim.content.defenders[d.def], p = L.point(d.col + 0.5, d.lane);
      const pulse = sim.time - d.attackAt < 0.5 ? 1.15 : 1;
      if (def?.light) { const r = (def.light + d.tier * 0.35) * L.along * flicker * pulse; lights.push({ x: p.x, y: p.y, r, strength: 1, warm: 0.5 }); }
      else lights.push({ x: p.x, y: p.y, r: L.along * 0.85, strength: 0.45 });
    }
    for (const e of sim.enemies) {
      const def = enemyDef(sim, e);
      if (!def) continue;
      const p = L.point(e.x, e.lane);
      if (e.burn > 0) lights.push({ x: p.x, y: p.y, r: L.along, strength: 0.6, warm: 0.4 });
      else if (def.boss) lights.push({ x: p.x, y: p.y, r: L.along * 1.6, strength: 0.6, warm: e.def === 'bloom' ? 0.35 : 0, color: e.def === 'bloom' ? (e.calm ? 'gold' : 'mold') : 'warm' });
      else if (def.moldOnDeath) lights.push({ x: p.x, y: p.y - L.unit * 0.3, r: L.along * 0.6, strength: 0.25, warm: 0.25, color: 'mold' });
    }
    for (const z of sim.zones) { const a = L.point(0.5, z.lane), b = L.point(L.cols - 0.5, z.lane), n = 4; for (let i = 0; i < n; i++) { const k = i / (n - 1); lights.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, r: L.along * 1.4, strength: 0.9, warm: 0.45 }); } }
    for (const p of sim.projectiles) if (p.tag === 'fire' || p.tag === 'toast' || p.tag === 'heat') { const at = L.point(p.x, p.lane); lights.push({ x: at.x, y: at.y, r: L.along * 0.5, strength: 0.4 }); }
    for (let lane = 0; lane < sim.level.lanes; lane++) for (let col = 0; col < sim.level.cols; col++) {
      const cell = sim.cells[lane]?.[col] as Partial<Cell> | undefined;
      if (!cell) continue;
      if (cell.hob && (cell.hobLit ?? 0) > 0) { const p = L.point(col + 0.5, lane); lights.push({ x: p.x, y: p.y, r: L.along * 1.3, strength: 0.9, warm: 0.5 }); }
      if ((cell.burning ?? 0) > 0) { const p = L.point(col + 0.5, lane); lights.push({ x: p.x, y: p.y, r: L.along * 1.2, strength: 0.9, warm: 0.6 }); }
      if (cell.lamp && (cell.snuff ?? 0) <= 0) { const p = L.point(col + 0.5, lane); lights.push({ x: p.x, y: p.y, r: L.along * 1.6, strength: 0.9, warm: 0.4, color: 'gold' }); }
      if (cell.dark && !cell.lit) dark.push(L.cellRect(col, lane));
    }
    return { lights, dark };
  }

  function drawMarkers(ctx: CanvasRenderingContext2D, L: BoardLayout, view: ViewState): void {
    const pulse = reduced ? 0.5 : 0.5 + Math.sin(view.time * 5) * 0.5;
    const corners = (col: number, lane: number, color: string, width: number, inset: number) => {
      const r = L.cellRect(col, lane), k = Math.min(r.w, r.h) * 0.26, x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + k, y0);
      ctx.moveTo(x1 - k, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + k);
      ctx.moveTo(x1, y1 - k); ctx.lineTo(x1, y1); ctx.lineTo(x1 - k, y1);
      ctx.moveTo(x0 + k, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - k);
      ctx.stroke();
    };
    if (view.cursor) { corners(view.cursor.col, view.cursor.lane, 'rgba(20,10,4,0.8)', 7, 3); corners(view.cursor.col, view.cursor.lane, '#ffffff', 3.5, 3); }
    const focus = (col: number, lane: number) => {
      const r = L.cellRect(col, lane);
      ctx.strokeStyle = `rgba(255,214,90,${0.55 + pulse * 0.45})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(r.x + 3 - pulse * 2, r.y + 3 - pulse * 2, r.w - 6 + pulse * 4, r.h - 6 + pulse * 4, 10); ctx.stroke();
      const ax = r.x + r.w / 2, ay = r.y - 6 - pulse * 8;
      ctx.fillStyle = '#ffd65a'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay + 12); ctx.lineTo(ax - 11, ay - 4); ctx.lineTo(ax - 4, ay - 4); ctx.lineTo(ax - 4, ay - 16); ctx.lineTo(ax + 4, ay - 16); ctx.lineTo(ax + 4, ay - 4); ctx.lineTo(ax + 11, ay - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    if (view.focusCell) focus(view.focusCell.col, view.focusCell.lane);
    if (view.focusDefender && view.sim) { const d = view.sim.defenders.find(item => item.def === view.focusDefender); if (d) focus(d.col, d.lane); }
  }

  /** The entry edge glows and chevrons march in while a big wave is announced. */
  function drawAlarm(ctx: CanvasRenderingContext2D, L: BoardLayout, t: number): void {
    if (effects.alarm <= 0) return;
    const a = (reduced ? 0.45 : 0.3 + Math.sin(t * 6) * 0.2) * Math.min(1, effects.alarm);
    for (let lane = 0; lane < L.lanes; lane++) {
      const r = L.laneRect(lane, L.cols, L.cols + 0.7);
      lighting.glow(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.8, a * 0.9, 'pink');
      const p = L.point(L.cols + 0.3, lane), s = L.unit * 0.16, shift = reduced ? 0 : ((t * 1.5) % 1) * s;
      ctx.strokeStyle = `rgba(255,90,90,${Math.min(1, a * 2)})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const o = i * s * 1.2 + shift;
        if (L.vertical) { ctx.moveTo(p.x - s, p.y - s * 0.6 + o); ctx.lineTo(p.x, p.y + o); ctx.lineTo(p.x + s, p.y - s * 0.6 + o); }
        else { ctx.moveTo(p.x + s * 0.6 - o, p.y - s); ctx.lineTo(p.x - o, p.y); ctx.lineTo(p.x + s * 0.6 - o, p.y + s); }
      }
      ctx.stroke();
    }
  }

  function draw(ctx: CanvasRenderingContext2D, view: ViewState): void {
    const L = layout;
    if (!L) return;
    const sim = view.sim, t = view.time;
    ensureBackdrop(sim?.level ?? null, sim);
    if (sim) warm(sim);
    const mood = moodFor(sim?.level.backdrop);
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (effects.shake > 0 && !reduced) ctx.translate(Math.sin(t * 70) * effects.shake * 5, Math.cos(t * 83) * effects.shake * 4);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, L.w, L.h);

    if (sim) {
      drawTerrain(ctx, L, sim, t);
      effects.drawDecals(ctx);
      for (const zone of sim.zones) { const r = L.laneRect(zone.lane, 0, L.cols), a = Math.min(1, zone.t / 0.6); ctx.fillStyle = `rgba(255,120,30,${0.28 * a})`; ctx.beginPath(); ctx.roundRect(r.x, r.y + 3, r.w, r.h - 6, 10); ctx.fill(); }

      // placement and selection hints
      const target = view.hover ?? view.cursor;
      if (view.card) {
        const def = sim.content.defenders[view.card];
        // every free cell gets a soft dot so the player sees where the card can go
        ctx.fillStyle = 'rgba(255,240,200,0.32)';
        for (const lane of sim.activeLanes) for (let col = 0; col < sim.level.cols; col++) if (cellFree(sim, col, lane)) { const p = L.point(col + 0.5, lane); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, L.unit * 0.05), 0, Math.PI * 2); ctx.fill(); }
        if (target && def) {
          const ok = view.preview && view.preview.col === target.col && view.preview.lane === target.lane ? view.preview.ok : cellFree(sim, target.col, target.lane), r = L.cellRect(target.col, target.lane);
          rangeHint(ctx, L, def.tiers[0].attack, target.col, target.lane, ok, def.light);
          ctx.fillStyle = ok ? 'rgba(140,235,150,0.3)' : 'rgba(255,100,100,0.32)'; ctx.strokeStyle = ok ? '#a8f0a0' : '#ff8a8a'; ctx.lineWidth = view.dragging ? 4.5 : 3;
          ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.fill(); ctx.stroke();
        }
      } else if (view.spatula && target && defenderAt(sim, target.col, target.lane)) {
        const r = L.cellRect(target.col, target.lane);
        ctx.fillStyle = 'rgba(255,100,100,0.3)'; ctx.strokeStyle = '#ff8a8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.fill(); ctx.stroke();
      }
      const chosen = view.selected === null ? undefined : sim.defenders.find(d => d.id === view.selected);
      if (chosen) {
        const def = sim.content.defenders[chosen.def], r = L.cellRect(chosen.col, chosen.lane);
        if (def) rangeHint(ctx, L, def.tiers[Math.min(chosen.tier, def.tiers.length - 1)].attack, chosen.col, chosen.lane, true, def.light);
        ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.stroke();
      }
      drawLinks(ctx, L, sim, view);
      drawRecipePreview(ctx, L, view);
      drawWarmth(ctx, L, sim, t);
      marks = collectMarks(sim);
      drawWarningFloor(ctx, L, marks, t);
      // spot instant set-backs (cake scare, drip push): remember where each pest was last drawn
      frameNo++;
      for (const e of sim.enemies) {
        const tr = tracks.get(e.id);
        if (!tr) { tracks.set(e.id, { x: e.x, from: e.x, at: -9, seen: frameNo }); continue; }
        if (e.x - tr.x > 0.4 && e.state !== 'flee') {
          tr.from = tr.x; tr.at = t;
          const p = L.feet(tr.x, e.lane);
          effects.burst(p.x, p.y, '#e9d2a6', 6, L.unit * 1.4, 'puff', L.unit * 0.08, 0);
        }
        tr.x = e.x; tr.seen = frameNo;
      }
      if (tracks.size > sim.enemies.length + 40) for (const [id, tr] of tracks) if (tr.seen !== frameNo) tracks.delete(id);
    }

    drawCake(ctx, L, sim ? sim.slices : 3, sim ? sim.maxSlices : 3, t, effects.cakeHit, reduced);

    if (!sim) {
      const cast = [...MENU_CAST.map(([id, col, lane, tier]) => ({ kind: 'defender' as const, id, x: col + 0.5, lane, tier })), ...MENU_PESTS.map(([id, x, lane]) => ({ kind: 'enemy' as const, id, x, lane, tier: 0 }))].sort((a, b) => L.feet(a.x, a.lane).y - L.feet(b.x, b.lane).y);
      const castSize = bodySize(L);
      for (const actor of cast) { const feet = L.feet(actor.x, actor.lane); lighting.drawShadow(ctx, feet.x, feet.y, castSize * 0.34, 0.9); }
      cast.forEach((actor, index) => {
        const feet = L.feet(actor.x, actor.lane), bob = reduced ? 0 : Math.sin(t * 2.2 + index * 1.7) * 0.025;
        sprites.draw(ctx, actor.kind, actor.id, feet.x, feet.y - (actor.id === 'fruitfly' || actor.id === 'moth' ? L.unit * 0.3 : 0), castSize, ratio, { frame: reduced ? 0 : frameOf(t, index * 5), act: 0, tier: actor.tier, state: 'walk', dir: dirOf(L) }, { sx: 1 - bob, sy: 1 + bob });
      });
    }

    if (sim) {
      // soft contact shadows first, so no shadow ever darkens a neighbour's body
      const unitBody = bodySize(L);
      for (const d of sim.defenders) { const f = L.feet(d.col + 0.5, d.lane); lighting.drawShadow(ctx, f.x, f.y, unitBody * 0.36); }
      for (const e of sim.enemies) {
        const def = enemyDef(sim, e);
        if (!def || e.state === 'burrowed' || (e.submerged ?? 0) > 0) continue;
        const f = L.feet(shownX(e, t), enemyLane(sim, e)), s = bodySize(L, def.size ?? 1, !!def.boss);
        lighting.drawShadow(ctx, f.x, f.y, s * (def.flying ? 0.22 : 0.34), def.flying ? 0.55 : 1);
      }
      // bodies, back to front (corpses mixed in)
      type Body = { y: number; kind: 0 | 1 | 2; d?: Defender; e?: Enemy; c?: (typeof effects.corpses)[number] };
      const bodies: Body[] = [];
      for (const d of sim.defenders) bodies.push({ y: L.feet(d.col + 0.5, d.lane).y, kind: 0, d });
      for (const e of sim.enemies) bodies.push({ y: L.feet(shownX(e, t), e.lane).y + (enemyDef(sim, e)?.flying ? L.unit : 0) + 0.5, kind: 1, e });
      for (const c of effects.corpses) bodies.push({ y: c.y - 0.5, kind: 2, c });
      bodies.sort((a, b) => a.y - b.y);
      for (const body of bodies) {
        if (body.kind === 0) drawDefender(ctx, L, sim, body.d!, view);
        else if (body.kind === 1) drawEnemy(ctx, L, sim, body.e!, view);
        else {
          const c = body.c!, k = 1 - c.life / c.max;
          if (c.keep) {
            const age = c.max - c.life, grow = reduced ? 1 : Math.min(1, age / 0.5), pop = reduced ? 1 : 1 + Math.sin(Math.min(1, age / 0.5) * Math.PI) * 0.15;
            lighting.glow(ctx, c.x, c.y - c.size * 0.4, c.size * 0.9, 0.45 * grow, 'gold');
            sprites.draw(ctx, 'enemy', c.def, c.x, c.y, c.size * pop, ratio, { frame: frameOf(t, 7, 6), act: 0, tier: 0, mood: 'happy', dir: dirOf(L) }, { alpha: grow });
          } else if (reduced) sprites.draw(ctx, 'enemy', c.def, c.x, c.y, c.size, ratio, { frame: 0, act: 0, tier: 0, state: 'dead', dir: dirOf(L) }, { alpha: 1 - k });
          else {
            const hopUp = Math.sin(Math.min(1, k * 1.6) * Math.PI) * L.unit * (c.boss ? 0.5 : 0.28);
            sprites.draw(ctx, 'enemy', c.def, c.x, c.y - hopUp, c.size, ratio, { frame: 0, act: 0, tier: 2, state: 'dead', dir: dirOf(L) },
              { alpha: 1 - k * k, sx: c.flip ? 1 + k * 0.2 : 1, sy: 1 - k * 0.45, rotation: (c.flip ? 1 : -1) * k * 0.5 });
          }
        }
      }

      // ghost of the card being placed
      const target = view.hover ?? view.cursor;
      if (view.card && target && cellFree(sim, target.col, target.lane) && sim.content.defenders[view.card]) {
        const ghost = { id: 0, def: view.card, col: target.col, lane: target.lane, tier: 0, hp: 1, maxHp: 1, cd: 0, stun: 0, spent: 0, uses: 0, mods: { damage: 1, rate: 1, range: 0, splash: 1, hp: 1, regen: 1, gen: 1, effects: [] }, recipes: [], bornAt: -9, attackAt: -9, hurtAt: -9 } as Defender;
        drawDefender(ctx, L, sim, ghost, view, true);
      }

      for (const p of sim.projectiles) {
        const color = p.tag === 'ice' ? '#bfeaff' : p.tag === 'salt' ? '#ffffff' : p.tag === 'fire' ? '#ff8a1f' : '#ffd27a';
        if (p.kind === 'straight') {
          const at = L.point(p.x, p.lane), a = ahead(L, L.along * 0.35), y = at.y - L.unit * 0.12;
          if (!reduced) { ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = L.unit * 0.07; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(at.x - a.x, y - a.y); ctx.lineTo(at.x, y); ctx.stroke(); ctx.globalAlpha = 1; }
          drawProjectile(ctx, p.sprite, at.x, y, L.unit, t * 9, color);
        } else {
          const k = Math.min(1, p.t / p.flight), ground = L.point(p.x, p.lane), height = Math.sin(k * Math.PI) * L.unit * 1.15;
          lighting.drawShadow(ctx, ground.x, ground.y + L.unit * 0.2, L.unit * (0.14 - Math.sin(k * Math.PI) * 0.05), 0.8);
          drawProjectile(ctx, p.sprite, ground.x, ground.y - L.unit * 0.3 - height, L.unit * (1.05 + Math.sin(k * Math.PI) * 0.3), k * 9, color);
        }
      }
      // lane fire
      for (const zone of sim.zones) {
        const count = L.cols * 2, a = Math.min(1, zone.t / 0.5);
        ctx.globalAlpha = a;
        for (let i = 0; i < count; i++) {
          const p = L.feet((i + 0.5) * L.cols / count, zone.lane), size = 24 + ((i * 7) % 5) * 4;
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(L.unit / 100, L.unit / 100); flame(ctx, 0, 0, size, (Math.floor(t * 12) + i * 3) & 7); ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }

    const flicker = reduced ? 1 : 1 + Math.sin(t * 7) * 0.02;
    const { lights, dark } = collectLights(L, view, flicker);
    const dawn = sim ? (sim.status === 'won' ? 1 : waveProgress(sim)) : 0.12;
    lighting.draw(ctx, lights, mood.night, dawn, effects.sunrise, effects.gloom, dark);
    // the cake candle and burners get a soft bloom on top of the night
    if (sim ? sim.slices > 0 : true) lighting.glow(ctx, L.cake.x, L.cake.y - L.cake.r * 0.4, L.cake.r * 0.9 * flicker, 0.55, 'gold');
    if (mood.ambient !== ambientKind) { ambientKind = mood.ambient; ambient.clear(); }
    ambient.draw(ctx, L, mood.ambient);
    if (glints.length) {
      ctx.fillStyle = '#ffe27a';
      for (const g of glints) {
        if (g.blink && !reduced) continue;
        lighting.glow(ctx, g.x, g.y, g.gap * 2.4, 0.35, 'gold');
        ctx.beginPath(); ctx.arc(g.x - g.gap, g.y, g.r, 0, Math.PI * 2); ctx.arc(g.x + g.gap, g.y, g.r, 0, Math.PI * 2); ctx.fill();
      }
      glints.length = 0;
    }
    if (sim) {
      drawWarningGlyphs(ctx, L, marks);
      drawRally(ctx, L, sim, t);
      for (const fn of overlays) fn();
    }
    overlays.length = 0; marks = [];
    if (sim) drawAlarm(ctx, L, t);
    effects.draw(ctx);
    if (sim) drawMarkers(ctx, L, view);
    ctx.restore();
  }

  let ambientKind = moodFor(undefined).ambient;
  return {
    get layout() { return layout; },
    effects,
    resize(width, height, pixelRatio, insets, level) {
      const next = computeLayout(width, height, level?.cols ?? 9, level?.lanes ?? 5, insets);
      if (pixelRatio !== ratio) sprites.clear();
      layout = next; ratio = pixelRatio; warmedFor = '';
      ambientKind = moodFor(level?.backdrop).ambient;
      ambient.clear();
      ensureBackdrop(level);
      return next;
    },
    draw,
    onEvent(event, sim) { if (layout) effects.onEvent(event, sim, layout); },
    update(dt) { effects.update(dt); ambient.update(dt, layout, ambientKind); },
    reset() { effects.clear(); ambient.clear(); backdropKey = ''; warmedFor = ''; },
    stats() { return { misses: sprites.takeMisses(), cached: sprites.size }; }
  };
}
