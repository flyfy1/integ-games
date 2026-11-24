import { buildRows } from './levels';

/**
 * Ghost of your best ride. It stores where the pelican was (ten samples a second, delta-coded) rather than which
 * buttons were held, so a later physics or level tweak can never make it veer off; a hash of the stage's tiles is
 * kept with it and a ghost recorded on different tiles is simply dropped.
 */
export const GHOST_HZ = 10;
const F_LEFT = 1, F_GLIDE = 2, F_DEAD = 4, F_AIR = 8;

export type GhostPose = { x: number; y: number; dir: number; gliding: boolean; dead: boolean; air: boolean };
export type Ghost = { v: 1; h: string; time: number; d: string; sp: number[] };

/** Stage fingerprint: the tiles plus whether it is the storm remix. */
export function stageHash(lv: number, storm: boolean): string {
  const str = buildRows(lv).join('|') + (storm ? '#storm' : '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export type GhostRecorder = { samples: number[]; splits: number[]; next: number };
export const newRecorder = (): GhostRecorder => ({ samples: [], splits: [], next: 0 });

/** Call every step with the sim time; it takes a sample whenever a tenth of a second has passed. */
export function record(rec: GhostRecorder, time: number, p: { x: number; y: number; dir: number; gliding: boolean; dead: boolean; ground: boolean }) {
  while (time >= rec.next) {
    rec.samples.push(Math.round(p.x), Math.round(p.y), (p.dir < 0 ? F_LEFT : 0) | (p.gliding ? F_GLIDE : 0) | (p.dead ? F_DEAD : 0) | (p.ground ? 0 : F_AIR));
    rec.next += 1 / GHOST_HZ;
  }
}

export function encode(rec: GhostRecorder, hash: string, time: number): Ghost {
  const out: number[] = [];
  let px = 0, py = 0;
  for (let i = 0; i < rec.samples.length; i += 3) {
    out.push(rec.samples[i] - px, rec.samples[i + 1] - py, rec.samples[i + 2]);
    px = rec.samples[i]; py = rec.samples[i + 1];
  }
  return { v: 1, h: hash, time: Math.round(time * 10) / 10, d: out.join(','), sp: rec.splits.map((t) => Math.round(t * 100) / 100) };
}

export type GhostTrack = { xs: Int32Array; ys: Int32Array; fs: Uint8Array; time: number; sp: number[] };

/** Unpack a stored ghost, or null if it is damaged or was recorded on a different version of the stage. */
export function decode(g: unknown, hash: string): GhostTrack | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as Partial<Ghost>;
  if (o.v !== 1 || o.h !== hash || typeof o.d !== 'string' || typeof o.time !== 'number') return null;
  const nums = o.d.split(',').map(Number);
  if (nums.length < 3 || nums.length % 3 !== 0 || nums.some((n) => !Number.isFinite(n))) return null;
  const n = nums.length / 3;
  const xs = new Int32Array(n), ys = new Int32Array(n), fs = new Uint8Array(n);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += nums[i * 3]; y += nums[i * 3 + 1]; xs[i] = x; ys[i] = y; fs[i] = nums[i * 3 + 2]; }
  return { xs, ys, fs, time: o.time, sp: Array.isArray(o.sp) ? o.sp.filter((t) => typeof t === 'number') : [] };
}

/** Where the ghost was at sim time `t` (it waits at its last spot once its ride is over). */
export function poseAt(tr: GhostTrack, t: number): GhostPose {
  const f = Math.max(0, t * GHOST_HZ), i = Math.min(tr.xs.length - 1, Math.floor(f)), j = Math.min(tr.xs.length - 1, i + 1);
  const k = f - Math.floor(f);
  // A respawn is a jump, not a slide: snap instead of gliding across the map.
  const snap = Math.abs(tr.xs[j] - tr.xs[i]) > 200 || Math.abs(tr.ys[j] - tr.ys[i]) > 200;
  const x = snap ? tr.xs[i] : tr.xs[i] + (tr.xs[j] - tr.xs[i]) * k;
  const y = snap ? tr.ys[i] : tr.ys[i] + (tr.ys[j] - tr.ys[i]) * k;
  const fl = tr.fs[i];
  return { x, y, dir: fl & F_LEFT ? -1 : 1, gliding: !!(fl & F_GLIDE), dead: !!(fl & F_DEAD), air: !!(fl & F_AIR) };
}

export const ghostKey = (lv: number, storm: boolean) => `ghost:${storm ? 's' : ''}${lv}`;
