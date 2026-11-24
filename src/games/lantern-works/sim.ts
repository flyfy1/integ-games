import { asItem, makeGood, matches, mix, passesFilter } from './goods';
import { defaultDial, dialOptions } from './parts';
import { nextOrder, ORDER_GAP, MAX_ORDERS, FIRST_ORDER } from './data/nightshift';
import type { Dir, Edit, EditFail, Item, LevelDef, Order, Part, PartKind, SimEvent, SourceDef } from './types';

/**
 * Lantern Works simulation: pure, tick based and fully deterministic. One `step` is one beat.
 *
 * On a beat:
 *  1. Gates count the beat.
 *  2. Every item that sits in a part's output slot tries to move one cell along that part's direction. Moves are
 *     resolved as rounds of proposals: an item may enter a slot that is empty at the start of the round (so a full
 *     line of items moves together over a few rounds). When several items want the same slot, the target cell takes
 *     them in turn by entry side (round robin), so two belts merging zip together. Splitters may then try their other
 *     side. The order of rounds and of items within them depends only on cell positions, never on the order in
 *     which parts were placed.
 *  3. Machines that hold everything they need combine it (joiner, wick, mixer, bundler).
 *  4. Sources emit their goods.
 * Machines that change an item (folder, vat, stamp) do it as the item enters; the item leaves on the next beat.
 * Every working machine reports a `work` event: the audio plays its note, so a running factory plays a tune.
 */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;
export const MAX_ITEMS = 120;
export const SPOIL_AT = 3;

export const enum T { Floor = 0, Pillar = 1, Source = 2, Stall = 3 }

export type Slots = { out: Item | null; out2: Item | null; ins: (Item | null)[]; tank: Item | null; t: number; toggle: number };
export type WantState = { good: string; n: number; got: number };
export type StallState = { x: number; y: number; wants: WantState[]; sequential: boolean; wrong: number; got: number };
export type SourceState = SourceDef & { pending: boolean; k: number };
export type Status = 'build' | 'run' | 'won' | 'spoiled' | 'over';

export type Sim = {
  level: LevelDef;
  w: number; h: number;
  terrain: Uint8Array;
  parts: (Part | null)[];
  slots: Slots[];
  rr: Int8Array;
  stalls: StallState[];
  sources: SourceState[];
  beat: number;
  status: Status;
  wonAt: number | null;
  /** Most player parts on the board at once since Run (the Tidy count). */
  maxParts: number;
  wrong: number;
  nextId: number;
  catBlocked: number;
  // Night Shift
  seed: number;
  rng: () => number;
  orders: Order[];
  served: number;
  delivered: number;
  strikes: number;
  score: number;
  nextOrderAt: number;
  orderSeq: number;
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const emptySlots = (): Slots => ({ out: null, out2: null, ins: [null, null, null], tank: null, t: 99, toggle: 0 });

export function createSim(level: LevelDef, seed = 1): Sim {
  const h = level.grid.length, w = level.grid[0].length;
  const terrain = new Uint8Array(w * h);
  level.grid.forEach((row, y) => [...row].forEach((ch, x) => { terrain[y * w + x] = ch === '#' ? T.Pillar : T.Floor; }));
  for (const s of level.sources) terrain[s.y * w + s.x] = T.Source;
  for (const s of level.stalls) terrain[s.y * w + s.x] = T.Stall;
  const sim: Sim = {
    level, w, h, terrain,
    parts: new Array(w * h).fill(null),
    slots: Array.from({ length: w * h }, emptySlots),
    rr: new Int8Array(w * h).fill(3),
    stalls: [], sources: [],
    beat: 0, status: 'build', wonAt: null, maxParts: 0, wrong: 0, nextId: 1, catBlocked: -1,
    seed, rng: mulberry32(seed), orders: [], served: 0, delivered: 0, strikes: 0, score: 0, nextOrderAt: FIRST_ORDER, orderSeq: 1
  };
  for (const f of level.fixed ?? []) sim.parts[f.y * w + f.x] = { ...f, fixed: true, dial: f.dial ?? defaultDial(f.kind, level) };
  resetRun(sim);
  return sim;
}

/** Clears every good and the beat counter; the build stays. */
export function resetRun(sim: Sim): void {
  sim.slots = sim.slots.map(emptySlots);
  sim.rr.fill(3);
  sim.stalls = sim.level.stalls.map(s => ({ x: s.x, y: s.y, wants: s.wants.map(w => ({ good: w.good, n: w.n, got: 0 })), sequential: !!s.sequential, wrong: 0, got: 0 }));
  sim.sources = sim.level.sources.map(s => ({ ...s, pending: false, k: 0 }));
  sim.beat = 0; sim.status = 'build'; sim.wonAt = null; sim.wrong = 0; sim.nextId = 1; sim.catBlocked = -1;
  sim.rng = mulberry32(sim.seed); sim.orders = []; sim.served = 0; sim.delivered = 0; sim.strikes = 0; sim.score = 0; sim.nextOrderAt = FIRST_ORDER; sim.orderSeq = 1;
  sim.maxParts = partsUsed(sim);
}

export function run(sim: Sim): void {
  if (sim.status === 'build') { sim.status = 'run'; sim.maxParts = partsUsed(sim); }
}

export const inside = (sim: Sim, x: number, y: number) => x >= 0 && y >= 0 && x < sim.w && y < sim.h;
export const partAt = (sim: Sim, x: number, y: number): Part | null => (inside(sim, x, y) ? sim.parts[y * sim.w + x] : null);
export function partsUsed(sim: Sim): number { let n = 0; for (const p of sim.parts) if (p && !p.fixed) n++; return n; }
export function countKind(sim: Sim, kind: PartKind): number { let n = 0; for (const p of sim.parts) if (p && !p.fixed && p.kind === kind) n++; return n; }
export function trayLeft(sim: Sim, kind: PartKind): number { return (sim.level.tray[kind] ?? 0) - countKind(sim, kind); }
export function itemCount(sim: Sim): number {
  let n = 0;
  for (const s of sim.slots) { if (s.out) n++; if (s.out2) n++; if (s.tank) n++; for (const i of s.ins) if (i) n++; }
  return n;
}
/** All goods on the board with the cell they are in (for drawing). */
export function itemsOf(sim: Sim): { item: Item; cell: number; slot: 'out' | 'out2' | 'in' | 'tank'; index: number }[] {
  const all: { item: Item; cell: number; slot: 'out' | 'out2' | 'in' | 'tank'; index: number }[] = [];
  sim.slots.forEach((s, cell) => {
    if (s.out) all.push({ item: s.out, cell, slot: 'out', index: 0 });
    if (s.out2) all.push({ item: s.out2, cell, slot: 'out2', index: 0 });
    if (s.tank) all.push({ item: s.tank, cell, slot: 'tank', index: 0 });
    s.ins.forEach((i, index) => { if (i) all.push({ item: i, cell, slot: 'in', index }); });
  });
  return all;
}

const buildable = (sim: Sim, x: number, y: number) => inside(sim, x, y) && sim.terrain[y * sim.w + x] === T.Floor;

function clearCell(sim: Sim, cell: number, events: SimEvent[] | null, keepOut = false) {
  const s = sim.slots[cell], x = cell % sim.w, y = Math.floor(cell / sim.w);
  const lost = [keepOut ? null : s.out, s.out2, s.tank, ...s.ins].filter((i): i is Item => !!i);
  for (const item of lost) events?.push({ type: 'lost', x, y, item });
  sim.slots[cell] = { ...emptySlots(), out: keepOut ? s.out : null };
}

/** Applies one edit to the build; returns why it could not, or null. Allowed at any time, also while running. */
export function applyEdit(sim: Sim, edit: Edit, events: SimEvent[] | null = null): EditFail | null {
  const { x, y } = edit;
  if (!inside(sim, x, y)) return 'blocked';
  const cell = y * sim.w + x, current = sim.parts[cell];
  if (current?.fixed && edit.op !== 'dial') return 'fixed';
  if (edit.op === 'place') {
    if (!buildable(sim, x, y)) return 'blocked';
    if (sim.level.tray[edit.kind] === undefined) return 'not-in-tray';
    const reuse = current && current.kind === edit.kind;
    if (!reuse && trayLeft(sim, edit.kind) <= 0) return 'none-left';
    const options = dialOptions(edit.kind, sim.level);
    const dial = edit.dial ?? (reuse ? current!.dial : undefined) ?? defaultDial(edit.kind, sim.level);
    if (options.length && dial !== undefined && !options.includes(dial)) return 'bad-dial';
    sim.parts[cell] = { kind: edit.kind, x, y, dir: edit.dir, dial: options.length ? dial : undefined, flip: edit.kind === 'sorter' ? !!edit.flip : undefined };
    // Re-laying a belt keeps what rides on it; anything else replaced loses its contents.
    if (!reuse || edit.kind !== 'belt') clearCell(sim, cell, events, !!reuse && edit.kind === 'belt');
  } else if (edit.op === 'remove') {
    if (!current) return 'empty';
    sim.parts[cell] = null;
    clearCell(sim, cell, events);
  } else if (edit.op === 'rotate') {
    if (!current) return 'empty';
    if (current.kind === 'sorter') {
      if (!current.flip) current.flip = true;
      else { current.flip = false; current.dir = ((current.dir + 1) % 4) as Dir; }
    } else current.dir = ((current.dir + 1) % 4) as Dir;
  } else {
    if (!current) return 'empty';
    const options = dialOptions(current.kind, sim.level);
    if (!options.length) return 'no-dial';
    if (edit.value !== undefined) {
      if (!options.includes(edit.value)) return 'bad-dial';
      current.dial = edit.value;
    } else current.dial = options[(options.indexOf(current.dial ?? options[0]) + 1) % options.length];
  }
  if (sim.status === 'run') sim.maxParts = Math.max(sim.maxParts, partsUsed(sim));
  return null;
}

// ---------------------------------------------------------------- movement

const opposite = (d: number) => ((d + 2) % 4) as Dir;
const left = (d: number) => ((d + 3) % 4) as Dir;
const right = (d: number) => ((d + 1) % 4) as Dir;
const neighbour = (sim: Sim, cell: number, d: number): number => {
  const x = (cell % sim.w) + DX[d], y = Math.floor(cell / sim.w) + DY[d];
  return inside(sim, x, y) ? y * sim.w + x : -1;
};
/** Could anything ever be handed to this cell (a part or a stall)? Splitters skip sides that lead nowhere. */
const leadsSomewhere = (sim: Sim, cell: number) => cell >= 0 && (!!sim.parts[cell] || sim.terrain[cell] === T.Stall);

export function splitterSides(part: Part): [Dir, Dir] { return [left(part.dir), right(part.dir)]; }
export function sorterSide(part: Part): Dir { return part.flip ? right(part.dir) : left(part.dir); }
const vatColor = (part: Part) => (part.dial && part.dial !== 'fed' ? part.dial : null);

type SlotKey = 'out' | 'out2' | 'in0' | 'in1' | 'in2' | 'tank' | 'consume';

function catBlocks(sim: Sim, cell: number): boolean {
  const cat = sim.level.cat;
  if (!cat) return false;
  const phase = sim.beat % cat.period;
  return cat.stops.some(s => s.y * sim.w + s.x === cell && phase >= s.at && phase < s.at + s.for);
}

/** Which slot of `cell` would take `item` travelling in direction `heading`, or null. */
function acceptSlot(sim: Sim, cell: number, item: Item, heading: Dir): SlotKey | null {
  if (cell < 0) return null;
  if (catBlocks(sim, cell)) return null;
  if (sim.terrain[cell] === T.Stall) return 'consume';
  const part = sim.parts[cell];
  if (!part) return null;
  const from = opposite(heading), s = sim.slots[cell];
  switch (part.kind) {
    case 'belt': return part.dir === from || s.out ? null : 'out';
    case 'bridge': return heading % 2 === 0 ? (s.out ? null : 'out') : (s.out2 ? null : 'out2');
    case 'bin': return 'consume';
    case 'splitter': return splitterSides(part).includes(from) || s.out ? null : 'out';
    case 'sorter': return from === part.dir || from === sorterSide(part) || s.out ? null : 'out';
    default: break;
  }
  if (part.dir === from) return null;
  switch (part.kind) {
    case 'vat':
      if (item.kind === 'dye') return s.tank ? null : 'tank';
      if (item.kind === 'shell') return s.out || (!s.tank && !vatColor(part)) ? null : 'out';
      return s.out ? null : 'out';
    case 'joiner':
      if (item.kind === 'shell') return s.ins[0] ? null : 'in0';
      if (item.kind === 'hoop') return s.ins[1] ? null : 'in1';
      return s.out ? null : 'out';
    case 'wick':
      if (item.kind === 'lantern' && !item.lit) return s.ins[0] ? null : 'in0';
      if (item.kind === 'candle') return s.ins[1] ? null : 'in1';
      return s.out ? null : 'out';
    case 'mixer':
      if (item.kind === 'dye') return !s.ins[0] ? 'in0' : !s.ins[1] ? 'in1' : null;
      return s.out ? null : 'out';
    case 'bundler':
      if (item.kind === 'lantern') return !s.ins[0] ? 'in0' : !s.ins[1] ? 'in1' : !s.ins[2] ? 'in2' : null;
      return s.out ? null : 'out';
    default:
      return s.out ? null : 'out';
  }
}

/** Puts an item into a slot, doing whatever the part does on entry. */
function enter(sim: Sim, cell: number, key: SlotKey, item: Item, heading: Dir, events: SimEvent[]) {
  const x = cell % sim.w, y = Math.floor(cell / sim.w);
  item.heading = heading; item.still = 0;
  if (key === 'consume') {
    if (sim.terrain[cell] === T.Stall) deliver(sim, sim.stalls.findIndex(s => s.x === x && s.y === y), item, events);
    else events.push({ type: 'bin', x, y, item });
    return;
  }
  const part = sim.parts[cell]!, s = sim.slots[cell];
  if (key === 'tank') { s.tank = item; return; }
  if (key === 'in0' || key === 'in1' || key === 'in2') { s.ins[+key[2]] = item; return; }
  if (key === 'out2') { s.out2 = item; return; }
  s.out = item;
  if (part.kind === 'folder' && item.kind === 'paper') {
    item.kind = 'shell'; item.shape = (part.dial as Item['shape']) ?? 'round'; item.color = 'plain'; item.stamp = 'none';
    events.push({ type: 'work', part: 'folder', x, y, item, dial: part.dial });
  } else if (part.kind === 'vat' && item.kind === 'shell') {
    const dye = s.tank?.color ?? vatColor(part) as Item['color'];
    item.color = mix(item.color ?? 'plain', dye ?? 'plain');
    s.tank = null;
    events.push({ type: 'work', part: 'vat', x, y, item, dial: dye });
  } else if (part.kind === 'stamp' && item.kind === 'shell') {
    item.stamp = (part.dial as Item['stamp']) ?? 'fu';
    events.push({ type: 'work', part: 'stamp', x, y, item, dial: part.dial });
  }
}

function deliver(sim: Sim, index: number, item: Item, events: SimEvent[]) {
  const stall = sim.stalls[index];
  if (!stall) return;
  const { x, y } = stall;
  if (sim.level.endless) {
    const order = sim.orders.find(o => o.stall === index && o.got < o.n && matches(item, o.good));
    if (!order) { events.push({ type: 'wrong', x, y, item, stall: index }); return; }
    order.got++; sim.delivered++;
    events.push({ type: 'deliver', x, y, item, stall: index, extra: false });
    if (order.got >= order.n) {
      const late = (sim.beat - order.born) / order.patience;
      sim.score += order.value + (late < 0.5 ? Math.round(order.value / 2) : 0);
      sim.served++;
      sim.orders = sim.orders.filter(o => o !== order);
      events.push({ type: 'orderDone', order, stall: index });
    }
    return;
  }
  const open = stall.wants.filter(w => w.got < w.n);
  const active = stall.sequential ? open.slice(0, 1) : open;
  const want = active.find(w => matches(item, w.good));
  if (want) {
    want.got++; stall.got++; sim.delivered++;
    events.push({ type: 'deliver', x, y, item, stall: index, extra: false });
    if (sim.status === 'run' && sim.stalls.every(s => s.wants.every(w => w.got >= w.n))) {
      sim.status = 'won'; sim.wonAt = sim.beat;
      events.push({ type: 'won', beat: sim.beat });
    }
    return;
  }
  // Something the stall already has enough of (or will want later in a sequence that has moved on) is taken quietly.
  const idx = stall.wants.findIndex(w => matches(item, w.good));
  const firstOpen = stall.wants.findIndex(w => w.got < w.n);
  if (idx >= 0 && (!stall.sequential || firstOpen < 0 || idx < firstOpen)) { events.push({ type: 'deliver', x, y, item, stall: index, extra: true }); return; }
  stall.wrong++; sim.wrong++;
  events.push({ type: 'wrong', x, y, item, stall: index });
  if (sim.status === 'run' && sim.wrong >= SPOIL_AT) { sim.status = 'spoiled'; events.push({ type: 'spoiled', beat: sim.beat }); }
}

/** Something that wants to move this beat: a good in an output slot, or a chute about to emit (`src`). */
type Mover = { cell: number; key: 'out' | 'out2' | 'src'; done: boolean; src?: SourceState; item?: Item };
const moverItem = (sim: Sim, m: Mover): Item => (m.key === 'src' ? m.item! : sim.slots[m.cell][m.key]!);

/** Where the item in this output slot wants to go: [direction] in order of preference. */
function wishes(sim: Sim, m: Mover): Dir[] {
  if (m.src) return [m.src.dir];
  const part = sim.parts[m.cell];
  const item = moverItem(sim, m);
  if (!part) return [];
  switch (part.kind) {
    case 'belt': return [part.dir];
    case 'bridge': return [item.heading];
    case 'splitter': {
      const sides = splitterSides(part).filter(d => leadsSomewhere(sim, neighbour(sim, m.cell, d)));
      if (sides.length < 2) return sides;
      const first = splitterSides(part)[sim.slots[m.cell].toggle];
      return [first, first === sides[0] ? sides[1] : sides[0]];
    }
    case 'sorter': return [passesFilter(item, part.dial ?? '') ? sorterSide(part) : part.dir];
    case 'gate': return sim.slots[m.cell].t >= Number(part.dial ?? 2) ? [part.dir] : [];
    default: return [part.dir];
  }
}

function resolveMoves(sim: Sim, movers: Mover[], events: SimEvent[]) {
  for (let guard = 0; guard < 400; guard++) {
    let moved = false;
    for (const choice of [0, 1]) {
      const proposals = new Map<string, { m: Mover; target: number; key: SlotKey; heading: Dir; from: Dir }[]>();
      for (const m of movers) {
        if (m.done) continue;
        const wish = wishes(sim, m);
        const heading = wish[choice];
        if (heading === undefined) continue;
        const target = neighbour(sim, m.cell, heading);
        const item = moverItem(sim, m);
        const key = acceptSlot(sim, target, item, heading);
        if (!key) continue;
        const id = key === 'consume' ? `c${m.cell}` : `${target}:${key}`;
        const list = proposals.get(id) ?? [];
        list.push({ m, target, key, heading, from: opposite(heading) });
        proposals.set(id, list);
      }
      for (const list of proposals.values()) {
        let pick = list[0];
        if (list.length > 1) {
          const last = sim.rr[pick.target];
          pick = [1, 2, 3, 4].map(k => list.find(p => p.from === (last + k) % 4)).find(Boolean)!;
        }
        const { m, target, key, heading } = pick;
        const item = moverItem(sim, m);
        m.done = true;
        if (m.src) {
          item.id = sim.nextId++; m.src.k++; m.src.pending = false;
          events.push({ type: 'emit', x: m.src.x, y: m.src.y, item });
          if (key !== 'consume') sim.rr[target] = pick.from;
          enter(sim, target, key, item, heading, events);
          moved = true;
          continue;
        }
        sim.slots[m.cell][m.key as 'out' | 'out2'] = null;
        const part = sim.parts[m.cell]!;
        if (part.kind === 'splitter') {
          const sides = splitterSides(part);
          sim.slots[m.cell].toggle = heading === sides[0] ? 1 : 0;
          events.push({ type: 'route', part: 'splitter', x: m.cell % sim.w, y: Math.floor(m.cell / sim.w), side: heading });
        } else if (part.kind === 'sorter' && heading !== part.dir) {
          events.push({ type: 'route', part: 'sorter', x: m.cell % sim.w, y: Math.floor(m.cell / sim.w), side: heading });
        } else if (part.kind === 'gate') {
          sim.slots[m.cell].t = 0;
          events.push({ type: 'work', part: 'gate', x: m.cell % sim.w, y: Math.floor(m.cell / sim.w), item, dial: part.dial });
        }
        if (key !== 'consume') sim.rr[target] = pick.from;
        enter(sim, target, key, item, heading, events);
        moved = true;
      }
      // Only try a splitter's other side once nothing else can move on its first choice.
      if (moved) break;
    }
    if (!moved) return;
  }
}

function combine(sim: Sim, events: SimEvent[]) {
  sim.parts.forEach((part, cell) => {
    if (!part) return;
    const s = sim.slots[cell], x = cell % sim.w, y = Math.floor(cell / sim.w);
    if (s.out) return;
    let made: Item | null = null;
    if (part.kind === 'joiner' && s.ins[0] && s.ins[1]) {
      const shell = s.ins[0];
      made = { id: shell.id, kind: 'lantern', shape: shell.shape, color: shell.color, stamp: shell.stamp, lit: false, heading: part.dir, still: 0 };
      s.ins[0] = null; s.ins[1] = null;
    } else if (part.kind === 'wick' && s.ins[0] && s.ins[1]) {
      made = { ...s.ins[0], lit: true, heading: part.dir, still: 0 };
      s.ins[0] = null; s.ins[1] = null;
    } else if (part.kind === 'mixer' && s.ins[0] && s.ins[1]) {
      made = { id: s.ins[0].id, kind: 'dye', color: mix(s.ins[0].color ?? 'red', s.ins[1].color ?? 'red'), heading: part.dir, still: 0 };
      s.ins[0] = null; s.ins[1] = null;
    } else if (part.kind === 'bundler' && s.ins[0] && s.ins[1] && s.ins[2]) {
      made = { id: s.ins[0].id, kind: 'string', seq: s.ins.map(i => i!.color ?? 'plain'), heading: part.dir, still: 0 };
      s.ins = [null, null, null];
    }
    if (made) { s.out = made; events.push({ type: 'work', part: part.kind, x, y, item: made }); }
  });
}

/** Chutes due to emit join the beat's movers, so a chute feeding a busy belt takes its turn like any merge. */
function chuteMovers(sim: Sim): Mover[] {
  const movers: Mover[] = [];
  let count = itemCount(sim);
  for (const src of sim.sources) {
    const offset = src.offset ?? 1;
    if (sim.beat >= offset && (sim.beat - offset) % src.every === 0) src.pending = true;
    if (!src.pending || count >= MAX_ITEMS) continue;
    count++;
    movers.push({ cell: src.y * sim.w + src.x, key: 'src', done: false, src, item: asItem(makeGood(src.goods[src.k % src.goods.length]), -1, src.dir) });
  }
  return movers;
}

function runOrders(sim: Sim, events: SimEvent[]) {
  for (const order of [...sim.orders]) {
    if (sim.beat - order.born > order.patience) {
      sim.orders = sim.orders.filter(o => o !== order);
      sim.strikes++;
      events.push({ type: 'orderExpired', order });
    }
  }
  if (sim.strikes >= 3) { sim.status = 'over'; events.push({ type: 'shiftOver', beat: sim.beat, score: sim.score }); return; }
  if (sim.beat >= sim.nextOrderAt && sim.orders.length < MAX_ORDERS) {
    const busy = sim.stalls.map((_, i) => sim.orders.filter(o => o.stall === i).length);
    const stall = busy.indexOf(Math.min(...busy));
    const order = nextOrder(sim.rng, sim.served + sim.orders.length, sim.beat, sim.orderSeq++, stall);
    sim.orders.push(order);
    sim.nextOrderAt = sim.beat + ORDER_GAP(sim.served);
    events.push({ type: 'orderNew', order });
  }
}

/** Advances one beat. Does nothing unless the factory is running (it keeps playing after a win). */
export function step(sim: Sim): SimEvent[] {
  if (sim.status !== 'run' && sim.status !== 'won') return [];
  const events: SimEvent[] = [];
  sim.beat++;
  const cat = sim.level.cat;
  if (cat) {
    const phase = sim.beat % cat.period;
    for (const s of cat.stops) if (phase === s.at) events.push({ type: 'catSit', x: s.x, y: s.y });
  }
  sim.parts.forEach((part, cell) => { if (part?.kind === 'gate') sim.slots[cell].t = Math.min(99, sim.slots[cell].t + 1); });
  const movers: Mover[] = [];
  sim.slots.forEach((s, cell) => {
    if (s.out && sim.parts[cell]) movers.push({ cell, key: 'out', done: false });
    if (s.out2 && sim.parts[cell]) movers.push({ cell, key: 'out2', done: false });
  });
  movers.push(...chuteMovers(sim));
  resolveMoves(sim, movers, events);
  for (const m of movers) {
    if (m.done || m.src) continue;
    const item = sim.slots[m.cell][m.key as 'out' | 'out2'];
    if (!item) continue;
    item.still++;
    if (item.still === 4) events.push({ type: 'jam', x: m.cell % sim.w, y: Math.floor(m.cell / sim.w) });
  }
  combine(sim, events);
  if (sim.level.endless && sim.status === 'run') runOrders(sim, events);
  return events;
}

/** Whole-board snapshot of the build, for saves and undo. */
export function buildOf(sim: Sim): Part[] { return sim.parts.filter((p): p is Part => !!p && !p.fixed).map(p => ({ ...p })); }
export function loadBuild(sim: Sim, parts: Part[]): void {
  // Only cells that differ are touched, so undo while the factory runs keeps every good that is not in the way.
  const want = new Map(parts.map(p => [p.y * sim.w + p.x, p]));
  const same = (a: Part, b: Part) => a.kind === b.kind && a.dir === b.dir && a.dial === b.dial && !!a.flip === !!b.flip;
  sim.parts.forEach((cur, cell) => {
    if (!cur || cur.fixed) return;
    const target = want.get(cell);
    if (!target || target.kind !== cur.kind) applyEdit(sim, { op: 'remove', x: cur.x, y: cur.y });
  });
  for (const [cell, p] of want) {
    const cur = sim.parts[cell];
    if (cur?.fixed || (cur && same(cur, p))) continue;
    applyEdit(sim, { op: 'place', kind: p.kind, x: p.x, y: p.y, dir: p.dir, dial: p.dial, flip: p.flip });
  }
}

export type Stars = { delivered: boolean; tidy: boolean; swift: boolean };
export function starsOf(sim: Sim): Stars {
  const won = sim.wonAt !== null;
  return { delivered: won, tidy: won && sim.maxParts <= sim.level.parTidy, swift: won && sim.wonAt! <= sim.level.parSwift };
}
