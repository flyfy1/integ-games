import { COLS, ROWS } from '../types';

/**
 * The one place that maps yard cells to screen pixels. Landscape screens show the yard as 16 x 9 with the nest on the
 * left; portrait phones rotate it a quarter turn so it is 9 wide x 16 tall with the nest at the bottom, near the thumb.
 * Renderer and input both go through here, so a tap always lands on the cell that was drawn under it.
 *
 * Sim coordinates put cell centres on integers (cell 3 is x = 3); board pixels put them at (x + 0.5) * cell.
 */
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Layout = {
  width: number; height: number; pr: number;
  rot: boolean;
  cell: number;
  /** Top-left of the board on screen. */
  ox: number; oy: number;
  /** Board size on screen (after rotation). */
  bw: number; bh: number;
};

export function computeLayout(width: number, height: number, pr: number, insets: Insets): Layout {
  const rot = height > width * 1.12;
  const pad = 6;
  const availW = Math.max(60, width - insets.left - insets.right - pad * 2), availH = Math.max(60, height - insets.top - insets.bottom - pad * 2);
  const across = rot ? ROWS : COLS, down = rot ? COLS : ROWS;
  const cell = Math.max(8, Math.floor(Math.min(availW / across, availH / down) * 4) / 4);
  const bw = cell * across, bh = cell * down;
  const ox = Math.round(insets.left + pad + (availW - bw) / 2), oy = Math.round(insets.top + pad + (availH - bh) / 2);
  return { width, height, pr, rot, cell, ox, oy, bw, bh };
}

/** Sim coordinates to screen pixels. */
export function toScreen(l: Layout, x: number, y: number): { x: number; y: number } {
  if (!l.rot) return { x: l.ox + (x + 0.5) * l.cell, y: l.oy + (y + 0.5) * l.cell };
  return { x: l.ox + (y + 0.5) * l.cell, y: l.oy + (COLS - (x + 0.5)) * l.cell };
}

/** Screen pixels to sim coordinates (fractional). */
export function toGrid(l: Layout, sx: number, sy: number): { x: number; y: number } {
  if (!l.rot) return { x: (sx - l.ox) / l.cell - 0.5, y: (sy - l.oy) / l.cell - 0.5 };
  return { x: COLS - (sy - l.oy) / l.cell - 0.5, y: (sx - l.ox) / l.cell - 0.5 };
}

/** The cell under a screen point, or null when off the board. */
export function cellUnder(l: Layout, sx: number, sy: number): { x: number; y: number } | null {
  const g = toGrid(l, sx, sy);
  const x = Math.round(g.x), y = Math.round(g.y);
  return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
}

/** Set the canvas transform so drawing in board pixels ((x + 0.5) * cell) lands in the right place. */
export function boardTransform(ctx: CanvasRenderingContext2D, l: Layout): void {
  if (!l.rot) ctx.setTransform(l.pr, 0, 0, l.pr, l.ox * l.pr, l.oy * l.pr);
  else ctx.setTransform(0, -l.pr, l.pr, 0, l.ox * l.pr, (l.oy + COLS * l.cell) * l.pr);
}
