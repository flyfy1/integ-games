import { mtof, type Owner, type Synth } from './synth';

/**
 * Midnight Kitchen sound effects, all synthesised. Names are the facade's public `SfxName`s; options pick the
 * variant (which defender, which damage material, which character's voice...). Every recipe returns its duration.
 * Levels are deliberately low: the bus places effects under the music, and frequent sounds are short and quiet.
 */
export type SfxName =
  | 'ui' | 'back' | 'deny' | 'select' | 'place' | 'upgrade' | 'remove' | 'heat' | 'cardReady'
  | 'shoot' | 'lob' | 'melee' | 'burst' | 'steam' | 'laneFire' | 'trap'
  | 'hit' | 'shieldHit' | 'shieldBreak' | 'splash' | 'enemyDown' | 'bossDown'
  | 'bite' | 'defenderDown' | 'stun' | 'mold' | 'burrow' | 'steal' | 'recovered'
  | 'slice' | 'sliceRestored' | 'telegraph' | 'waveStart' | 'finalWave' | 'recipe' | 'recipeNew'
  | 'bossPhase' | 'bossAttack' | 'win' | 'lose' | 'star' | 'buy' | 'unlock' | 'dialogue' | 'bark'
  // added by the audio pass
  | 'bossArrive' | 'wavesDone' | 'status' | 'blip' | 'emerge' | 'event'
  | 'warn' | 'hazard' | 'push' | 'flare' | 'cleanse' | 'chill' | 'remembered' | 'modifier' | 'polish';

export type SfxOptions = {
  /** Defender or enemy id (picks the per-defender attack, placement material or death sound). */
  def?: string;
  /** Damage tag / material (`hit`, `splash`) or status kind (`status`) or boss attack kind (`bossAttack`). */
  tag?: string;
  /** Speaker id for `blip`, `bark`, `dialogue`. */
  voice?: string;
  /** Position in a chain: heat ladder step, star number, upgrade tier, boss phase. */
  index?: number;
  /** Recipe id (`recipe`, `recipeNew`). */
  recipe?: string;
  /** Recipe family when no id is known: warm | spicy | sweet | cool. */
  family?: string;
};

export type SfxMeta = {
  /** Minimum seconds between two plays of the same name+variant. */
  gap: number;
  /** 0 = frequent/expendable, 1 = normal, 2 = important (may steal a voice, never dropped for budget). */
  prio: 0 | 1 | 2;
  /** Max simultaneous instances of this name. */
  max: number;
  bus: 'sfx' | 'ui';
  /** Duck the music to this level for `duck[1]` seconds. */
  duck?: [number, number];
};

type Ctx = { s: Synth; o: Owner; d: AudioNode; t: number; opts: SfxOptions; r: () => number; vary: number };
type Recipe = (c: Ctx) => number;

// ------------------------------------------------------------------ building blocks

const bell = (c: Ctx, f: number, at: number, vel: number, len = 0.6) => {
  c.s.tone(c.o, c.d, { freq: f, t: c.t + at, dur: len, vel, attack: 0.002 });
  c.s.tone(c.o, c.d, { freq: f * 2.76, t: c.t + at, dur: len * 0.3, vel: vel * 0.18, attack: 0.001 });
  return at + len;
};
const pling = (c: Ctx, f: number, at: number, vel: number, len = 0.3) => {
  c.s.tone(c.o, c.d, { freq: f, t: c.t + at, dur: len, vel, attack: 0.002 });
  c.s.tone(c.o, c.d, { freq: f * 2, t: c.t + at, dur: len * 0.4, vel: vel * 0.3, attack: 0.001 });
  return at + len;
};
const thump = (c: Ctx, f: number, to: number, len: number, vel: number, at = 0) => c.s.tone(c.o, c.d, { freq: f * c.vary, to: to * c.vary, glide: len * 0.8, t: c.t + at, dur: len, vel, attack: 0.002 }) - c.t;
const noise = (c: Ctx, type: BiquadFilterType, freq: number, len: number, vel: number, at = 0, extra: { to?: number; q?: number; attack?: number; trem?: [number, number] } = {}) =>
  c.s.noiseHit(c.o, c.d, { t: c.t + at, dur: len, vel, attack: extra.attack, trem: extra.trem, filter: { type, freq: freq * c.vary, to: extra.to, q: extra.q } }) - c.t;

const PENTA = [0, 2, 4, 7, 9];
/** F major pentatonic ladder from F5: the Heat pickup climbs it when chained. */
const ladder = (i: number) => mtof(77 + PENTA[i % 5] + 12 * Math.floor(i / 5));

// ------------------------------------------------------------------ materials and voices

const MATERIAL: Record<string, 'wood' | 'metal' | 'glass' | 'soft' | 'shell' | 'ice'> = {
  burner: 'metal', kettle: 'metal', toaster: 'metal', whisk: 'metal', ricecooker: 'metal',
  pepper: 'wood', salt: 'glass', honey: 'glass', dough: 'soft', onion: 'soft', garlic: 'soft', chili: 'soft',
  egg: 'shell', ice: 'ice'
};

const placeThunk: Recipe = c => {
  const m = MATERIAL[c.opts.def ?? ''] ?? 'wood';
  let end = thump(c, m === 'soft' ? 150 : 190, m === 'soft' ? 85 : 110, 0.14, 0.16);
  if (m === 'wood') end = Math.max(end, noise(c, 'bandpass', 900, 0.05, 0.06, 0, { q: 2 }));
  if (m === 'metal') { end = Math.max(end, pling(c, 1250 * c.vary, 0, 0.035, 0.3), pling(c, 1870 * c.vary, 0.004, 0.015, 0.2)); }
  if (m === 'glass') end = Math.max(end, pling(c, 2300 * c.vary, 0, 0.03, 0.22));
  if (m === 'soft') end = Math.max(end, noise(c, 'lowpass', 520, 0.09, 0.08));
  if (m === 'shell') end = Math.max(end, noise(c, 'bandpass', 2600, 0.03, 0.05, 0, { q: 3 }));
  if (m === 'ice') end = Math.max(end, pling(c, 2900 * c.vary, 0, 0.03, 0.25), pling(c, 3900 * c.vary, 0.03, 0.012, 0.2));
  return end;
};

/** Character voices for the typewriter: [base Hz, waveform, lowpass Hz]. */
const VOICES: Record<string, [number, OscillatorType, number]> = {
  pip: [620, 'sine', 4000], ladle: [330, 'triangle', 2500], grind: [200, 'square', 900], bun: [440, 'sine', 3000],
  shelly: [560, 'triangle', 3000], frost: [990, 'sine', 6000], scout: [760, 'square', 1800], queen: [300, 'sawtooth', 1200],
  drainking: [150, 'sawtooth', 650], greasegolem: [110, 'square', 520], baron: [360, 'square', 1400],
  bloom: [250, 'sine', 1500], granny: [300, 'sine', 2200], stew: [280, 'triangle', 1800]
};
const voiceOf = (id = ''): [number, OscillatorType, number] => {
  if (VOICES[id]) return VOICES[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [300 + (h % 400), 'sine', 3000];
};
const blip = (c: Ctx, at = 0) => {
  const [base, type, lp] = voiceOf(c.opts.voice);
  const f = base * Math.pow(2, PENTA[Math.floor(c.r() * 4)] / 12);
  c.s.tone(c.o, c.d, { type, freq: f, to: f * (0.94 + c.r() * 0.12), glide: 0.05, t: c.t + at, dur: 0.055, vel: type === 'sine' ? 0.03 : 0.018, attack: 0.004, filter: { type: 'lowpass', freq: lp } });
  if (c.opts.voice === 'bloom') noise(c, 'bandpass', 900, 0.06, 0.012, at, { q: 1 });
  return at + 0.06;
};

/** Recipe families: what the dish tastes like decides its little arpeggio. */
const FAMILY_ARP: Record<string, { notes: number[]; voice: 'bell' | 'pluck' | 'box' | 'glass' }> = {
  warm: { notes: [65, 69, 72, 77], voice: 'bell' },
  spicy: { notes: [62, 65, 67, 69, 74], voice: 'pluck' },
  sweet: { notes: [72, 76, 79, 84], voice: 'box' },
  cool: { notes: [77, 81, 83, 88], voice: 'glass' }
};
const recipeArp = (c: Ctx, scale = 1) => {
  const fam = FAMILY_ARP[c.opts.family ?? ''] ?? FAMILY_ARP.warm;
  let end = 0;
  fam.notes.forEach((n, i) => {
    const f = mtof(n), at = i * 0.07 * scale;
    if (fam.voice === 'pluck') end = Math.max(end, c.s.tone(c.o, c.d, { type: 'triangle', freq: f, t: c.t + at, dur: 0.25, vel: 0.07, filter: { type: 'lowpass', freq: f * 6, to: f * 1.5, sweep: 0.2 } }) - c.t);
    else if (fam.voice === 'glass') { end = Math.max(end, pling(c, f, at, 0.04, 0.5)); c.s.tone(c.o, c.d, { freq: f * 2.005, t: c.t + at, dur: 0.4, vel: 0.012 }); }
    else if (fam.voice === 'box') end = Math.max(end, pling(c, f, at, 0.05, 0.45));
    else end = Math.max(end, bell(c, f, at, 0.05, 0.5));
  });
  return end;
};

// ------------------------------------------------------------------ per-defender attacks

const ATTACKS: Record<string, Recipe> = {
  pepper: c => Math.max(noise(c, 'bandpass', 2600, 0.04, 0.07, 0, { q: 1.5 }), thump(c, 900, 500, 0.035, 0.025)),
  ice: c => Math.max(pling(c, 2093 * c.vary, 0, 0.03, 0.25), pling(c, 3136 * c.vary, 0.012, 0.012, 0.15)),
  egg: c => Math.max(thump(c, 320, 540, 0.1, 0.06), noise(c, 'lowpass', 900, 0.12, 0.015, 0, { attack: 0.04 })),
  whisk: c => c.s.tone(c.o, c.d, { type: 'sawtooth', freq: 160 * c.vary, to: 330 * c.vary, t: c.t, dur: 0.17, vel: 0.09, attack: 0.02, filter: { type: 'bandpass', freq: 1300, q: 2 }, trem: [38, 0.7] }) - c.t,
  kettle: c => Math.max(noise(c, 'highpass', 3600, 0.3, 0.035, 0, { attack: 0.03 }), c.s.tone(c.o, c.d, { freq: 2350 * c.vary, t: c.t, dur: 0.25, vel: 0.008, attack: 0.05, trem: [7, 0.4] }) - c.t),
  toaster: c => Math.max(thump(c, 420, 980, 0.07, 0.07), noise(c, 'bandpass', 3000, 0.02, 0.04, 0, { q: 2 }), c.s.tone(c.o, c.d, { type: 'triangle', freq: 300, to: 430, t: c.t + 0.05, dur: 0.12, vel: 0.015 }) - c.t),
  salt: c => Math.max(noise(c, 'bandpass', 7000, 0.03, 0.03, 0, { q: 1 }), noise(c, 'bandpass', 7400, 0.03, 0.025, 0.045, { q: 1 }), noise(c, 'bandpass', 6800, 0.03, 0.02, 0.09, { q: 1 })),
  garlic: c => Math.max(noise(c, 'lowpass', 750, 0.26, 0.06, 0, { to: 280, attack: 0.03 }), thump(c, 140, 100, 0.2, 0.035)),
  onion: c => Math.max(noise(c, 'bandpass', 900, 0.3, 0.06, 0, { to: 380, q: 1 }), c.s.tone(c.o, c.d, { freq: 330 * c.vary, to: 250, t: c.t, dur: 0.3, vel: 0.025, trem: [11, 0.5] }) - c.t),
  honey: c => Math.max(thump(c, 260, 140, 0.14, 0.05), thump(c, 210, 120, 0.12, 0.035, 0.08)),
  chili: c => noise(c, 'highpass', 4500, 0.25, 0.025, 0, { attack: 0.05, trem: [30, 0.6] }),
  ricecooker: c => Math.max(noise(c, 'highpass', 2500, 0.2, 0.02, 0, { attack: 0.04 }), pling(c, 523, 0, 0.03, 0.4)),
  burner: c => noise(c, 'lowpass', 600, 0.2, 0.03, 0, { attack: 0.05 })
};
/** Attack kind -> the defender whose sound stands in for unknown defenders with that kind. */
export const KIND_ATTACK: Record<string, string> = { shoot: 'pepper', lob: 'egg', melee: 'whisk', burst: 'onion', cone: 'kettle', lanefire: 'chili', trap: 'honey', stink: 'garlic', aura: 'ricecooker', generate: 'burner' };
const attack = (fallback: string): Recipe => c => (ATTACKS[c.opts.def ?? ''] ?? ATTACKS[KIND_ATTACK[c.opts.tag ?? ''] ?? fallback] ?? ATTACKS[fallback])(c);

// ------------------------------------------------------------------ hits and deaths

const HITS: Record<string, Recipe> = {
  tick: c => Math.max(thump(c, 1300, 1100, 0.025, 0.02), noise(c, 'bandpass', 2500, 0.02, 0.015, 0, { q: 2 })),
  egg: c => Math.max(noise(c, 'lowpass', 1200, 0.1, 0.04, 0, { to: 400 }), thump(c, 200, 120, 0.06, 0.025)),
  ice: c => pling(c, 2600 * c.vary, 0, 0.018, 0.09),
  fire: c => Math.max(noise(c, 'bandpass', 1800, 0.05, 0.05, 0, { q: 2 }), noise(c, 'bandpass', 2400, 0.04, 0.035, 0.04, { q: 2 })),
  gas: c => noise(c, 'lowpass', 700, 0.09, 0.05),
  honey: c => thump(c, 300, 180, 0.07, 0.03),
  steam: c => noise(c, 'highpass', 3500, 0.07, 0.028),
  salt: c => noise(c, 'bandpass', 6500, 0.03, 0.02, 0, { q: 2 })
};
const hitByTag = (c: Ctx) => (HITS[c.opts.tag ?? ''] ?? HITS.tick)(c);

const DEATHS: Record<string, Recipe> = {
  pop: c => Math.max(thump(c, 820, 260, 0.08, 0.06), noise(c, 'bandpass', 1500, 0.03, 0.02, 0, { q: 2 })),
  ant: c => DEATHS.pop(c),
  shieldant: c => { c.vary *= 0.8; return DEATHS.pop(c); },
  weevil: c => { c.vary *= 0.9; return Math.max(DEATHS.pop(c), noise(c, 'bandpass', 1800, 0.05, 0.03, 0.02, { q: 1 })); },
  fruitfly: c => thump(c, 1500, 700, 0.05, 0.035),
  roach: c => Math.max(noise(c, 'bandpass', 1800, 0.06, 0.06, 0, { q: 1 }), thump(c, 300, 120, 0.06, 0.045)),
  slug: c => Math.max(noise(c, 'lowpass', 900, 0.16, 0.05, 0, { to: 250 }), c.s.tone(c.o, c.d, { freq: 220 * c.vary, to: 110, t: c.t, dur: 0.16, vel: 0.03, trem: [14, 0.5] }) - c.t),
  spore: c => noise(c, 'lowpass', 1400, 0.18, 0.045, 0, { to: 500, attack: 0.02 }),
  mouse: c => c.s.tone(c.o, c.d, { freq: 1600 * c.vary, to: 900, t: c.t, dur: 0.13, vel: 0.03, trem: [18, 0.4] }) - c.t,
  moth: c => noise(c, 'bandpass', 900, 0.18, 0.045, 0, { trem: [22, 0.8], q: 1 }),
  brute: c => Math.max(thump(c, 140, 55, 0.26, 0.13), noise(c, 'lowpass', 500, 0.15, 0.06))
};

// ------------------------------------------------------------------ board hazards and boss moves

const water = (c: Ctx, len: number, vel: number) => Math.max(noise(c, 'bandpass', 700, len, vel, 0, { to: 1800, q: 0.8, attack: len * 0.3 }), noise(c, 'lowpass', 400, len, vel * 0.8, 0.05, { attack: len * 0.4 }));
const dripSound = (c: Ctx, at = 0) => Math.max(c.s.tone(c.o, c.d, { freq: 900 * c.vary, to: 1700 * c.vary, glide: 0.05, t: c.t + at, dur: 0.12, vel: 0.05 }) - c.t, pling(c, 1400 * c.vary, at + 0.04, 0.012, 0.15));
const whoomp = (c: Ctx, vel: number) => Math.max(noise(c, 'lowpass', 300, 0.5, vel, 0, { to: 2400, attack: 0.06 }), thump(c, 100, 60, 0.35, vel * 0.8));
const splats = (c: Ctx, n: number) => { let e = 0; for (let i = 0; i < n; i++) e = Math.max(e, noise(c, 'lowpass', 1100, 0.09, 0.04, i * 0.07 + c.r() * 0.03, { to: 350 })); return e; };
const frostCrackle = (c: Ctx) => Math.max(pling(c, 2800 * c.vary, 0, 0.02, 0.2), pling(c, 3500 * c.vary, 0.05, 0.015, 0.2), noise(c, 'highpass', 6000, 0.25, 0.015, 0, { trem: [30, 0.8] }));

const HAZARDS: Record<string, Recipe> = {
  drip: c => dripSound(c),
  hobOn: c => Math.max(noise(c, 'bandpass', 1500, 0.08, 0.04, 0, { q: 4 }), whoomp(c, 0.05)),
  hobOff: c => noise(c, 'lowpass', 1500, 0.3, 0.025, 0, { to: 300 }),
  flood: c => water(c, 0.9, 0.06),
  dry: c => noise(c, 'highpass', 2500, 0.5, 0.012, 0, { attack: 0.2 }),
  lightsOut: c => Math.max(thump(c, 300, 120, 0.12, 0.05), c.s.tone(c.o, c.d, { type: 'triangle', freq: 523, to: 262, t: c.t + 0.05, dur: 0.5, vel: 0.025, filter: { type: 'lowpass', freq: 1200 } }) - c.t),
  lightsOn: c => Math.max(thump(c, 1200, 1100, 0.02, 0.04), pling(c, 784, 0.03, 0.02, 0.3), pling(c, 1047, 0.08, 0.02, 0.35)),
  moldSpread: c => noise(c, 'lowpass', 450, 0.4, 0.035, 0, { attack: 0.15 }),
  coldSnap: c => frostCrackle(c),
  sporeRain: c => { let e = 0; for (let i = 0; i < 4; i++) e = Math.max(e, noise(c, 'lowpass', 1200, 0.15, 0.025, i * 0.09, { to: 500, attack: 0.02 })); return e; },
  splatter: c => splats(c, 3)
};
const BOSS_MOVES: Record<string, Recipe> = {
  summon: c => { let e = 0; for (let i = 0; i < 5; i++) e = Math.max(e, thump(c, 1800 + c.r() * 900, 1500, 0.025, 0.02, i * 0.05)); return e; },
  toss: c => Math.max(c.s.tone(c.o, c.d, { freq: 1800, to: 600, t: c.t, dur: 0.35, vel: 0.025 }) - c.t, thump(c, 160, 60, 0.2, 0.1, 0.35)),
  hop: c => Math.max(thump(c, 200, 60, 0.3, 0.12), noise(c, 'lowpass', 400, 0.2, 0.05)),
  dive: c => Math.max(water(c, 0.5, 0.05), thump(c, 180, 50, 0.3, 0.08)),
  flood: c => water(c, 1.1, 0.08),
  splatter: c => splats(c, 4),
  breath: c => noise(c, 'bandpass', 600, 0.9, 0.07, 0, { to: 1600, q: 0.7, attack: 0.25 }),
  lightsOut: c => HAZARDS.lightsOut(c),
  sporeRain: c => HAZARDS.sporeRain(c),
  rally: c => Math.max(noise(c, 'lowpass', 300, 0.5, 0.06, 0, { to: 900, attack: 0.1 }), c.s.tone(c.o, c.d, { type: 'square', freq: 120, to: 240, t: c.t, dur: 0.5, vel: 0.015, filter: { type: 'lowpass', freq: 800 }, trem: [16, 0.6] }) - c.t)
};

// ------------------------------------------------------------------ the table

const SFX: Record<SfxName, [SfxMeta, Recipe]> = {
  ui: [{ gap: 0.04, prio: 1, max: 2, bus: 'ui' }, c => Math.max(thump(c, 1050, 1000, 0.035, 0.075), noise(c, 'bandpass', 3000, 0.015, 0.03, 0, { q: 2 }))],
  back: [{ gap: 0.04, prio: 1, max: 2, bus: 'ui' }, c => Math.max(thump(c, 760, 700, 0.04, 0.075), noise(c, 'bandpass', 2200, 0.015, 0.03, 0, { q: 2 }))],
  select: [{ gap: 0.04, prio: 1, max: 2, bus: 'ui' }, c => thump(c, 1320, 1300, 0.035, 0.065)],
  deny: [{ gap: 0.25, prio: 1, max: 1, bus: 'ui' }, c => Math.max(thump(c, 240, 200, 0.09, 0.06), thump(c, 220, 180, 0.1, 0.05, 0.1))],
  place: [{ gap: 0.05, prio: 1, max: 2, bus: 'sfx' }, placeThunk],
  upgrade: [{ gap: 0.1, prio: 1, max: 2, bus: 'sfx' }, c => {
    const k = 1 + 0.12 * Math.max(0, (c.opts.index ?? 2) - 2);
    let end = 0;
    [880, 1109, 1319].forEach((f, i) => { end = Math.max(end, pling(c, f * k, i * 0.06, 0.045, 0.35)); });
    return Math.max(end, noise(c, 'highpass', 8000, 0.25, 0.012, 0.1, { attack: 0.05 }));
  }],
  remove: [{ gap: 0.1, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(noise(c, 'bandpass', 2500, 0.16, 0.045, 0, { to: 900, q: 1.5 }), thump(c, 400, 250, 0.06, 0.035, 0.12))],
  heat: [{ gap: 0.1, prio: 0, max: 3, bus: 'sfx' }, c => pling(c, ladder(c.opts.index ?? 0), 0, 0.035, 0.3)],
  cardReady: [{ gap: 0.4, prio: 0, max: 1, bus: 'ui' }, c => pling(c, 1760, 0, 0.012, 0.06)],
  shoot: [{ gap: 0.09, prio: 0, max: 3, bus: 'sfx' }, attack('pepper')],
  lob: [{ gap: 0.14, prio: 0, max: 2, bus: 'sfx' }, attack('egg')],
  melee: [{ gap: 0.2, prio: 0, max: 2, bus: 'sfx' }, attack('whisk')],
  burst: [{ gap: 0.2, prio: 0, max: 2, bus: 'sfx' }, attack('onion')],
  steam: [{ gap: 0.25, prio: 0, max: 2, bus: 'sfx' }, attack('kettle')],
  laneFire: [{ gap: 0.4, prio: 1, max: 1, bus: 'sfx', duck: [0.8, 0.6] }, c => Math.max(noise(c, 'lowpass', 300, 0.7, 0.1, 0, { to: 2800, attack: 0.08 }), thump(c, 90, 55, 0.45, 0.1))],
  trap: [{ gap: 0.2, prio: 0, max: 2, bus: 'sfx' }, attack('honey')],
  hit: [{ gap: 0.07, prio: 0, max: 3, bus: 'sfx' }, hitByTag],
  shieldHit: [{ gap: 0.12, prio: 0, max: 2, bus: 'sfx' }, c => Math.max(pling(c, 520 * c.vary, 0, 0.04, 0.14), pling(c, 1310 * c.vary, 0, 0.012, 0.07), noise(c, 'bandpass', 3000, 0.015, 0.02))],
  shieldBreak: [{ gap: 0.15, prio: 1, max: 2, bus: 'sfx' }, c => Math.max(noise(c, 'bandpass', 2000, 0.12, 0.07, 0, { q: 1 }), pling(c, 700, 0.02, 0.025, 0.12), pling(c, 1050, 0.07, 0.02, 0.1), pling(c, 880, 0.12, 0.015, 0.1))],
  splash: [{ gap: 0.12, prio: 0, max: 2, bus: 'sfx' }, c => { c.opts = { ...c.opts, tag: c.opts.tag ?? 'egg' }; return Math.max(hitByTag(c), noise(c, 'lowpass', 1000, 0.14, 0.04, 0, { to: 350 })); }],
  enemyDown: [{ gap: 0.05, prio: 0, max: 4, bus: 'sfx' }, c => (DEATHS[c.opts.def ?? ''] ?? DEATHS.pop)(c)],
  bossDown: [{ gap: 1, prio: 2, max: 1, bus: 'sfx', duck: [0.35, 2.6] }, c => {
    let end = Math.max(thump(c, 300, 50, 0.9, 0.16), noise(c, 'lowpass', 1600, 0.6, 0.08, 0, { to: 200 }));
    [65, 69, 72, 77, 81].forEach((n, i) => { end = Math.max(end, bell(c, mtof(n), 0.55 + i * 0.09, 0.05, 1.4)); });
    return end;
  }],
  bite: [{ gap: 0.25, prio: 0, max: 2, bus: 'sfx' }, c => Math.max(noise(c, 'bandpass', 1100, 0.05, 0.05, 0, { q: 1.2 }), noise(c, 'bandpass', 1300, 0.05, 0.045, 0.07, { q: 1.2 }), thump(c, 180, 120, 0.05, 0.03))],
  defenderDown: [{ gap: 0.25, prio: 1, max: 2, bus: 'sfx' }, c => Math.max(noise(c, 'lowpass', 1200, 0.3, 0.06, 0, { to: 300 }), thump(c, 300, 150, 0.2, 0.035))],
  stun: [{ gap: 0.3, prio: 0, max: 1, bus: 'sfx' }, c => Math.max(c.s.tone(c.o, c.d, { freq: 900, to: 1250, t: c.t, dur: 0.35, vel: 0.022, trem: [9, 0.8] }) - c.t, pling(c, 1350, 0.05, 0.01, 0.2))],
  mold: [{ gap: 0.4, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(noise(c, 'lowpass', 500, 0.5, 0.045, 0, { attack: 0.15 }), c.s.tone(c.o, c.d, { freq: 110, t: c.t, dur: 0.5, vel: 0.03, attack: 0.15 }) - c.t, c.s.tone(c.o, c.d, { freq: 116.5, t: c.t, dur: 0.5, vel: 0.025, attack: 0.15 }) - c.t)],
  burrow: [{ gap: 0.3, prio: 0, max: 1, bus: 'sfx' }, c => noise(c, 'lowpass', 400, 0.3, 0.06, 0, { to: 200, attack: 0.05 })],
  emerge: [{ gap: 0.3, prio: 0, max: 1, bus: 'sfx' }, c => noise(c, 'lowpass', 300, 0.25, 0.06, 0, { to: 700, attack: 0.03 })],
  steal: [{ gap: 0.4, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(noise(c, 'bandpass', 1200, 0.18, 0.045, 0, { to: 4000, q: 1.5 }), pling(c, 1200, 0.1, 0.025, 0.1), pling(c, 1000, 0.18, 0.025, 0.12))],
  recovered: [{ gap: 0.3, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(pling(c, 880, 0, 0.035, 0.15), pling(c, 1109, 0.06, 0.035, 0.15), pling(c, 1319, 0.12, 0.035, 0.25))],
  slice: [{ gap: 0.2, prio: 2, max: 1, bus: 'sfx', duck: [0.5, 1.2] }, c => Math.max(bell(c, 659, 0, 0.1, 0.45), bell(c, 622, 0.16, 0.1, 0.55), thump(c, 110, 70, 0.25, 0.14))],
  sliceRestored: [{ gap: 0.5, prio: 1, max: 1, bus: 'sfx', duck: [0.7, 0.8] }, c => { let e = 0; [65, 69, 72, 77].forEach((n, i) => { e = Math.max(e, pling(c, mtof(n + 12), i * 0.08, 0.05, 0.5)); }); return e; }],
  telegraph: [{ gap: 1, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(bell(c, 1568, 0, 0.045, 0.35), bell(c, 1568, 0.22, 0.04, 0.45), noise(c, 'lowpass', 200, 0.8, 0.03, 0, { to: 600, attack: 0.5 }))],
  waveStart: [{ gap: 0.5, prio: 1, max: 1, bus: 'sfx', duck: [0.8, 0.8] }, c => {
    let end = Math.max(bell(c, 784, 0, 0.05, 0.7), bell(c, 1175, 0.01, 0.025, 0.6));
    if (c.opts.index === 1) end = Math.max(end, c.s.tone(c.o, c.d, { type: 'sawtooth', freq: 98, to: 147, glide: 0.8, t: c.t, dur: 0.9, vel: 0.03, attack: 0.5, filter: { type: 'lowpass', freq: 500 } }) - c.t, bell(c, 988, 0.15, 0.04, 0.6));
    return end;
  }],
  finalWave: [{ gap: 1, prio: 2, max: 1, bus: 'sfx', duck: [0.6, 1.4] }, c => {
    let end = c.s.tone(c.o, c.d, { type: 'sawtooth', freq: 87, to: 131, glide: 1, t: c.t, dur: 1.1, vel: 0.035, attack: 0.6, filter: { type: 'lowpass', freq: 600 } }) - c.t;
    [1047, 1319, 1568].forEach((f, i) => { end = Math.max(end, bell(c, f, i * 0.16, 0.05, 0.6)); });
    return end;
  }],
  recipe: [{ gap: 0.25, prio: 1, max: 2, bus: 'sfx' }, c => recipeArp(c)],
  recipeNew: [{ gap: 0.5, prio: 2, max: 1, bus: 'sfx', duck: [0.6, 1.2] }, c => {
    let end = recipeArp(c, 1.3);
    for (let i = 0; i < 6; i++) end = Math.max(end, pling(c, mtof(91 + PENTA[i % 5] + (i > 4 ? 12 : 0)), 0.4 + i * 0.045, 0.018, 0.25));
    return end;
  }],
  bossArrive: [{ gap: 1, prio: 2, max: 1, bus: 'sfx', duck: [0.4, 2.2] }, c => {
    let end = 0;
    for (const [n, at] of [[38, 0], [33, 0.45]] as const) for (const cents of [-6, 6]) {
      end = Math.max(end, c.s.tone(c.o, c.d, { type: 'sawtooth', freq: mtof(n), detune: cents, t: c.t + at, dur: 0.9, vel: 0.05, attack: 0.05, hold: 0.3, filter: { type: 'lowpass', freq: 380, to: 1200, sweep: 0.2 } }) - c.t);
    }
    for (let i = 0; i < 5; i++) end = Math.max(end, thump(c, 120, 70, 0.3, 0.09 + i * 0.015, 0.9 + i * 0.09 - i * i * 0.006));
    return Math.max(end, noise(c, 'lowpass', 160, 1.6, 0.06, 0, { to: 420, attack: 0.4 }));
  }],
  bossPhase: [{ gap: 0.5, prio: 2, max: 1, bus: 'sfx', duck: [0.5, 1.4] }, c => Math.max(
    noise(c, 'lowpass', 200, 0.9, 0.09, 0, { to: 800, attack: 0.3 }),
    c.s.tone(c.o, c.d, { type: 'sawtooth', freq: 110, t: c.t, dur: 0.9, vel: 0.025, attack: 0.3, filter: { type: 'lowpass', freq: 700 } }) - c.t,
    c.s.tone(c.o, c.d, { type: 'sawtooth', freq: 116.5, t: c.t, dur: 0.9, vel: 0.025, attack: 0.3, filter: { type: 'lowpass', freq: 700 } }) - c.t)],
  bossAttack: [{ gap: 0.3, prio: 1, max: 1, bus: 'sfx' }, c => (BOSS_MOVES[c.opts.tag ?? ''] ?? BOSS_MOVES.rally)(c)],
  win: [{ gap: 1, prio: 2, max: 1, bus: 'sfx' }, c => { let e = 0; [72, 76, 79, 84].forEach((n, i) => { e = Math.max(e, bell(c, mtof(n), i * 0.07, 0.045, 0.5)); }); return e; }],
  lose: [{ gap: 1, prio: 2, max: 1, bus: 'sfx' }, c => c.s.tone(c.o, c.d, { type: 'triangle', freq: 330, to: 160, t: c.t, dur: 0.7, vel: 0.06, filter: { type: 'lowpass', freq: 900 } }) - c.t],
  star: [{ gap: 0.1, prio: 1, max: 3, bus: 'ui' }, c => Math.max(bell(c, [1047, 1319, 1568][Math.min(2, c.opts.index ?? 0)], 0, 0.06, 0.6), noise(c, 'highpass', 8000, 0.2, 0.01, 0.03, { attack: 0.04 }))],
  buy: [{ gap: 0.1, prio: 1, max: 2, bus: 'ui' }, c => Math.max(bell(c, 1568, 0, 0.04, 0.3), bell(c, 2093, 0.06, 0.04, 0.45), noise(c, 'bandpass', 5000, 0.02, 0.02))],
  unlock: [{ gap: 0.3, prio: 1, max: 1, bus: 'ui' }, c => { let e = 0; for (let i = 0; i < 6; i++) e = Math.max(e, pling(c, mtof(79 + PENTA[i % 5] + (i > 4 ? 12 : 0)), i * 0.06, 0.035, 0.4)); return e; }],
  dialogue: [{ gap: 0.05, prio: 0, max: 1, bus: 'ui' }, c => (c.opts.voice ? blip(c) : noise(c, 'highpass', 3000, 0.05, 0.012, 0, { attack: 0.01 }))],
  blip: [{ gap: 0.06, prio: 0, max: 1, bus: 'ui' }, c => blip(c)],
  bark: [{ gap: 0.5, prio: 1, max: 1, bus: 'ui' }, c => Math.max(blip(c), blip(c, 0.08), blip(c, 0.16))],
  wavesDone: [{ gap: 1, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(bell(c, 1047, 0, 0.035, 0.5), bell(c, 784, 0.18, 0.035, 0.8))],
  status: [{ gap: 0.15, prio: 0, max: 2, bus: 'sfx' }, c => {
    const kind = c.opts.tag;
    if (kind === 'slow') return pling(c, 3000 * c.vary, 0, 0.01, 0.1);
    if (kind === 'burn') return HITS.fire(c);
    if (kind === 'sticky') return thump(c, 280, 170, 0.07, 0.025);
    return pling(c, 1100 * c.vary, 0, 0.01, 0.12);
  }],
  warn: [{ gap: 0.4, prio: 1, max: 1, bus: 'sfx' }, c => (c.opts.index === 1
    ? Math.max(c.s.tone(c.o, c.d, { type: 'triangle', freq: 196, to: 185, t: c.t, dur: 0.45, vel: 0.05, attack: 0.04, filter: { type: 'lowpass', freq: 900 } }) - c.t, pling(c, 1175, 0, 0.02, 0.25))
    : Math.max(pling(c, 1319, 0, 0.018, 0.12), pling(c, 1319, 0.12, 0.014, 0.12)))],
  hazard: [{ gap: 0.25, prio: 0, max: 2, bus: 'sfx' }, c => (HAZARDS[c.opts.tag ?? ''] ?? HAZARDS.drip)(c)],
  push: [{ gap: 0.15, prio: 0, max: 2, bus: 'sfx' }, c => noise(c, 'bandpass', 500, 0.18, 0.04, 0, { to: 1400, q: 1, attack: 0.03 })],
  flare: [{ gap: 0.3, prio: 1, max: 1, bus: 'sfx' }, c => whoomp(c, 0.07)],
  cleanse: [{ gap: 0.15, prio: 0, max: 2, bus: 'sfx' }, c => Math.max(noise(c, 'highpass', 7000, 0.15, 0.015, 0, { attack: 0.03 }), pling(c, 2093 * c.vary, 0.02, 0.015, 0.2))],
  chill: [{ gap: 0.3, prio: 0, max: 1, bus: 'sfx' }, c => (c.opts.index === 0 ? dripSound(c) : frostCrackle(c))],
  remembered: [{ gap: 2, prio: 2, max: 1, bus: 'sfx', duck: [0.45, 3] }, c => {
    let e = 0;
    [53, 60, 65, 69, 72, 77].forEach((n, i) => { e = Math.max(e, bell(c, mtof(n + 12), i * 0.14, 0.045, 1.8)); });
    return Math.max(e, c.s.tone(c.o, c.d, { type: 'sine', freq: mtof(41), t: c.t, dur: 2.4, vel: 0.06, attack: 0.6, hold: 0.8 }) - c.t);
  }],
  modifier: [{ gap: 1, prio: 1, max: 1, bus: 'sfx' }, c => Math.max(bell(c, 988, 0, 0.035, 0.4), bell(c, 1319, 0.1, 0.035, 0.5), noise(c, 'highpass', 6000, 0.3, 0.01, 0.05, { attack: 0.1 }))],
  polish: [{ gap: 0.15, prio: 1, max: 1, bus: 'sfx' }, c => { let e = 0; [1319, 1568, 2093].forEach((f, i) => { e = Math.max(e, pling(c, f, i * 0.05, 0.03, 0.3)); }); return e; }],
  /** Default for events this file does not know yet: a soft, short wooden tick. */
  event: [{ gap: 0.2, prio: 0, max: 1, bus: 'sfx' }, c => thump(c, 700, 640, 0.04, 0.02)]
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];
export const sfxMeta = (name: SfxName): SfxMeta => SFX[name][0];

/** Schedule one effect at `t`; returns when it ends (absolute seconds). */
export function playSfx(s: Synth, owner: Owner, dest: AudioNode, name: SfxName, t: number, opts: SfxOptions = {}): number {
  const entry = SFX[name] ?? SFX.event;
  const c: Ctx = { s, o: owner, d: dest, t, opts, r: s.rng, vary: 0.94 + s.rng() * 0.12 };
  return t + Math.max(0.05, entry[1](c));
}

/** Key the rate limiter uses: variants (which defender, which material) get their own budget. */
export const variantKey = (name: SfxName, opts: SfxOptions = {}) => `${name}:${opts.def ?? opts.tag ?? opts.voice ?? ''}`;
