/**
 * Board geometry. The sim works in columns and lanes; this maps them to stage pixels. Wide stages lay the lanes out
 * left to right (cake on the left); tall phone stages turn the board so lanes run top to bottom (cake at the
 * bottom) and every cell stays a comfortable touch target. Everything that draws or hit-tests goes through here.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Space kept before column 0 for the cake, and after the last column for enemies walking in (in cells). */
export const CAKE_CELLS = 1.3;
export const ENTRY_CELLS = 0.75;

export type BoardLayout = {
  w: number; h: number; vertical: boolean; cols: number; lanes: number;
  /** The grid itself (columns 0..cols, all lanes). */
  board: Rect;
  /** The whole strip including the cake zone and the entry margin. */
  field: Rect;
  /** Size of one cell along the lane and across it, in pixels. */
  along: number; across: number;
  /** Sprite size for a cell (the 100-unit box). */
  unit: number;
  /** Screen position of the lane centre at column coordinate `x`. `lane` may be fractional (boss hops). */
  point(x: number, lane: number): { x: number; y: number };
  /** Where a sprite's feet go for the same spot. */
  feet(x: number, lane: number): { x: number; y: number };
  cellRect(col: number, lane: number): Rect;
  cellAt(px: number, py: number): { col: number; lane: number } | null;
  /** A band along one lane between two column coordinates. */
  laneRect(lane: number, x0: number, x1: number): Rect;
  /** Centre of the cake. */
  cake: { x: number; y: number; r: number };
};

export function computeLayout(w: number, h: number, cols: number, lanes: number, insets: Insets): BoardLayout {
  const areaW = Math.max(60, w - insets.left - insets.right), areaH = Math.max(60, h - insets.top - insets.bottom);
  const vertical = areaH > areaW * 1.05;
  const span = cols + CAKE_CELLS + ENTRY_CELLS;
  let along: number, across: number;
  if (vertical) { along = areaH / span; across = Math.min(areaW / lanes, along * 1.7); along = Math.min(along, across * 1.15); }
  else { along = areaW / span; across = Math.min(areaH / lanes, along * 1.2); along = Math.min(along, across * 1.45); }
  const fieldLong = along * span, fieldShort = across * lanes;
  const field: Rect = vertical
    ? { x: insets.left + (areaW - fieldShort) / 2, y: insets.top + (areaH - fieldLong) / 2, w: fieldShort, h: fieldLong }
    : { x: insets.left + (areaW - fieldLong) / 2, y: insets.top + (areaH - fieldShort) / 2, w: fieldLong, h: fieldShort };
  const board: Rect = vertical
    ? { x: field.x, y: field.y + ENTRY_CELLS * along, w: fieldShort, h: cols * along }
    : { x: field.x + CAKE_CELLS * along, y: field.y, w: cols * along, h: fieldShort };
  const unit = Math.min(along, across) * 0.92;
  const point = (x: number, lane: number) => vertical
    ? { x: board.x + (lane + 0.5) * across, y: board.y + (cols - x) * along }
    : { x: board.x + x * along, y: board.y + (lane + 0.5) * across };
  const feet = (x: number, lane: number) => { const p = point(x, lane); return { x: p.x, y: p.y + (vertical ? along : across) * 0.34 }; };
  const cellRect = (col: number, lane: number): Rect => vertical
    ? { x: board.x + lane * across, y: board.y + (cols - col - 1) * along, w: across, h: along }
    : { x: board.x + col * along, y: board.y + lane * across, w: along, h: across };
  const cellAt = (px: number, py: number) => {
    const col = Math.floor(vertical ? cols - (py - board.y) / along : (px - board.x) / along);
    const lane = Math.floor(vertical ? (px - board.x) / across : (py - board.y) / across);
    return col >= 0 && col < cols && lane >= 0 && lane < lanes ? { col, lane } : null;
  };
  const laneRect = (lane: number, x0: number, x1: number): Rect => vertical
    ? { x: board.x + lane * across, y: board.y + (cols - x1) * along, w: across, h: (x1 - x0) * along }
    : { x: board.x + x0 * along, y: board.y + lane * across, w: (x1 - x0) * along, h: across };
  const cakeCentre = point(-CAKE_CELLS * 0.52, (lanes - 1) / 2);
  return { w, h, vertical, cols, lanes, board, field, along, across, unit, point, feet, cellRect, cellAt, laneRect, cake: { ...cakeCentre, r: Math.min(along * CAKE_CELLS * 0.44, across * 1.2) } };
}
