/** Canvas drawing for Block Drop. It reads game state and effect timers; it never changes the rules. */
import { COLS, HIDDEN, ROWS, SHAPES, stackHeight, type Cell, type Game, type PieceType } from './logic';

export const ACCENT = '#8B7CFF';
/** One colour per piece, I O T S Z J L, chosen to stay distinct on the dark well. */
export const PIECE_COLORS = ['#3FD0EE', '#FFCF57', '#B58CFF', '#62DC8A', '#FF7388', '#6688FF', '#FF9F52'] as const;
const INK = '#F7F9FF', MUTED = '#A8B1C5', PANEL = '#0E1326', LINE = '#2A3355';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

type Box = { x: number; y: number; w: number; h: number };
export type Layout = {
  w: number; h: number; cell: number; mini: number; compact: boolean;
  /** Height of the score strip above the well in the compact (phone) layout. */
  top: number;
  well: Box; hold: Box; next: Box;
  /** Where the stacked stats start, under the hold box. */
  stats: { x: number; y: number; w: number };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Fits the well, its two side columns and (on phones) a score strip into the space the page offers. */
export function computeLayout(availW: number, availH: number): Layout {
  // Compact: a narrow, upright space (phones, split-screen seats). Score moves to a strip above the well.
  const compact = availW < 560 && availH >= availW;
  const pad = compact ? 3 : 8, gap = compact ? 5 : 14, top = compact ? 50 : 0;
  const sideFor = (cell: number) => (compact ? clamp(Math.round(availW * 0.18), 66, 100) : clamp(Math.round(cell * 4.4), 104, 156));
  const byHeight = Math.floor((availH - top - 2 * pad) / 20);
  const byWidth = Math.floor((availW - 2 * pad - 2 * gap - 2 * sideFor(clamp(byHeight, 10, 40))) / COLS);
  const cell = clamp(Math.min(byHeight, byWidth), 10, 40);
  const side = sideFor(cell);
  const mini = compact ? Math.floor((side - 12) / 4) : clamp(Math.round(cell * 0.7), 14, 26);
  const well = { x: pad + side + gap, y: top + pad, w: cell * COLS, h: cell * 20 };
  const label = 24, slot = mini * 3;
  const hold = { x: pad, y: well.y, w: side, h: label + slot + 8 };
  const next = { x: well.x + well.w + gap, y: well.y, w: side, h: label + slot * 3 + 8 };
  return {
    w: well.x + well.w + gap + side + pad, h: well.y + well.h + pad, cell, mini, compact, top, well, hold, next,
    stats: { x: pad, y: hold.y + hold.h + (compact ? 12 : 18), w: side }
  };
}

export type Popup = { title: string; sub: string; row: number; t: number; color: string };
export type Effects = {
  /** Rows being removed, with elapsed and total milliseconds. */
  clear: { rows: number[]; t: number; dur: number } | null;
  locks: Array<{ cells: Cell[]; t: number }>;
  trails: Array<{ cells: Cell[]; from: number; type: PieceType; t: number }>;
  popups: Popup[];
  /** Milliseconds left of the level-up banner. */
  levelUp: number;
  /** Milliseconds left of the small downward nudge after a hard drop. */
  thud: number;
};
export const newEffects = (): Effects => ({ clear: null, locks: [], trails: [], popups: [], levelUp: 0, thud: 0 });
export const LOCK_MS = 200, TRAIL_MS = 220, POPUP_MS = 1100, LEVEL_MS = 1400, THUD_MS = 110;

export type View = {
  game: Game; ghost: number; fx: Effects; reduced: boolean; shownScore: number; best: number;
  /** 0–1: how close the lock timer is to fixing the resting piece. */
  lockProgress: number;
  /** Lines shown in the empty well before the first piece lands; empty to hide. */
  hint: readonly string[]; hintAlpha: number;
  labels: { hold: string; next: string; score: string; level: string; lines: string; best: string; levelUp: string; faster: string };
};

const mix = (hex: string, target: number, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + target * amount);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function paintBlock(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, s: number) {
  const inset = s >= 18 ? 1 : 0.5, size = s - inset * 2, r = Math.max(2, s * 0.2);
  const body = ctx.createLinearGradient(0, y, 0, y + s);
  body.addColorStop(0, mix(color, 255, 0.22)); body.addColorStop(0.55, color); body.addColorStop(1, mix(color, 0, 0.3));
  ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x + inset, y + inset, size, size, r); ctx.fill();
  // Raised face: a lighter inner tile with a bright top lip and a shaded bottom edge.
  const edge = Math.max(2, s * 0.14);
  ctx.fillStyle = mix(color, 255, 0.14); ctx.beginPath(); ctx.roundRect(x + inset + edge, y + inset + edge, size - edge * 2, size - edge * 2, Math.max(1, r * 0.55)); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.roundRect(x + inset + edge, y + inset + edge * 0.45, size - edge * 2, Math.max(1.5, edge * 0.4), 1); ctx.fill();
  ctx.fillStyle = 'rgba(8,10,28,.28)'; ctx.beginPath(); ctx.roundRect(x + inset + edge, y + inset + size - edge * 0.85, size - edge * 2, Math.max(1.5, edge * 0.4), 1); ctx.fill();
}

/** Blocks are painted once per colour and size, then stamped; redrawing 200 gradients a frame is wasteful on phones. */
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let layout = computeLayout(600, 600), dpr = 1;
  const sprites = new Map<string, HTMLCanvasElement>();

  function sprite(type: number, size: number): HTMLCanvasElement {
    const key = `${type}:${size}:${dpr}`;
    let made = sprites.get(key);
    if (!made) {
      made = document.createElement('canvas');
      made.width = made.height = Math.max(1, Math.round(size * dpr));
      const sctx = made.getContext('2d');
      if (sctx) { sctx.setTransform(dpr, 0, 0, dpr, 0, 0); paintBlock(sctx, PIECE_COLORS[type], 0, 0, size); }
      sprites.set(key, made);
    }
    return made;
  }
  const block = (type: number, x: number, y: number, size: number) => ctx.drawImage(sprite(type, size), x, y, size, size);

  function resize(availW: number, availH: number) {
    layout = computeLayout(availW, availH);
    dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = Math.round(layout.w * dpr); canvas.height = Math.round(layout.h * dpr);
    canvas.style.width = `${layout.w}px`; canvas.style.height = `${layout.h}px`;
    sprites.clear();
    return layout;
  }

  function text(value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 800) {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color; ctx.fillText(value, x, y);
  }
  function panel(box: Box, stroke = LINE) {
    ctx.fillStyle = PANEL; ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 10); ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10); ctx.stroke();
  }
  /** A piece centred in a preview slot. */
  function preview(type: PieceType, cx: number, cy: number, size: number, alpha = 1) {
    const cells = SHAPES[type][0];
    const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = cx - (w * size) / 2 - Math.min(...xs) * size, oy = cy - (h * size) / 2 - Math.min(...ys) * size;
    ctx.globalAlpha = alpha;
    cells.forEach(([x, y]) => block(type, Math.round(ox + x * size), Math.round(oy + y * size), size));
    ctx.globalAlpha = 1;
  }

  function draw(view: View) {
    const { game, fx, reduced } = view, { well, cell, hold, next, mini, compact } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.w, layout.h);
    const labelSize = 13, valueSize = compact ? 17 : 22;

    // Side columns.
    panel(hold);
    text(view.labels.hold, hold.x + hold.w / 2, hold.y + 17, labelSize, MUTED, 'center');
    if (game.hold !== null) preview(game.hold, hold.x + hold.w / 2, hold.y + 24 + (mini * 3) / 2, mini, game.canHold ? 1 : 0.35);
    panel(next);
    text(view.labels.next, next.x + next.w / 2, next.y + 17, labelSize, MUTED, 'center');
    game.queue.slice(0, 3).forEach((type, i) => preview(type, next.x + next.w / 2, next.y + 24 + mini * 3 * (i + 0.5), i === 0 ? mini : Math.max(10, mini - 2), i === 0 ? 1 : 0.8));

    const stats: Array<[string, string]> = [[view.labels.level, String(game.level)], [view.labels.lines, String(game.lines)], [view.labels.best, String(Math.max(view.best, game.score))]];
    if (compact) {
      text(view.labels.score, layout.w / 2, 17, labelSize, MUTED, 'center');
      text(String(view.shownScore), layout.w / 2, 43, 26, INK, 'center');
    } else stats.unshift([view.labels.score, String(view.shownScore)]);
    const rowH = labelSize + valueSize + (compact ? 13 : 16);
    stats.forEach(([label, value], i) => {
      const y = layout.stats.y + i * rowH;
      text(label, layout.stats.x + 4, y + labelSize, labelSize, MUTED);
      text(value, layout.stats.x + 4, y + labelSize + valueSize + 3, i === 0 && !compact ? valueSize + 4 : valueSize, INK);
    });

    // The well.
    const danger = game.over ? 0 : clamp((stackHeight(game) - HIDDEN - 12) / 5, 0, 1);
    const glow = fx.levelUp > 0 ? clamp(fx.levelUp / LEVEL_MS, 0, 1) : 0;
    const nudge = !reduced && fx.thud > 0 ? Math.round(2 * (fx.thud / THUD_MS)) : 0;
    ctx.save();
    ctx.translate(0, nudge);
    ctx.fillStyle = PANEL; ctx.beginPath(); ctx.roundRect(well.x - 3, well.y - 3, well.w + 6, well.h + 6, 9); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.rect(well.x, well.y, well.w, well.h); ctx.clip();
    const back = ctx.createLinearGradient(0, well.y, 0, well.y + well.h);
    back.addColorStop(0, '#141A33'); back.addColorStop(1, '#0B0F20');
    ctx.fillStyle = back; ctx.fillRect(well.x, well.y, well.w, well.h);
    ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < COLS; i++) { ctx.moveTo(well.x + i * cell + 0.5, well.y); ctx.lineTo(well.x + i * cell + 0.5, well.y + well.h); }
    for (let i = 1; i < 20; i++) { ctx.moveTo(well.x, well.y + i * cell + 0.5); ctx.lineTo(well.x + well.w, well.y + i * cell + 0.5); }
    ctx.stroke();
    if (danger > 0) {
      const warn = ctx.createLinearGradient(0, well.y, 0, well.y + cell * 5);
      warn.addColorStop(0, `rgba(255,90,110,${0.26 * danger})`); warn.addColorStop(1, 'rgba(255,90,110,0)');
      ctx.fillStyle = warn; ctx.fillRect(well.x, well.y, well.w, cell * 5);
    }
    const px = (x: number) => well.x + x * cell, py = (y: number) => well.y + (y - HIDDEN) * cell;

    // Hard-drop trails sit behind the blocks.
    if (!reduced) fx.trails.forEach((trail) => {
      const a = 1 - trail.t / TRAIL_MS;
      trail.cells.forEach(([x, y]) => {
        const y0 = py(y - trail.from), y1 = py(y);
        if (y1 <= y0) return;
        const streak = ctx.createLinearGradient(0, y0, 0, y1);
        streak.addColorStop(0, 'rgba(255,255,255,0)'); streak.addColorStop(1, `rgba(255,255,255,${0.2 * a})`);
        ctx.fillStyle = streak; ctx.fillRect(px(x) + 2, y0, cell - 4, y1 - y0);
      });
    });

    const clearing = fx.clear ? new Set(fx.clear.rows) : null, progress = fx.clear ? clamp(fx.clear.t / fx.clear.dur, 0, 1) : 0;
    for (let y = HIDDEN; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const value = game.board[y][x];
      if (!value) continue;
      if (clearing?.has(y)) {
        // Only the cleared rows animate: a white flash, then the blocks shrink away from the centre outward.
        if (reduced) { ctx.globalAlpha = 1 - progress; block(value - 1, px(x), py(y), cell); ctx.globalAlpha = 1; continue; }
        const delay = (Math.abs(x - 4.5) / 4.5) * 0.3, q = clamp((progress - 0.2 - delay) / 0.5, 0, 1), size = cell * (1 - q * q), off = (cell - size) / 2;
        if (size > 0.5) { ctx.globalAlpha = 1 - q * 0.7; ctx.drawImage(sprite(value - 1, cell), px(x) + off, py(y) + off, size, size); }
        ctx.globalAlpha = clamp(progress / 0.12, 0, 1) * (1 - q) * 0.85; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(px(x) + off + 1, py(y) + off + 1, Math.max(0, size - 2), Math.max(0, size - 2), 3); ctx.fill();
        ctx.globalAlpha = 1;
      } else block(value - 1, px(x), py(y), cell);
    }

    const piece = game.active;
    if (piece && !game.over) {
      const cells = SHAPES[piece.type][piece.rot], color = PIECE_COLORS[piece.type];
      if (view.ghost > piece.y) cells.forEach(([cx, cy]) => {
        const gx = px(piece.x + cx), gy = py(view.ghost + cy);
        ctx.fillStyle = mix(color, 0, 0.1); ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.roundRect(gx + 1.5, gy + 1.5, cell - 3, cell - 3, cell * 0.18); ctx.fill();
        ctx.globalAlpha = 0.75; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(gx + 2, gy + 2, cell - 4, cell - 4, cell * 0.18); ctx.stroke(); ctx.globalAlpha = 1;
      });
      cells.forEach(([cx, cy]) => block(piece.type, px(piece.x + cx), py(piece.y + cy), cell));
      // A resting piece brightens as its lock timer runs down, so the player can see how long is left to slide it.
      if (view.lockProgress > 0) {
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.3 * view.lockProgress;
        cells.forEach(([cx, cy]) => { ctx.beginPath(); ctx.roundRect(px(piece.x + cx) + 1, py(piece.y + cy) + 1, cell - 2, cell - 2, cell * 0.2); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
    }

    fx.locks.forEach((lock) => {
      const a = 1 - lock.t / LOCK_MS;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.55 * a * a;
      lock.cells.forEach(([x, y]) => { if (y >= HIDDEN && !clearing?.has(y)) { ctx.beginPath(); ctx.roundRect(px(x) + 1, py(y) + 1, cell - 2, cell - 2, cell * 0.2); ctx.fill(); } });
      ctx.globalAlpha = 1;
    });

    if (view.hint.length && view.hintAlpha > 0) {
      const size = compact ? 14 : 15, lineH = size + 9, startY = well.y + well.h * 0.5 - (view.hint.length * lineH) / 2;
      ctx.globalAlpha = view.hintAlpha;
      view.hint.forEach((line, i) => text(line, well.x + well.w / 2, startY + i * lineH + size, size, '#C9D1E6', 'center', 700));
      ctx.globalAlpha = 1;
    }

    fx.popups.forEach((popup) => {
      const p = popup.t / POPUP_MS, rise = reduced ? 0 : (1 - (1 - p) ** 3) * cell * 1.6;
      const size = clamp(Math.round(cell * 0.82), 17, 30), y = clamp(py(popup.row) - rise, well.y + size + 6, well.y + well.h - size - 12);
      const scale = reduced ? 1 : 1 + 0.35 * Math.max(0, 1 - p * 7);
      ctx.save();
      ctx.globalAlpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
      ctx.translate(well.x + well.w / 2, y); ctx.scale(scale, scale);
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(7,9,22,.9)';
      ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.strokeText(popup.title, 0, 0); ctx.fillStyle = popup.color; ctx.fillText(popup.title, 0, 0);
      if (popup.sub) {
        const small = Math.max(14, Math.round(size * 0.62));
        ctx.font = `800 ${small}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText(popup.sub, 0, small + 5); ctx.fillStyle = INK; ctx.fillText(popup.sub, 0, small + 5);
      }
      ctx.restore();
    });

    if (fx.levelUp > 0) {
      const p = 1 - fx.levelUp / LEVEL_MS, a = p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1;
      const bandH = Math.max(58, cell * 2.6), bandY = well.y + well.h * 0.3 - bandH / 2;
      ctx.globalAlpha = a;
      const band = ctx.createLinearGradient(well.x, 0, well.x + well.w, 0);
      band.addColorStop(0, 'rgba(139,124,255,.0)'); band.addColorStop(0.5, 'rgba(60,48,150,.92)'); band.addColorStop(1, 'rgba(139,124,255,.0)');
      ctx.fillStyle = 'rgba(9,12,28,.72)'; ctx.fillRect(well.x, bandY, well.w, bandH);
      ctx.fillStyle = band; ctx.fillRect(well.x, bandY, well.w, bandH);
      text(`${view.labels.levelUp} ${game.level}`, well.x + well.w / 2, bandY + bandH / 2 + 2, clamp(Math.round(cell * 0.85), 18, 30), INK, 'center', 900);
      text(view.labels.faster, well.x + well.w / 2, bandY + bandH / 2 + 22, 14, '#D5CEFF', 'center', 700);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Frame: accent normally, warm when the stack is near the top, bright during a level-up.
    ctx.lineWidth = 2;
    ctx.strokeStyle = danger > 0 ? mix('#FF5A6E', 60, 1 - danger * 0.9) : glow > 0 ? mix(ACCENT, 255, glow * 0.6) : '#3A3F78';
    ctx.beginPath(); ctx.roundRect(well.x - 2, well.y - 2, well.w + 4, well.h + 4, 8); ctx.stroke();
    ctx.restore();
  }

  return { resize, draw, get layout() { return layout; } };
}
export type Renderer = ReturnType<typeof createRenderer>;
