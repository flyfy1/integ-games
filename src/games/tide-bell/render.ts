import { DIRS, DXY, K, castleStanding, type Board, type Dir, type MoveEvent, type State } from './rules';

/**
 * Tide Bell renderer: a calm, top-down cove drawn procedurally on one canvas. The sim state changes instantly;
 * the renderer eases towards it (a step is 110 ms, the tide swells for 300 ms, drifting wood glides), and a new
 * move first snaps every running animation to its end, so input never waits on the picture.
 */
type Key = { t: number; x: number; y: number };
type Track = Key[];
export type Insets = { top: number; bottom: number; left: number; right: number };

export const WALK_MS = 110;
export const TIDE_MS = 300;
const DRIFT_MS = 55, FLOW_MS = 70;

const ease = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p);
const smooth = (p: number) => p * p * (3 - 2 * p);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function at(track: Track, now: number): { x: number; y: number; moving: boolean; p: number } {
  if (now <= track[0].t) return { x: track[0].x, y: track[0].y, moving: false, p: 0 };
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (now < b.t) { const p = (now - a.t) / Math.max(1, b.t - a.t); const e = i === track.length - 1 ? ease(p) : p; return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, moving: true, p }; }
  }
  const last = track[track.length - 1]; return { x: last.x, y: last.y, moving: false, p: 1 };
}
const endOf = (track: Track) => track[track.length - 1];
const still = (x: number, y: number): Track => [{ t: 0, x, y }];

/** Small deterministic noise per tile, so speckles and tufts do not shimmer between frames. */
function hash(i: number, k: number) { let h = (i * 374761393 + k * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export function createRenderer(canvas: HTMLCanvasElement, reducedMotion: () => boolean) {
  const ctx = canvas.getContext('2d');
  let W = 360, H = 560, ratio = 1, insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };
  let b: Board | null = null, st: State | null = null;
  let cs = 40, ox = 0, oy = 0;
  let player: Track = still(0, 0), facing: Dir = 'R', hopUntil = 0;
  let rafts: Track[] = [];
  let tide = { from: 0, to: 0, t0: 0, dur: TIDE_MS };
  const rings = new Map<number, number>(), washes = new Map<number, number>();
  let splashes: { x: number; y: number; t0: number }[] = [];
  let bump: { dir: Dir; t0: number } | null = null;
  let hint: { from: number; dir: Dir; t0: number } | null = null;
  let ghost: number | null = null;
  let winAt = 0, busyUntil = 0;

  const xy = (i: number) => ({ x: i % b!.w, y: Math.floor(i / b!.w) });

  function layout() {
    if (!b) return;
    const aw = W - insets.left - insets.right, ah = H - insets.top - insets.bottom;
    cs = Math.max(18, Math.floor(Math.min(aw / (b.w + 0.6), ah / (b.h + 0.6), 92)));
    ox = Math.round(insets.left + (aw - cs * b.w) / 2);
    oy = Math.round(insets.top + (ah - cs * b.h) / 2);
  }

  function tideNow(now: number) {
    if (reducedMotion()) return tide.to;
    const p = clamp01((now - tide.t0) / tide.dur);
    return tide.from + (tide.to - tide.from) * smooth(p);
  }
  /** How much of tile i is under water right now (0 dry, 1 covered), following the animated tide. */
  function cover(i: number, now: number, level: number): number {
    const k = b!.kind[i];
    if (k === K.Deep || k === K.Current) return 1;
    if (k !== K.Sand && k !== K.High) return 0;
    if (castleUp(i, now)) return 0;
    return clamp01(level - (b!.height[i] - 1));
  }
  function castleUp(i: number, now: number) {
    if (!b!.castle[i] || !st) return false;
    const w = washes.get(i);
    if (w !== undefined) return now < w; // standing until its wash begins
    return castleStanding(b!, st, i);
  }

  function snap(state: State) {
    if (!b) return;
    st = state;
    const p = xy(state.pos); player = still(p.x, p.y);
    rafts = state.rafts.map(r => { const q = xy(r); return still(q.x, q.y); });
    tide = { from: state.tide, to: state.tide, t0: 0, dur: TIDE_MS };
    washes.clear();
    splashes = []; hint = null; bump = null;
  }

  function finishAll() {
    player = [endOf(player)];
    rafts = rafts.map(t => [endOf(t)]);
    if (tide.t0 + tide.dur > 0) tide = { ...tide, from: tide.to, t0: 0 };
  }

  return {
    get cell() { return cs; },
    get busyUntil() { return busyUntil; },
    resize(w: number, h: number, r: number, ins: Insets) { W = w; H = h; ratio = r; insets = ins; layout(); },
    setLevel(board: Board, state: State) { b = board; layout(); snap(state); ghost = null; winAt = 0; rings.clear(); },
    snap(state: State, now: number, softTide = true) {
      const before = tideNow(now);
      snap(state);
      if (softTide && !reducedMotion() && Math.abs(before - state.tide) > 0.01) tide = { from: before, to: state.tide, t0: now, dur: 160 };
      winAt = 0; busyUntil = now;
    },
    /** Animate the move from the previous state to `next` using the sim's events. */
    move(next: State, events: MoveEvent[], now: number, dir: Dir) {
      if (!b) return;
      finishAll();
      const reduced = reducedMotion();
      const walk = reduced ? 0 : WALK_MS;
      facing = dir; hint = null;
      let t = now, end = now + walk;
      for (const e of events) {
        if (e.type === 'walk') {
          const a = xy(e.from), c = xy(e.to);
          player = [{ t, x: a.x, y: a.y }, { t: t + walk, x: c.x, y: c.y }];
          hopUntil = t + walk;
          if (ghost !== null && (e.to === ghost)) ghost = null;
        } else if (e.type === 'push') {
          if (ghost !== null && e.from === ghost) ghost = null;
          const idx = rafts.findIndex(tr => { const q = endOf(tr); return q.y * b!.w + q.x === e.from; });
          const tiles = e.path.map(xy);
          const per = reduced ? 0 : Math.min(DRIFT_MS, 280 / Math.max(1, tiles.length - 1));
          const track: Track = [{ t, x: tiles[0].x, y: tiles[0].y }, { t: t + walk, x: tiles[1].x, y: tiles[1].y }];
          for (let k = 2; k < tiles.length; k++) track.push({ t: t + walk + per * (k - 1), x: tiles[k].x, y: tiles[k].y });
          if (idx >= 0) rafts[idx] = track;
          if (e.path.length > 2 || b.kind[e.to] === K.Deep || b.kind[e.to] === K.Current || b.kind[e.to] === K.Sand || b.kind[e.to] === K.High) {
            if (next.tide >= b.height[e.path[1]]) splashes.push({ x: tiles[1].x, y: tiles[1].y, t0: t + walk * 0.8 });
          }
          end = Math.max(end, endOf(track).t);
        } else if (e.type === 'ring') {
          if (ghost !== null && e.bell === ghost) ghost = null;
          const t0 = t + walk * 0.75;
          rings.set(e.bell, t0);
          if (e.from !== e.to) { tide = { from: e.from, to: e.to, t0, dur: reduced ? 0 : TIDE_MS }; end = Math.max(end, t0 + TIDE_MS); }
        } else if (e.type === 'wash') {
          for (const i of e.tiles) washes.set(i, tide.t0 + 90);
        } else if (e.type === 'flow') {
          const idx = rafts.findIndex(tr => { const q = endOf(tr); return q.y * b!.w + q.x === e.from; });
          const startAt = Math.max(end - (reduced ? 0 : 140), t + walk);
          const tiles = e.path.map(xy);
          const per = reduced ? 0 : FLOW_MS;
          const base = idx >= 0 ? rafts[idx] : [{ t: startAt, x: tiles[0].x, y: tiles[0].y }];
          const s0 = Math.max(startAt, endOf(base).t);
          const track: Track = [...base, { t: s0, x: tiles[0].x, y: tiles[0].y }];
          for (let k = 1; k < tiles.length; k++) track.push({ t: s0 + per * k, x: tiles[k].x, y: tiles[k].y });
          if (idx >= 0) rafts[idx] = track;
          if (e.rider) player = [...player, { t: s0, x: tiles[0].x, y: tiles[0].y }, ...track.slice(track.length - tiles.length + 1)];
          end = Math.max(end, endOf(track).t);
        } else if (e.type === 'win') winAt = end;
      }
      st = next;
      busyUntil = end;
    },
    bump(dir: Dir, now: number) { if (!reducedMotion()) bump = { dir, t0: now }; facing = dir; },
    showHint(from: number, dir: Dir, now: number) { hint = { from, dir, t0: now }; },
    clearHint() { hint = null; },
    setGhost(i: number | null) { ghost = i; },
    /** Tile under a canvas point, or -1. */
    tileAt(px: number, py: number) {
      if (!b) return -1;
      const x = Math.floor((px - ox) / cs), y = Math.floor((py - oy) / cs);
      return x < 0 || y < 0 || x >= b.w || y >= b.h ? -1 : y * b.w + x;
    },
    /** Centre of a tile in CSS pixels (for the browser bot and the ghost hand). */
    center(i: number) { const p = xy(i); return { x: ox + (p.x + 0.5) * cs, y: oy + (p.y + 0.5) * cs }; },
    playerScreen(now: number) { const p = at(player, now); return { x: ox + (p.x + 0.5) * cs, y: oy + (p.y + 0.5) * cs }; },
    draw(now: number) { if (ctx) drawFrame(ctx, now); }
  };

  // ------------------------------------------------------------------ drawing
  function drawFrame(g: CanvasRenderingContext2D, now: number) {
    const reduced = reducedMotion();
    const time = reduced ? 0 : now / 1000;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Open sea: a deep teal gradient with slow, soft swell lines.
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#1f5f78'); sea.addColorStop(1, '#123f5c');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.4;
    for (let y = -20; y < H + 20; y += 26) {
      g.beginPath();
      for (let x = 0; x <= W; x += 12) { const yy = y + Math.sin(x * 0.02 + time * 0.8 + y * 0.1) * 4 + Math.sin(x * 0.051 - time * 0.5) * 2; if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      g.stroke();
    }
    if (!b || !st) return;
    const level = tideNow(now);
    const n = b.w * b.h;
    const covers = new Float32Array(n);
    for (let i = 0; i < n; i++) covers[i] = cover(i, now, level);

    // Board shadow, then tiles.
    for (let i = 0; i < n; i++) drawTile(g, i, covers[i], now, time);
    drawFoam(g, covers, time);
    for (let i = 0; i < n; i++) drawProp(g, i, now, time);
    // Splashes.
    splashes = splashes.filter(s => now - s.t0 < 600);
    for (const s of splashes) {
      const p = (now - s.t0) / 600; if (p < 0) continue;
      g.strokeStyle = `rgba(235,250,255,${0.7 * (1 - p)})`; g.lineWidth = 2;
      g.beginPath(); g.arc(ox + (s.x + 0.5) * cs, oy + (s.y + 0.5) * cs, cs * (0.2 + 0.5 * p), 0, Math.PI * 2); g.stroke();
    }
    drawRafts(g, now, time, covers);
    drawPlayer(g, now, time);
    drawHint(g, now);
    drawGhost(g, now);
    drawGauge(g, level);
  }

  function drawTile(g: CanvasRenderingContext2D, i: number, c: number, now: number, time: number) {
    const k = b!.kind[i] as K, { x, y } = xy(i);
    const px = ox + x * cs, py = oy + y * cs, r = cs * 0.16;
    if (k === K.Deep || k === K.Current) {
      g.fillStyle = 'rgba(8,38,66,0.35)'; g.fillRect(px, py, cs, cs);
      if (k === K.Current) drawCurrent(g, i, px, py, time);
      return;
    }
    if (k === K.Cliff) {
      // Headlands: neighbouring cliff tiles merge into one grassy mass with a darker face where it drops to the shore.
      const isC = (d: Dir) => { const nx = x + DXY[d][0], ny = y + DXY[d][1]; return nx >= 0 && ny >= 0 && nx < b!.w && ny < b!.h && b!.kind[ny * b!.w + nx] === K.Cliff; };
      const u = isC('U'), dn = isC('D'), l = isC('L'), rt = isC('R');
      const R = cs * 0.3;
      const radii = [!u && !l ? R : 0, !u && !rt ? R : 0, !dn && !rt ? R : 0, !dn && !l ? R : 0];
      g.fillStyle = '#35503d'; cornerRect(g, px, py, cs, cs, radii); g.fill();
      g.fillStyle = '#4f7a58'; cornerRect(g, px, py, cs, dn ? cs : cs * 0.8, radii.map((v, n) => (n >= 2 && !dn ? v * 0.8 : v))); g.fill();
      g.fillStyle = 'rgba(120,170,110,0.35)';
      if (hash(i, 1) < 0.6) tuft(g, px + cs * (0.25 + 0.5 * hash(i, 2)), py + cs * (0.25 + 0.4 * hash(i, 3)), cs * 0.07);
      if (hash(i, 4) < 0.3) { g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(px + cs * (0.2 + 0.6 * hash(i, 5)), py + cs * (0.2 + 0.5 * hash(i, 6)), cs * 0.03, 0, Math.PI * 2); g.fill(); }
      return;
    }
    if (k === K.Sand || k === K.High) {
      const high = k === K.High;
      g.fillStyle = high ? '#d8bd85' : '#ead6a6'; roundRect(g, px + 1, py + 1, cs - 2, cs - 2, r); g.fill();
      g.strokeStyle = high ? 'rgba(150,120,70,0.35)' : 'rgba(180,150,95,0.35)'; g.lineWidth = 1;
      for (let l = 0; l < 3; l++) { const yy = py + cs * (0.28 + l * 0.22); g.beginPath(); g.moveTo(px + cs * 0.18, yy); g.quadraticCurveTo(px + cs * 0.5, yy - cs * 0.06, px + cs * 0.82, yy); g.stroke(); }
      if (high) { g.fillStyle = 'rgba(110,140,80,0.55)'; tuft(g, px + cs * (0.25 + 0.5 * hash(i, 3)), py + cs * 0.3, cs * 0.07); tuft(g, px + cs * (0.3 + 0.4 * hash(i, 4)), py + cs * 0.72, cs * 0.06); }
      if (c > 0) {
        // Shallow water over the sand: tint and glints, deepening as the tide climbs.
        g.fillStyle = `rgba(52,150,170,${0.72 * c})`; roundRect(g, px, py, cs, cs, r * (1 - c)); g.fill();
        g.strokeStyle = `rgba(220,250,255,${0.22 * c})`; g.lineWidth = 1.2;
        const s = Math.sin(time * 1.6 + i) * cs * 0.05;
        g.beginPath(); g.moveTo(px + cs * 0.2 + s, py + cs * 0.4); g.lineTo(px + cs * 0.45 + s, py + cs * 0.4); g.stroke();
        g.beginPath(); g.moveTo(px + cs * 0.55 - s, py + cs * 0.68); g.lineTo(px + cs * 0.8 - s, py + cs * 0.68); g.stroke();
      }
      if (b!.castle[i]) drawCastle(g, i, px, py, now);
      return;
    }
    // Rock family: bells, the flag and plain rock all stand on a stone slab.
    const grad = g.createLinearGradient(px, py, px, py + cs);
    grad.addColorStop(0, '#b9b3a6'); grad.addColorStop(1, '#948d80');
    g.fillStyle = '#7d776c'; roundRect(g, px + 1, py + 2, cs - 2, cs - 2, r); g.fill();
    g.fillStyle = grad; roundRect(g, px + 1, py + 1, cs - 2, cs - 3, r); g.fill();
    g.fillStyle = 'rgba(80,74,66,0.35)';
    for (let t = 0; t < 4; t++) { g.beginPath(); g.arc(px + cs * (0.18 + 0.64 * hash(i, t)), py + cs * (0.18 + 0.64 * hash(i, t + 11)), cs * 0.025 + cs * 0.02 * hash(i, t + 5), 0, Math.PI * 2); g.fill(); }
  }

  function drawCurrent(g: CanvasRenderingContext2D, i: number, px: number, py: number, time: number) {
    const d = DIRS[b!.flow[i]], [dx, dy] = DXY[d];
    g.save(); g.beginPath(); g.rect(px, py, cs, cs); g.clip();
    g.strokeStyle = 'rgba(190,240,255,0.42)'; g.lineWidth = Math.max(1.5, cs * 0.05); g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const p = reducedMotion() ? 0.3 + k * 0.4 : ((time * 0.9 + k * 0.5 + hash(i, 1) * 0.2) % 1);
      const cx = px + cs / 2 + dx * (p - 0.5) * cs + dy * (k - 0.5) * cs * 0.35;
      const cy = py + cs / 2 + dy * (p - 0.5) * cs + dx * (k - 0.5) * cs * 0.35;
      const a = reducedMotion() ? 0.8 : Math.sin(p * Math.PI);
      g.globalAlpha = a;
      g.beginPath();
      g.moveTo(cx - dx * cs * 0.12 - dy * cs * 0.1, cy - dy * cs * 0.12 - dx * cs * 0.1);
      g.lineTo(cx, cy);
      g.lineTo(cx - dx * cs * 0.12 + dy * cs * 0.1, cy - dy * cs * 0.12 + dx * cs * 0.1);
      g.stroke();
    }
    g.restore(); g.globalAlpha = 1;
  }

  function drawCastle(g: CanvasRenderingContext2D, i: number, px: number, py: number, now: number) {
    const w = washes.get(i);
    const standing = castleUp(i, now);
    let p = 0;
    if (!standing) { if (w === undefined || reducedMotion()) return; p = (now - w) / 450; if (p >= 1) return; }
    const high = b!.castle[i] === 2;
    g.save();
    g.globalAlpha = 1 - p;
    g.translate(px + cs / 2, py + cs * (0.58 + 0.15 * p));
    g.scale(1, 1 - 0.6 * p);
    const base = high ? '#c9a868' : '#dcc18a', shade = high ? '#a88a52' : '#bfa16c';
    g.fillStyle = shade; roundRect(g, -cs * 0.36, -cs * 0.1, cs * 0.72, cs * 0.34, cs * 0.05); g.fill();
    g.fillStyle = base; roundRect(g, -cs * 0.34, -cs * 0.14, cs * 0.68, cs * 0.3, cs * 0.05); g.fill();
    for (const tx of [-0.26, 0, 0.26]) {
      const th = tx === 0 ? 0.46 : 0.34;
      g.fillStyle = shade; g.fillRect(cs * (tx - 0.09), -cs * th, cs * 0.18, cs * th);
      g.fillStyle = base; g.fillRect(cs * (tx - 0.08), -cs * th, cs * 0.16, cs * (th - 0.02));
      g.fillStyle = shade; for (const m of [-0.06, 0.02]) g.fillRect(cs * (tx + m), -cs * (th + 0.05), cs * 0.04, cs * 0.05);
    }
    g.fillStyle = '#7a5a34'; roundRect(g, -cs * 0.05, -cs * 0.06, cs * 0.1, cs * 0.16, cs * 0.04); g.fill();
    if (high) { g.fillStyle = '#ff8a5b'; g.beginPath(); g.moveTo(0, -cs * 0.62); g.lineTo(cs * 0.14, -cs * 0.56); g.lineTo(0, -cs * 0.5); g.fill(); g.fillStyle = '#6b5136'; g.fillRect(-cs * 0.01, -cs * 0.62, cs * 0.02, cs * 0.16); }
    g.restore();
  }

  /** White foam where dry land meets water, breathing slightly. */
  function drawFoam(g: CanvasRenderingContext2D, covers: Float32Array, time: number) {
    const B = b!;
    g.lineCap = 'round';
    for (let i = 0; i < covers.length; i++) {
      const land = B.kind[i] === K.Deep || B.kind[i] === K.Current ? 0 : 1 - covers[i];
      if (land < 0.05) continue;
      const { x, y } = xy(i);
      for (const d of DIRS) {
        const nx = x + DXY[d][0], ny = y + DXY[d][1];
        const inside = nx >= 0 && ny >= 0 && nx < B.w && ny < B.h;
        const j = ny * B.w + nx;
        const water = inside ? (B.kind[j] === K.Cliff ? 0 : covers[j]) : (B.kind[i] === K.Cliff ? 0 : 1);
        const a = Math.min(land, water); if (a < 0.05) continue;
        const wob = Math.sin(time * 2 + i * 1.7 + DIRS.indexOf(d)) * cs * 0.025;
        g.strokeStyle = `rgba(240,252,255,${0.55 * a})`; g.lineWidth = Math.max(1.5, cs * 0.06);
        const px = ox + x * cs, py = oy + y * cs;
        g.beginPath();
        if (d === 'U') { g.moveTo(px + cs * 0.12, py - wob); g.lineTo(px + cs * 0.88, py + wob); }
        if (d === 'D') { g.moveTo(px + cs * 0.12, py + cs + wob); g.lineTo(px + cs * 0.88, py + cs - wob); }
        if (d === 'L') { g.moveTo(px - wob, py + cs * 0.12); g.lineTo(px + wob, py + cs * 0.88); }
        if (d === 'R') { g.moveTo(px + cs + wob, py + cs * 0.12); g.lineTo(px + cs - wob, py + cs * 0.88); }
        g.stroke();
      }
    }
  }

  function drawProp(g: CanvasRenderingContext2D, i: number, now: number, time: number) {
    const k = b!.kind[i] as K;
    const { x, y } = xy(i), cx = ox + (x + 0.5) * cs, cy = oy + (y + 0.5) * cs;
    if (k === K.Bell || k === K.Up || k === K.Down) drawBell(g, i, k, cx, cy, now);
    else if (k === K.Goal) drawFlag(g, cx, cy, now, time);
  }

  function drawBell(g: CanvasRenderingContext2D, i: number, k: K, cx: number, cy: number, now: number) {
    const rung = rings.get(i);
    const since = rung === undefined ? 1e9 : (now - rung) / 1000;
    const swing = reducedMotion() || since < 0 ? 0 : Math.sin(since * 18) * Math.exp(-since * 3.2) * 0.45;
    // Ripples ringing out.
    if (since >= 0 && since < 0.9 && !reducedMotion()) {
      for (const lag of [0, 0.18]) {
        const p = (since - lag) / 0.7; if (p < 0 || p > 1) continue;
        g.strokeStyle = `rgba(255,236,170,${0.6 * (1 - p)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy - cs * 0.05, cs * (0.35 + 0.9 * p), 0, Math.PI * 2); g.stroke();
      }
    }
    // Frame: two posts and a beam.
    g.fillStyle = '#6b4a2c';
    g.fillRect(cx - cs * 0.32, cy - cs * 0.36, cs * 0.07, cs * 0.62); g.fillRect(cx + cs * 0.25, cy - cs * 0.36, cs * 0.07, cs * 0.62);
    g.fillStyle = '#835b36'; roundRect(g, cx - cs * 0.36, cy - cs * 0.42, cs * 0.72, cs * 0.1, cs * 0.03); g.fill();
    const tone = k === K.Up ? ['#9fe3d4', '#3f9e8f'] : k === K.Down ? ['#ffb59c', '#c96a4f'] : ['#ffe08a', '#c8962e'];
    g.save(); g.translate(cx, cy - cs * 0.32); g.rotate(swing);
    const grad = g.createLinearGradient(-cs * 0.2, 0, cs * 0.2, 0);
    grad.addColorStop(0, tone[1]); grad.addColorStop(0.45, tone[0]); grad.addColorStop(1, tone[1]);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-cs * 0.1, cs * 0.06);
    g.quadraticCurveTo(-cs * 0.12, cs * 0.0, 0, cs * 0.0);
    g.quadraticCurveTo(cs * 0.12, cs * 0.0, cs * 0.1, cs * 0.06);
    g.lineTo(cs * 0.14, cs * 0.32); g.quadraticCurveTo(cs * 0.22, cs * 0.4, 0, cs * 0.4); g.quadraticCurveTo(-cs * 0.22, cs * 0.4, -cs * 0.14, cs * 0.32);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(60,40,10,0.45)'; g.beginPath(); g.ellipse(0, cs * 0.39, cs * 0.16, cs * 0.035, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = tone[1]; g.beginPath(); g.arc(0, cs * 0.43, cs * 0.035, 0, Math.PI * 2); g.fill();
    g.restore();
    if (k === K.Up || k === K.Down) {
      // Up and down bells wear an arrow on the beam.
      g.fillStyle = '#fff8e8';
      const ay = cy + cs * 0.34, s = cs * 0.1;
      g.beginPath();
      if (k === K.Up) { g.moveTo(cx, ay - s); g.lineTo(cx + s, ay + s * 0.4); g.lineTo(cx - s, ay + s * 0.4); }
      else { g.moveTo(cx, ay + s); g.lineTo(cx + s, ay - s * 0.4); g.lineTo(cx - s, ay - s * 0.4); }
      g.fill();
    }
  }

  function drawFlag(g: CanvasRenderingContext2D, cx: number, cy: number, now: number, time: number) {
    const won = winAt > 0 && now >= winAt;
    const lift = won && !reducedMotion() ? Math.min(1, (now - winAt) / 400) : 0;
    g.fillStyle = 'rgba(40,30,20,0.3)'; g.beginPath(); g.ellipse(cx, cy + cs * 0.3, cs * 0.14, cs * 0.05, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5b4632'; g.fillRect(cx - cs * 0.025, cy - cs * 0.4, cs * 0.05, cs * 0.72);
    const top = cy - cs * (0.4 + 0.06 * lift);
    g.fillStyle = won ? '#ffd166' : '#ff6b5a';
    g.beginPath(); g.moveTo(cx + cs * 0.025, top);
    for (let s = 0; s <= 6; s++) { const fx = cx + cs * 0.025 + s * cs * 0.06; g.lineTo(fx, top + Math.sin(time * 5 - s * 0.9) * cs * 0.025 * (s / 6)); }
    for (let s = 6; s >= 0; s--) { const fx = cx + cs * 0.025 + s * cs * 0.06; g.lineTo(fx, top + cs * 0.24 - s * cs * 0.02 + Math.sin(time * 5 - s * 0.9) * cs * 0.025 * (s / 6)); }
    g.closePath(); g.fill();
    if (won && !reducedMotion()) {
      const p = ((now - winAt) % 1200) / 1200;
      g.strokeStyle = `rgba(255,220,130,${0.5 * (1 - p)})`; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, cs * (0.4 + p * 0.6), 0, Math.PI * 2); g.stroke();
    }
  }

  function drawRafts(g: CanvasRenderingContext2D, now: number, time: number, covers: Float32Array) {
    const reduced = reducedMotion();
    rafts.forEach((track, idx) => {
      const p = at(track, now);
      const tx = Math.round(p.x), ty = Math.round(p.y);
      const tile = ty * b!.w + tx;
      const floating = covers[tile] > 0.5;
      const bob = floating && !reduced ? Math.sin(time * 2.2 + idx * 1.3) * cs * 0.025 : 0;
      const cx = ox + (p.x + 0.5) * cs, cy = oy + (p.y + 0.5) * cs + bob;
      const len = cs * 0.78, thick = cs * 0.34;
      if (floating) { g.strokeStyle = 'rgba(220,245,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy + cs * 0.04, len * 0.58, thick * 0.85, 0, 0, Math.PI * 2); g.stroke(); }
      else { g.fillStyle = 'rgba(30,20,10,0.32)'; roundRect(g, cx - len / 2 + 2, cy - thick / 2 + 4, len, thick, thick / 2); g.fill(); }
      const grad = g.createLinearGradient(0, cy - thick / 2, 0, cy + thick / 2);
      grad.addColorStop(0, '#b07a4a'); grad.addColorStop(0.5, '#8a5a32'); grad.addColorStop(1, '#6a4224');
      g.fillStyle = grad; roundRect(g, cx - len / 2, cy - thick / 2, len, thick, thick / 2); g.fill();
      g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = 1;
      for (const f of [-0.12, 0.1]) { g.beginPath(); g.moveTo(cx - len * 0.32, cy + thick * f); g.lineTo(cx + len * 0.28, cy + thick * f + 1); g.stroke(); }
      g.fillStyle = '#d9b07c'; g.beginPath(); g.ellipse(cx + len / 2 - thick * 0.28, cy, thick * 0.24, thick * 0.44, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9a6a3e'; g.beginPath(); g.ellipse(cx + len / 2 - thick * 0.28, cy, thick * 0.12, thick * 0.24, 0, 0, Math.PI * 2); g.stroke();
    });
  }

  function drawPlayer(g: CanvasRenderingContext2D, now: number, time: number) {
    const reduced = reducedMotion();
    const p = at(player, now);
    let x = p.x, y = p.y;
    if (bump && !reduced) {
      const q = (now - bump.t0) / 140;
      if (q >= 1) bump = null; else { const k = Math.sin(q * Math.PI) * 0.12; x += DXY[bump.dir][0] * k; y += DXY[bump.dir][1] * k; }
    }
    const hop = !reduced && now < hopUntil ? Math.sin(clamp01(1 - (hopUntil - now) / WALK_MS) * Math.PI) * cs * 0.12 : 0;
    const breathe = reduced ? 0 : Math.sin(time * 2.4) * cs * 0.008;
    const cx = ox + (x + 0.5) * cs, cy = oy + (y + 0.5) * cs - hop;
    g.fillStyle = 'rgba(20,20,30,0.3)'; g.beginPath(); g.ellipse(cx, oy + (y + 0.5) * cs + cs * 0.24, cs * 0.2, cs * 0.07, 0, 0, Math.PI * 2); g.fill();
    // Raincoat body.
    g.fillStyle = '#e8a91c'; g.beginPath(); g.ellipse(cx, cy + cs * 0.08, cs * 0.2, cs * 0.21 + breathe, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffc93c'; g.beginPath(); g.ellipse(cx - cs * 0.03, cy + cs * 0.05, cs * 0.15, cs * 0.17, 0, 0, Math.PI * 2); g.fill();
    // Hooded head, looking the way you last moved.
    const [fx, fy] = DXY[facing];
    const hx = cx + fx * cs * 0.03, hy = cy - cs * 0.16 + fy * cs * 0.02;
    g.fillStyle = '#ffc93c'; g.beginPath(); g.arc(hx, hy, cs * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbe3c4'; g.beginPath(); g.arc(hx + fx * cs * 0.04, hy + cs * 0.02 + fy * cs * 0.03, cs * 0.105, 0, Math.PI * 2); g.fill();
    if (facing !== 'U') {
      g.fillStyle = '#2a2a35';
      const ex = hx + fx * cs * 0.06, ey = hy + cs * 0.02 + fy * cs * 0.04;
      for (const s of fx === 0 ? [-1, 1] : [fx * 0.3 - 0.5, fx * 0.3 + 0.9]) { g.beginPath(); g.arc(ex + s * cs * 0.04, ey, cs * 0.018, 0, Math.PI * 2); g.fill(); }
    }
  }

  function drawHint(g: CanvasRenderingContext2D, now: number) {
    if (!hint) return;
    const t = (now - hint.t0) / 1000; if (t > 4) { hint = null; return; }
    const from = xy(hint.from), [dx, dy] = DXY[hint.dir];
    const cx = ox + (from.x + 0.5 + dx * 0.95) * cs, cy = oy + (from.y + 0.5 + dy * 0.95) * cs;
    const pulse = reducedMotion() ? 0.5 : 0.5 + 0.5 * Math.sin(t * 7);
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = `rgba(255,236,150,${0.55 + 0.35 * pulse})`; g.strokeStyle = 'rgba(80,50,0,0.5)'; g.lineWidth = 1.5;
    const s = cs * (0.26 + 0.04 * pulse);
    g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.4, -s * 0.8); g.lineTo(-s * 0.4, -s * 0.3); g.lineTo(-s, -s * 0.3); g.lineTo(-s, s * 0.3); g.lineTo(-s * 0.4, s * 0.3); g.lineTo(-s * 0.4, s * 0.8); g.closePath();
    g.fill(); g.stroke(); g.restore();
  }

  function drawGhost(g: CanvasRenderingContext2D, now: number) {
    if (ghost === null) return;
    const { x, y } = xy(ghost);
    const t = reducedMotion() ? 0.3 : (now / 1000) % 1.4 / 1.4;
    const press = Math.sin(Math.min(1, t * 1.6) * Math.PI);
    const cx = ox + (x + 0.62) * cs, cy = oy + (y + 0.72) * cs + press * cs * 0.08;
    g.save(); g.globalAlpha = 0.85;
    g.strokeStyle = `rgba(255,255,255,${0.6 * press})`; g.lineWidth = 2; g.beginPath(); g.arc(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * (0.25 + 0.15 * press), 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#3b4a5a'; g.lineWidth = 1.5;
    const u = cs * 0.1;
    g.beginPath(); roundRectPath(g, cx - u * 0.45, cy - u * 3.1, u * 0.9, u * 2.6, u * 0.45); g.fill(); g.stroke();
    g.beginPath(); roundRectPath(g, cx - u * 1.1, cy - u * 1.0, u * 2.6, u * 2.3, u * 0.9); g.fill(); g.stroke();
    g.restore();
  }

  /** A small tide gauge by the board: one notch per tide height, the water at the current one. */
  function drawGauge(g: CanvasRenderingContext2D, level: number) {
    const B = b!; const steps = B.maxTide + 1;
    const gh = Math.min(cs * 1.6, 70), gw = Math.max(12, cs * 0.3);
    const gx = Math.max(6, ox - gw - cs * 0.35), gy = oy;
    if (gx + gw > ox - 2) return; // no room beside the board: the HUD shows the tide in words instead
    g.fillStyle = 'rgba(8,25,40,0.55)'; roundRect(g, gx, gy, gw, gh, gw / 2); g.fill();
    const fill = (level + 0.5) / steps;
    g.fillStyle = '#5ec8de'; roundRect(g, gx + 2, gy + gh - 2 - (gh - 4) * fill, gw - 4, (gh - 4) * fill, (gw - 4) / 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    for (let s = 1; s < steps; s++) { const yy = gy + gh - gh * (s / steps); g.beginPath(); g.moveTo(gx + 3, yy); g.lineTo(gx + gw - 3, yy); g.stroke(); }
  }
}

function tuft(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath(); g.moveTo(x - s, y + s); g.lineTo(x - s * 0.3, y - s); g.lineTo(x, y + s * 0.6); g.lineTo(x + s * 0.4, y - s * 1.1); g.lineTo(x + s, y + s); g.closePath(); g.fill();
}
function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath();
}
function cornerRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]) {
  g.beginPath(); g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); if (tr) g.arcTo(x + w, y, x + w, y + tr, tr); g.lineTo(x + w, y + h - br); if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br);
  g.lineTo(x + bl, y + h); if (bl) g.arcTo(x, y + h, x, y + h - bl, bl); g.lineTo(x, y + tl); if (tl) g.arcTo(x, y, x + tl, y, tl); g.closePath();
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); roundRectPath(g, x, y, w, h, r); }
export type Renderer = ReturnType<typeof createRenderer>;
