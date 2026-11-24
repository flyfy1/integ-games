import type { Color, Good, GoodKind, Item, Shape, Stamp } from './types';

/**
 * Goods as short codes. A code is a kind followed by any of its properties in any order:
 *   "paper", "hoop", "candle", "dye red", "shell lotus blue", "lantern round red fu lit", "string red orange yellow".
 * As a want (an order line) a code only checks the properties it names, so "lantern red" takes any red lantern of
 * any shape, "lantern round plain" needs an undyed one, "lantern lit" any lit lantern.
 */
export const KINDS: readonly GoodKind[] = ['paper', 'shell', 'hoop', 'candle', 'dye', 'lantern', 'string'];
export const COLORS: readonly Color[] = ['plain', 'red', 'yellow', 'blue', 'orange', 'green', 'purple', 'muddy'];
export const DYES: readonly Color[] = ['red', 'yellow', 'blue', 'orange', 'green', 'purple'];
export const SHAPES: readonly Shape[] = ['round', 'square', 'lotus'];
export const STAMPS: readonly Stamp[] = ['fish', 'cloud', 'fu'];

const isColor = (t: string): t is Color => (COLORS as readonly string[]).includes(t);
const isShape = (t: string): t is Shape => (SHAPES as readonly string[]).includes(t);
const isStamp = (t: string): t is Stamp => t === 'none' || (STAMPS as readonly string[]).includes(t);

export type Spec = { kind: GoodKind; shape?: Shape; color?: Color; stamp?: Stamp; lit?: boolean; seq?: Color[] };

export function parseSpec(code: string): Spec {
  const [head, ...rest] = code.trim().split(/\s+/);
  if (!(KINDS as readonly string[]).includes(head)) throw new Error(`unknown good: ${code}`);
  const spec: Spec = { kind: head as GoodKind };
  if (spec.kind === 'string') { spec.seq = rest.filter(isColor); return spec; }
  for (const t of rest) {
    if (isColor(t)) spec.color = t;
    else if (isShape(t)) spec.shape = t;
    else if (isStamp(t)) spec.stamp = t;
    else if (t === 'lit') spec.lit = true;
    else if (t === 'unlit') spec.lit = false;
    else throw new Error(`unknown token "${t}" in ${code}`);
  }
  return spec;
}

/** A concrete good from a code: unnamed properties take their natural default (plain, unstamped, unlit). */
export function makeGood(code: string): Good {
  const s = parseSpec(code);
  const g: Good = { kind: s.kind };
  if (s.kind === 'shell' || s.kind === 'lantern') { g.shape = s.shape ?? 'round'; g.color = s.color ?? 'plain'; g.stamp = s.stamp ?? 'none'; }
  if (s.kind === 'lantern') g.lit = s.lit ?? false;
  if (s.kind === 'dye') g.color = s.color ?? 'red';
  if (s.kind === 'string') g.seq = s.seq ?? [];
  return g;
}

const specCache = new Map<string, Spec>();
const cached = (code: string) => { let s = specCache.get(code); if (!s) { s = parseSpec(code); specCache.set(code, s); } return s; };

export function matches(item: Good, code: string): boolean {
  const s = cached(code);
  if (item.kind !== s.kind) return false;
  if (s.shape && item.shape !== s.shape) return false;
  if (s.color && item.color !== s.color) return false;
  if (s.stamp && (item.stamp ?? 'none') !== s.stamp) return false;
  if (s.lit !== undefined && !!item.lit !== s.lit) return false;
  if (s.kind === 'string' && s.seq && s.seq.length) {
    const seq = item.seq ?? [];
    if (seq.length !== s.seq.length || seq.some((c, i) => c !== s.seq![i])) return false;
  }
  return true;
}

/** Dye on dye: primaries mix into secondaries; anything else turns muddy; the same colour stays itself. */
export function mix(a: Color, b: Color): Color {
  if (a === 'plain') return b;
  if (b === 'plain') return a;
  if (a === b) return a;
  const key = [a, b].sort().join('+');
  return ({ 'red+yellow': 'orange', 'blue+red': 'purple', 'blue+yellow': 'green' } as Record<string, Color>)[key] ?? 'muddy';
}

/** Sorter settings: a colour, a shape, "lit", or a kind of good. */
export const FILTERS: readonly string[] = ['red', 'yellow', 'blue', 'orange', 'green', 'purple', 'plain', 'round', 'square', 'lotus', 'lit', 'fu', 'paper', 'shell', 'hoop', 'candle', 'dye', 'lantern'];
export function passesFilter(item: Good, filter: string): boolean {
  if (isColor(filter)) return item.color === filter;
  if (isShape(filter)) return item.shape === filter;
  if (filter === 'lit') return !!item.lit;
  if (isStamp(filter)) return item.stamp === filter;
  return item.kind === filter;
}

export function codeOf(item: Good): string {
  if (item.kind === 'string') return ['string', ...(item.seq ?? [])].join(' ');
  if (item.kind === 'dye') return `dye ${item.color}`;
  if (item.kind === 'shell' || item.kind === 'lantern') {
    const parts: string[] = [item.kind, item.shape ?? 'round', item.color ?? 'plain'];
    if (item.stamp && item.stamp !== 'none') parts.push(item.stamp);
    if (item.lit) parts.push('lit');
    return parts.join(' ');
  }
  return item.kind;
}

export const cloneGood = (g: Good): Good => ({ ...g, seq: g.seq ? [...g.seq] : undefined });
export const asItem = (g: Good, id: number, heading: Item['heading']): Item => ({ ...cloneGood(g), id, heading, still: 0 });
