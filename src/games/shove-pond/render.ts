import { grudges } from './banter';
import { PALETTE, drawFrog, drawGrudge, type Face } from './frog-art';
import { BRACE, DX, DY, SIT, isPad, type Plan, type RoundResult, type SimEvent, type State } from './sim';

/**
 * Canvas 2D pond: top-down with a slight tilt (rows are squashed and pads have a dark underside). Frogs are
 * procedural (`frog-art.ts`: body, legs, a face that reacts to being shoved, shoving, bracing and falling in). A round is
 * played back from the sim's event list: step 1 for all frogs, then 2, then 3; within a step frogs act in their
 * printed order, staggered so the order is visible. Squash and stretch, splashes and ripples are skipped or
 * reduced with reduced motion.
 */
export { PALETTE };
export type Look = { name: string; pattern: number; tag: boolean };
/** An emoji bubble, or a short line of text (`bark`) from a bot. */
export type Emote = { seat: number; text: string; t0: number; bark?: boolean };
export type View = {
  state: State;
  looks: Look[];
  /** Seat whose draft is drawn as a numbered path (-1: none). */
  me: number;
  draft: number[];
  /** Other frogs' plans drawn as ghost arrows (lessons and puzzles). */
  ghosts: (Plan | null)[] | null;
  order: number[];
  crown: number;
  away: boolean[];
  emotes: Emote[];
  /** Ghost hand: swipe from my frog's planned spot in this direction (0-3), or -1. */
  hand: number;
  dim?: boolean;
  /** Seats drawn with the winner's face (end of a match). */
  winners?: readonly number[];
};

type Seg = { t0: number; t1: number; kind: 'hop' | 'push' | 'bounce' | 'fall' | 'drop'; fx: number; fy: number; tx: number; ty: number };
type Cue = { t: number; fn: () => void; done?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string };
type Ring = { x: number; y: number; t0: number; max: number };
type Popup = { x: number; y: number; text: string; t0: number; color: string };
type Shock = { seat: number; t0: number; t1: number };
type Anim = {
  t0: number; duration: number; before: State; result: RoundResult;
  segs: Seg[][]; wetAt: number[]; respawnAt: number[]; sinkAt: number; sinkCells: Set<number>;
  braceSteps: { seat: number; t0: number; t1: number }[]; bounceWalls: { seat: number; t: number }[];
  cues: Cue[]; done: () => void; eatAt: number;
  /** Face windows (reveal time) and the hit-stop: playback runs at a quarter speed until `slowUntil` (clock). */
  shocks: Shock[]; slowUntil: number; stops: number;
};
export type Sounds = {
  hop(seat: number): void; shove(): void; bounce(): void; splash(): void; brace(): void; sink(): void; croak(seat: number): void; eat(): void;
};
const SMUG_S = 1.1, SULK_S = 1.8, STOP_S = 0.12, STOP_RATE = 0.25;

const HOP = 0.3, STAG = 0.13, PUSH = 0.2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => t * t * (3 - 2 * t);

export function stepLength(n: number) { return STAG * Math.max(0, n - 1) + HOP + 0.22; }
/** Total playback length of a round, in seconds (the spec caps a reveal at 6 s). */
export function revealLength(before: State, result: RoundResult, reduced = false): number {
  const step = stepLength(before.n) * (reduced ? 0.8 : 1);
  const sink = result.events.some(e => e.k === 'sink') ? 0.7 : 0;
  const respawn = result.events.some(e => e.k === 'respawn') ? 0.55 : 0;
  return 3 * step + sink + respawn + 0.35;
}

export function createRenderer(canvas: HTMLCanvasElement, sounds: Sounds, reducedMotion: () => boolean) {
  const ctx = canvas.getContext('2d');
  let W = 360, H = 560, ratio = 1;
  let cell = 40, ox = 0, oy = 0, tilt = 0.86, size = 7;
  let anim: Anim | null = null;
  const particles: Particle[] = [];
  const rings: Ring[] = [];
  const popups: Popup[] = [];
  const facing: number[] = [2, 2, 2, 2, 2, 2];
  /** Faces that outlive a reveal, on the renderer clock: smug after a splash dealt, sulk after climbing back. */
  const smugUntil: number[] = [0, 0, 0, 0, 0, 0];
  const sulk: { until: number; at: number }[] = Array.from({ length: 6 }, () => ({ until: 0, at: -1 }));
  /** Frogs shoved in last round carry a grudge mark through the next one (keyed by match seed and round). */
  let grudge: { seed: number; round: number; seats: number[] } | null = null;
  let clock = 0;
  let top = 60, bottom = 160;

  /** Camera: the board is fitted to the live pads plus enough water for a splash beside them, using the stage
   *  width (12 px margins) and the height between the HUD rows. When the pond shrinks between rounds it zooms in
   *  over 400 ms (ease-out); a new scene, a resize or reduced motion snaps. */
  type Cam = { cell: number; ox: number; oy: number };
  let cam: Cam | null = null, camFrom: Cam | null = null, camTo: Cam | null = null, camT0 = 0, camKey = '', camSeed = -1;
  const ZOOM_S = 0.4;
  function fit(state: State): { cam: Cam; box: string } {
    const availW = W - 24, availH = Math.max(80, H - top - bottom);
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    state.pads.forEach((k, i) => { if (!k) return; const x = i % size, y = Math.floor(i / size); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = size - 1; y1 = size - 1; }
    const w = x1 - x0 + 1, hgt = y1 - y0 + 1;
    // Water margin: a splash lands half a cell past the edge pads, so keep its centre a few px inside the stage.
    let c = availW / (w + 0.5), m = 0.25;
    for (let k = 0; k < 3; k++) {
      // Small boards keep the splash centre well inside; the full 7x7 trades a little margin for frog size.
      m = clamp((w >= 7 ? 0.55 : 0.7) - 12 / c, 0.25, 0.65);
      c = Math.min(availW / (w + 2 * m), availH / ((hgt + 2 * m) * tilt + 0.5));
    }
    const cl = clamp(Math.floor(c), 24, 120);
    return {
      cam: { cell: cl, ox: Math.round(W / 2 - (x0 + w / 2) * cl), oy: Math.round(top + (availH - cl * hgt * tilt) / 2 + cl * 0.25 - y0 * cl * tilt) },
      box: `${x0},${y0},${w},${hgt}`
    };
  }
  function layout(state: State) {
    size = state.size;
    const { cam: target, box } = fit(state);
    const frame = `${W}x${H}:${top}:${bottom}:${size}`;
    const key = `${frame}|${box}`;
    if (key !== camKey) {
      const sameScene = cam && camKey.startsWith(`${frame}|`) && !state.scenario && state.seed === camSeed;
      if (sameScene && !reducedMotion()) { camFrom = { ...cam! }; camTo = target; camT0 = clock; }
      else { cam = target; camFrom = null; camTo = null; }
      camKey = key; camSeed = state.seed;
    }
    if (camFrom && camTo) {
      const p = clamp((clock - camT0) / ZOOM_S, 0, 1), e = 1 - (1 - p) ** 3;
      cam = { cell: camFrom.cell + (camTo.cell - camFrom.cell) * e, ox: camFrom.ox + (camTo.ox - camFrom.ox) * e, oy: camFrom.oy + (camTo.oy - camFrom.oy) * e };
      if (p >= 1) { cam = camTo; camFrom = null; camTo = null; }
    }
    cell = cam!.cell; ox = cam!.ox; oy = cam!.oy;
  }
  const sx = (x: number) => ox + (x + 0.5) * cell;
  const sy = (y: number) => oy + (y + 0.5) * cell * tilt;

  function resize(width: number, height: number, dpr: number, hudTop: number, hudBottom: number) {
    W = width; H = height; ratio = dpr; top = hudTop; bottom = hudBottom;
    const pw = Math.round(W * ratio), ph = Math.round(H * ratio);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }

  /** Grid cell under a canvas point (CSS pixels), or null. */
  function cellAt(px: number, py: number): [number, number] | null {
    const x = Math.floor((px - ox) / cell), y = Math.floor((py - oy) / (cell * tilt));
    return x >= -1 && y >= -1 && x <= size && y <= size ? [x, y] : null;
  }
  function frogScreen(state: State, seat: number): [number, number] {
    const f = state.frogs[seat];
    return [sx(f.x), sy(f.y)];
  }

  // ------------------------------------------------------------------ playback
  function play(before: State, result: RoundResult, done: () => void) {
    const n = before.n, reduced = reducedMotion();
    const step = stepLength(n) * (reduced ? 0.8 : 1);
    const segs: Seg[][] = before.frogs.map(() => []);
    const wetAt = before.frogs.map(() => Infinity);
    const respawnAt = before.frogs.map(() => Infinity);
    const cues: Cue[] = [];
    const braceSteps: Anim['braceSteps'] = [];
    const bounceWalls: Anim['bounceWalls'] = [];
    const shocks: Shock[] = [];
    const slotOf = (seat: number) => Math.max(0, result.order.indexOf(seat));
    let slotT = 0, lastHop = 0, eatAt = Infinity;
    const sinkAt = 3 * step + 0.1;
    let sinkCells = new Set<number>();
    for (const e of result.events) {
      const base = ('step' in e ? e.step : 0) * step;
      switch (e.k) {
        case 'brace':
          braceSteps.push({ seat: e.s, t0: base, t1: base + step });
          cues.push({ t: base, fn: () => sounds.brace() });
          break;
        case 'shove':
          slotT = base + slotOf(e.s) * STAG;
          cues.push({ t: slotT + HOP * 0.45, fn: () => sounds.shove() });
          break;
        case 'pushed': {
          const t0 = slotT + HOP * 0.4;
          segs[e.s].push({ t0, t1: t0 + PUSH, kind: 'push', fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty });
          shocks.push({ seat: e.s, t0, t1: t0 + PUSH + 0.3 });
          break;
        }
        case 'hop': {
          const t0 = base + slotOf(e.s) * STAG;
          lastHop = t0;
          segs[e.s].push({ t0, t1: t0 + HOP, kind: 'hop', fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty });
          const seat = e.s;
          cues.push({ t: t0, fn: () => sounds.hop(seat) });
          break;
        }
        case 'bounce': {
          const t0 = base + slotOf(e.s) * STAG;
          segs[e.s].push({ t0, t1: t0 + HOP + 0.05, kind: 'bounce', fx: e.x, fy: e.y, tx: e.x + DX[e.dir] * 0.42, ty: e.y + DY[e.dir] * 0.42 });
          bounceWalls.push({ seat: e.wall, t: t0 + HOP * 0.5 });
          cues.push({ t: t0 + HOP * 0.5, fn: () => sounds.bounce() });
          break;
        }
        case 'splash': {
          const t = e.why === 'sink' ? sinkAt + 0.3 : e.why === 'hop' ? lastHop + HOP : slotT + HOP * 0.4 + PUSH;
          wetAt[e.s] = t;
          const x = e.x, y = e.y, pts = e.pts, by = e.by;
          if (e.why === 'sink') segs[e.s].push({ t0: sinkAt, t1: t, kind: 'fall', fx: x, fy: y, tx: x, ty: y });
          const victim = e.s, shoved = by >= 0 && by !== victim;
          shocks.push({ seat: victim, t0: e.why === 'sink' ? sinkAt : t - (shoved ? PUSH + 0.1 : 0.2), t1: t });
          // Hit-stop: the shove that sends a frog off the pads plays at a quarter speed for a beat (twice a round at most).
          if (e.why === 'shove' && shoved && !reduced) cues.push({ t: t - PUSH, fn: () => {
            if (anim && anim.stops < 2) { anim.stops += 1; anim.slowUntil = clock + STOP_S; }
          } });
          cues.push({ t, fn: () => {
            sounds.splash();
            splashAt(sx(x), sy(y));
            haptic();
            if (shoved) { smugUntil[by] = clock + SMUG_S; sulk[victim] = { until: 0, at: by }; }
            else sulk[victim] = { until: 0, at: -1 };
            if (pts > 0 && by >= 0) popups.push({ x: sx(x), y: sy(y) - cell * 0.4, text: `+${pts}`, t0: clock, color: PALETTE[by % 6].body });
          } });
          break;
        }
        case 'eat': eatAt = e.step * step + step * 0.8; cues.push({ t: eatAt, fn: () => sounds.eat() }); break;
        case 'sink': sinkCells = new Set(e.cells); cues.push({ t: sinkAt, fn: () => sounds.sink() }); break;
        case 'respawn': {
          const t0 = (sinkCells.size ? sinkAt + 0.7 : 3 * step + 0.1);
          respawnAt[e.s] = t0;
          segs[e.s].push({ t0, t1: t0 + 0.45, kind: 'drop', fx: e.x, fy: e.y, tx: e.x, ty: e.y });
          const seat = e.s;
          cues.push({ t: t0 + 0.4, fn: () => { sounds.croak(seat); sulk[seat].until = clock + SULK_S; } });
          break;
        }
        case 'end': break;
      }
    }
    for (const list of segs) list.sort((p, q) => p.t0 - q.t0);
    const finish = () => {
      if (!before.scenario) grudge = { seed: result.state.seed, round: result.state.round, seats: grudges(result) };
      done();
    };
    anim = { t0: clock, duration: revealLength(before, result, reduced), before, result, segs, wetAt, respawnAt, sinkAt, sinkCells, braceSteps, bounceWalls, cues, done: finish, eatAt, shocks, slowUntil: 0, stops: 0 };
  }
  const busy = () => anim !== null;
  function skip() { if (anim) anim.t0 = clock - anim.duration; }

  function haptic() {
    try { if (!reducedMotion()) navigator.vibrate?.(25); } catch { /* not supported */ }
  }
  function splashAt(x: number, y: number) {
    rings.push({ x, y, t0: clock, max: cell * 1.17 });
    rings.push({ x, y, t0: clock + 0.07, max: cell * 0.8 });
    if (reducedMotion()) return;
    rings.push({ x, y, t0: clock + 0.14, max: cell * 1.5 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, v = cell * (1.2 + (i % 3) * 0.5);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - cell * 2.2, life: 0, max: 0.55 + (i % 4) * 0.08, r: cell * 0.05 + (i % 3), color: i % 2 ? '#d7f6ff' : '#8fd8f0' });
    }
  }

  // ------------------------------------------------------------------ drawing
  function water() {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d3b4c'); g.addColorStop(1, '#0a2733');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (reducedMotion()) return;
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.07)'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = ((i * 97 + clock * 9) % (H + 40)) - 20;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + clock + i) * 3);
      ctx.stroke();
    }
  }

  function pad(x: number, y: number, kind: number, t: number, sinkP: number) {
    if (!ctx) return;
    const cx = sx(x), cy = sy(y);
    let rx = cell * 0.46, ry = cell * 0.46 * tilt;
    let rot = ((x * 7 + y * 13) % 8) * 0.7;
    if (kind === 2 && !reducedMotion()) rot += Math.sin(t * 9 + x + y) * 0.12;
    const wob = kind === 2 ? Math.sin(t * 7 + x * 2 + y) * cell * 0.025 : 0;
    if (sinkP > 0) { rx *= 1 - sinkP * 0.85; ry *= 1 - sinkP * 0.85; }
    ctx.save();
    ctx.globalAlpha = 1 - sinkP * 0.8;
    ctx.translate(cx + wob, cy);
    ctx.fillStyle = 'rgba(0, 20, 26, 0.45)';
    ctx.beginPath(); ctx.ellipse(0, cell * 0.07, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = kind === 2 ? '#8ea84a' : '#3fae5a';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = kind === 2 ? '#a9c45c' : '#5ccc72';
    ctx.beginPath(); ctx.ellipse(-rx * 0.08, -ry * 0.1, rx * 0.78, ry * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    // Notch.
    ctx.fillStyle = '#0c3442';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.ellipse(0, 0, rx + 1, ry + 1, 0, rot, rot + 0.42); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = kind === 2 ? 'rgba(80, 60, 20, 0.5)' : 'rgba(30, 110, 50, 0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const a = rot + 0.9 + i * 1.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rx * 0.8, Math.sin(a) * ry * 0.8); ctx.stroke(); }
    ctx.restore();
  }

  function frog(seat: number, x: number, y: number, z: number, squash: number, look: Look, opts: { braced: boolean; crown: boolean; order: number; alpha: number; away: boolean; showOrder: boolean; dir: number; face: Face; lookX: number; lookY: number; grudge: boolean }) {
    if (!ctx) return;
    const pal = PALETTE[seat % PALETTE.length];
    const s = cell * 0.5;
    const reduced = reducedMotion();
    ctx.save();
    ctx.globalAlpha = opts.alpha;
    // Shadow on the pad.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    const shrink = clamp(1 - z / (cell * 3), 0.25, 1);
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.18, s * 0.5 * shrink, s * 0.24 * shrink, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y - z);
    const sxk = 1 + squash * 0.22, syk = 1 - squash * 0.22;
    ctx.scale(sxk, syk);
    // Blinks: every 3 to 6 s per frog, 90 ms, idle only.
    const period = 3 + ((seat * 7) % 4) * 0.9;
    const blink = !reduced && opts.face === 'idle' && ((clock + seat * 1.3) % period) < 0.09;
    drawFrog(ctx, s, pal, {
      face: opts.face, braced: opts.braced, pattern: look.pattern, blink,
      lookX: opts.lookX, lookY: opts.lookY, drip: reduced ? -1 : (clock * 2) % 1
    });
    if (opts.grudge) drawGrudge(ctx, s * 0.42, -s * 0.58, s);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = opts.alpha;
    if (opts.crown) {
      const cx = x, cy = y - z - s * 0.62;
      ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.24, cy + s * 0.12); ctx.lineTo(cx - s * 0.26, cy - s * 0.1); ctx.lineTo(cx - s * 0.12, cy); ctx.lineTo(cx, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.12, cy); ctx.lineTo(cx + s * 0.26, cy - s * 0.1); ctx.lineTo(cx + s * 0.24, cy + s * 0.12); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (opts.showOrder) {
      const bx = x + s * 0.42, by = y - z + s * 0.22, r = Math.max(7, s * 0.2);
      ctx.fillStyle = '#10202a'; ctx.strokeStyle = pal.body; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(r * 1.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(opts.order), bx, by + 0.5);
    }
    if (look.tag) {
      const label = opts.away ? `${look.name} 🤖` : look.name;
      ctx.font = `600 ${Math.max(10, Math.round(cell * 0.22))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 10, ty = y + s * 0.62;
      ctx.fillStyle = 'rgba(6, 20, 26, 0.72)';
      roundRect(x - w / 2, ty - 8, w, 16, 8); ctx.fill();
      ctx.fillStyle = pal.belly; ctx.fillText(label, x, ty + 0.5);
    }
    ctx.restore();
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** Numbered plan path from a frog: solid for my draft, dashed ghost arrows for others' known plans. */
  function planPath(state: State, seat: number, plan: readonly number[], solid: boolean) {
    if (!ctx) return;
    const f = state.frogs[seat];
    if (!f || f.wet) return;
    const pal = PALETTE[seat % PALETTE.length];
    let x = f.x, y = f.y;
    ctx.save();
    ctx.lineWidth = solid ? 4 : 3; ctx.lineCap = 'round';
    ctx.setLineDash(solid ? [] : [6, 6]);
    ctx.strokeStyle = solid ? 'rgba(255,255,255,0.9)' : pal.body;
    ctx.globalAlpha = solid ? 1 : 0.85;
    plan.forEach((a, i) => {
      if (a === SIT) return;
      if (a === BRACE) {
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(sx(x), sy(y), cell * (0.36 + i * 0.05), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash(solid ? [] : [6, 6]);
        label(sx(x) + cell * 0.32, sy(y) - cell * 0.3 - i * 6, i + 1, solid, pal.body);
        return;
      }
      const nx = x + DX[a], ny = y + DY[a];
      const ax = sx(x), ay = sy(y), bx = sx(nx), by = sy(ny);
      ctx.beginPath(); ctx.moveTo(ax + (bx - ax) * 0.25, ay + (by - ay) * 0.25); ctx.lineTo(ax + (bx - ax) * 0.8, ay + (by - ay) * 0.8); ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax), hx = ax + (bx - ax) * 0.84, hy = ay + (by - ay) * 0.84;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(ang - 0.5) * 10, hy - Math.sin(ang - 0.5) * 10); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(ang + 0.5) * 10, hy - Math.sin(ang + 0.5) * 10); ctx.stroke();
      x = nx; y = ny;
      if (!isPad(state, x, y)) {
        ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 3;
        const cx = sx(x), cy = sy(y), r = cell * 0.16;
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); ctx.restore();
      }
      label(sx(x), sy(y), i + 1, solid, pal.body);
    });
    ctx.restore();
  }
  /** Step badges are queued while paths are drawn (under the frogs) and painted after the frogs, so a step that
   *  lands on a frog's pad stays readable. */
  const badges: [number, number, number, boolean, string][] = [];
  let badgeState: State | null = null;
  function label(x: number, y: number, n: number, solid: boolean, color: string) {
    // A badge on a frog's pad moves to the pad's upper left so the frog (and its crown) stay visible.
    const gx = Math.floor((x - ox) / cell), gy = Math.floor((y - oy) / (cell * tilt));
    const busy = badgeState?.frogs.some(f => !f.wet && f.x === gx && f.y === gy);
    badges.push(busy ? [x - cell * 0.34, y - cell * 0.26, n, solid, color] : [x, y, n, solid, color]);
  }
  function paintBadge(x: number, y: number, n: number, solid: boolean, color: string) {
    if (!ctx) return;
    ctx.save(); ctx.setLineDash([]);
    const r = Math.max(8, cell * 0.17);
    ctx.fillStyle = solid ? '#fff' : color; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10202a'; ctx.font = `800 ${Math.round(r * 1.25)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
    ctx.restore();
  }

  function flyAt(x: number, y: number, t: number) {
    if (!ctx) return;
    const cx = sx(x) + Math.sin(t * 3) * cell * 0.08, cy = sy(y) - cell * 0.18 + Math.cos(t * 4) * cell * 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const flap = Math.abs(Math.sin(t * 30)) * cell * 0.1 + cell * 0.04;
    ctx.beginPath(); ctx.ellipse(cx - cell * 0.08, cy - cell * 0.04, cell * 0.09, flap, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + cell * 0.08, cy - cell * 0.04, cell * 0.09, flap, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(cx, cy, cell * 0.07, cell * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  }

  function hand(x: number, y: number, dir: number, t: number) {
    if (!ctx || dir < 0) return;
    const p = (t % 1.4) / 1.4;
    const k = ease(clamp(p * 1.6, 0, 1));
    const hx = sx(x) + DX[dir] * cell * 0.9 * k + cell * 0.1, hy = sy(y) + DY[dir] * cell * 0.9 * k * tilt + cell * 0.2;
    ctx.save(); ctx.globalAlpha = p < 0.8 ? 0.9 : (1 - p) * 4.5;
    ctx.font = `${Math.round(cell * 0.6)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('👆', hx, hy);
    ctx.restore();
  }

  function draw(view: View, dt: number) {
    if (!ctx) return;
    clock += dt;
    const reduced = reducedMotion();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (anim && clock < anim.slowUntil) anim.t0 += dt * (1 - STOP_RATE);
    const a = anim;
    const t = a ? clock - a.t0 : 0;
    const state = a ? a.before : view.state;
    layout(state);
    water();
    const sinkP = a && t > a.sinkAt ? clamp((t - a.sinkAt) / 0.6, 0, 1) : 0;
    for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
      const i = y * state.size + x;
      const kind = state.pads[i];
      if (!kind) continue;
      pad(x, y, kind, clock, a && a.sinkCells.has(i) ? sinkP : 0);
    }
    const fly = state.scenario?.fly;
    if (fly && !(a && t > a.eatAt) && !(a && a.result.ate >= 0 && t > a.eatAt)) flyAt(fly[0], fly[1], clock);
    badgeState = state;
    if (!a) {
      if (view.ghosts) view.ghosts.forEach((p, seat) => { if (p && seat !== view.me) planPath(state, seat, p, false); });
      if (view.me >= 0 && view.draft.length) planPath(state, view.me, view.draft, true);
    }
    // Frogs, back to front.
    const drawn = state.frogs.map((f, seat) => {
      let x = f.x, y = f.y, z = 0, squash = 0, alpha = f.wet ? 0 : 1;
      if (a) {
        alpha = 1;
        if (t >= a.wetAt[seat]) alpha = 0;
        for (const sg of a.segs[seat]) {
          if (t < sg.t0) break;
          const p = clamp((t - sg.t0) / (sg.t1 - sg.t0), 0, 1);
          if (sg.kind === 'hop') {
            const e = ease(p);
            x = sg.fx + (sg.tx - sg.fx) * e; y = sg.fy + (sg.ty - sg.fy) * e;
            z = Math.sin(Math.PI * p) * cell * (reduced ? 0.15 : 0.42);
            squash = reduced ? 0 : (p < 0.15 ? p / 0.15 * 0.6 : p > 0.85 ? (1 - p) / 0.15 * 0.8 : -0.35 * Math.sin(Math.PI * p));
            if (p < 1) facing[seat] = sg.tx > sg.fx ? 1 : sg.tx < sg.fx ? 3 : sg.ty > sg.fy ? 2 : 0;
          } else if (sg.kind === 'push') {
            const e = 1 - (1 - p) * (1 - p);
            x = sg.fx + (sg.tx - sg.fx) * e; y = sg.fy + (sg.ty - sg.fy) * e;
            squash = reduced ? 0 : Math.sin(Math.PI * p) * -0.4;
          } else if (sg.kind === 'bounce') {
            const k = p < 0.5 ? ease(p * 2) : ease((1 - p) * 2);
            x = sg.fx + (sg.tx - sg.fx) * k; y = sg.fy + (sg.ty - sg.fy) * k;
            z = Math.sin(Math.PI * p) * cell * (reduced ? 0.1 : 0.3);
            squash = reduced ? 0 : (p > 0.45 && p < 0.6 ? 0.9 : 0);
          } else if (sg.kind === 'fall') {
            alpha = 1 - p; z = -p * cell * 0.2;
          } else if (sg.kind === 'drop') {
            x = sg.tx; y = sg.ty; z = (1 - ease(p)) * cell * 2.4; alpha = 1;
            squash = p > 0.9 ? 0.6 : 0;
          }
        }
        if (t < a.respawnAt[seat] && t >= a.wetAt[seat]) alpha = 0;
        if (a.before.frogs[seat].wet && t < a.respawnAt[seat]) alpha = 0;
      }
      return { seat, x, y, z, squash, alpha };
    }).sort((p, q) => p.y - q.y);
    const grudged = grudge && grudge.seed === state.seed && grudge.round === state.round && !state.scenario ? grudge.seats : [];
    for (const d of drawn) {
      if (d.alpha <= 0) continue;
      const braced = a ? a.braceSteps.some(b => b.seat === d.seat && t >= b.t0 && t < b.t1) : false;
      const order = (a ? a.result.order : view.order).indexOf(d.seat) + 1;
      const crown = (a ? a.result.crown : view.crown) === d.seat;
      const dir = facing[d.seat] ?? 2;
      let face: Face = 'idle', lookX = DX[dir] * 0.05, lookY = DY[dir] * 0.05;
      if (view.winners?.includes(d.seat) && !a) face = 'win';
      else if (a && a.shocks.some(q => q.seat === d.seat && t >= q.t0 && t < q.t1)) face = 'shock';
      else if (braced) face = 'brace';
      else if (clock < smugUntil[d.seat]) face = 'smug';
      else if (clock < sulk[d.seat].until) {
        face = 'sulk';
        const at = drawn.find(q => q.seat === sulk[d.seat].at && q.alpha > 0);
        if (at) { const vx = at.x - d.x, vy = at.y - d.y, n = Math.hypot(vx, vy) || 1; lookX = vx / n * 0.06; lookY = vy / n * 0.05; }
      }
      frog(d.seat, sx(d.x), sy(d.y), d.z, d.squash, view.looks[d.seat] ?? { name: '', pattern: 0, tag: false }, {
        braced, crown, order, alpha: d.alpha * (view.dim ? 0.55 : 1), away: !!view.away[d.seat], showOrder: state.n > 1, dir,
        face, lookX, lookY, grudge: grudged.includes(d.seat) && face !== 'win'
      });
      if (a) for (const w of a.bounceWalls) if (w.seat === d.seat && Math.abs(t - w.t) < 0.25) {
        ctx.save(); ctx.globalAlpha = 1 - Math.abs(t - w.t) * 4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx(d.x), sy(d.y) - d.z, cell * 0.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    for (const b of badges.splice(0)) paintBadge(...b);
    if (!a && view.me >= 0 && view.hand >= 0) {
      const f = state.frogs[view.me];
      let x = f.x, y = f.y;
      for (const s of view.draft) if (s < 4) { x += DX[s]; y += DY[s]; }
      hand(x, y, view.hand, clock);
    }
    // Rings, particles, popups.
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], p = (clock - r.t0) / 0.8;
      if (p >= 1) { rings.splice(i, 1); continue; }
      if (p <= 0) continue;
      ctx.strokeStyle = `rgba(215, 246, 255, ${0.8 * (1 - p)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.max * p, r.max * p * tilt * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life += dt; if (q.life >= q.max) { particles.splice(i, 1); continue; }
      q.vy += cell * 9 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      ctx.fillStyle = q.color; ctx.globalAlpha = 1 - q.life / q.max;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i], k = (clock - p.t0) / 1.1;
      if (k >= 1) { popups.splice(i, 1); continue; }
      // The score pops: 1 -> 1.4 -> 1 over the first 260 ms.
      const age = clock - p.t0, q = clamp(age / 0.26, 0, 1);
      const pop = reduced ? 1 : 1 + 0.4 * Math.sin(Math.PI * q);
      ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = p.color; ctx.strokeStyle = '#06141a'; ctx.lineWidth = 4;
      ctx.font = `900 ${Math.round(cell * 0.5 * pop)}px system-ui, sans-serif`; ctx.textAlign = 'center';
      const px = clamp(p.x, cell * 0.45, W - cell * 0.45);
      ctx.strokeText(p.text, px, p.y - k * cell * 0.8); ctx.fillText(p.text, px, p.y - k * cell * 0.8); ctx.restore();
    }
    // Emotes.
    const placed: [number, number, number, number][] = [];
    for (const e of view.emotes) {
      const age = clock - e.t0;
      if (age > 1.8 || age < 0) continue;
      const d = drawn.find(q => q.seat === e.seat);
      if (!d || d.alpha <= 0) continue;
      const by = sy(d.y) - d.z - cell * 0.9 - Math.min(age, 0.2) * 20;
      let bx = sx(d.x);
      ctx.save(); ctx.globalAlpha = age > 1.4 ? (1.8 - age) / 0.4 : 1;
      if (e.bark) {
        // A speech bubble kept inside the stage, with a tail toward the frog.
        const fs = Math.max(12, Math.min(17, Math.round(cell * 0.26)));
        ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(e.text).width + fs * 1.1, hh = fs * 1.75;
        const fx = bx;
        bx = clamp(bx, w / 2 + 6, W - w / 2 - 6);
        let top = by - hh / 2 - cell * 0.05;
        // Two bubbles side by side would collide: stack the later one above.
        for (let k = 0; k < 3 && placed.some(([x, y, pw, ph]) => Math.abs(x - bx) < (pw + w) / 2 + 4 && Math.abs(y - top) < (ph + hh) / 2 + 2); k++) top -= hh + 6;
        placed.push([bx, top, w, hh]);
        ctx.fillStyle = '#fff';
        roundRect(bx - w / 2, top, w, hh, hh / 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(clamp(fx, bx - w / 2 + 12, bx + w / 2 - 12) - 6, top + hh - 1); ctx.lineTo(fx, top + hh + 8); ctx.lineTo(clamp(fx, bx - w / 2 + 12, bx + w / 2 - 12) + 6, top + hh - 1); ctx.fill();
        ctx.fillStyle = '#10303a'; ctx.fillText(e.text, bx, top + hh / 2 + 1);
        ctx.restore();
        continue;
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, cell * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(cell * 0.36)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.text, bx, by + 1); ctx.restore();
    }
    // Fire due cues; finish.
    if (a) {
      for (const c of a.cues) if (!c.done && t >= c.t) { c.done = true; try { c.fn(); } catch { /* sound is optional */ } }
      if (t >= a.duration) {
        for (const [seat, f] of a.result.state.frogs.entries()) if (!f.wet) facing[seat] = facing[seat] ?? 2;
        anim = null;
        a.done();
      }
    }
  }
  /** Page-space rectangle around grid cells (for art capture). */
  function cellRect(x0: number, y0: number, w: number, hgt: number) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ox + x0 * cell, y: r.top + oy + y0 * cell * tilt - cell * 0.35, width: w * cell, height: hgt * cell * tilt + cell * 0.35 };
  }
  return { resize, draw, play, busy, skip, cellAt, frogScreen, cellRect, get clock() { return clock; }, cellPx: () => cell };
}
export type Renderer = ReturnType<typeof createRenderer>;
export type { SimEvent };
