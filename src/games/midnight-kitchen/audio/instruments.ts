import { mtof, type Owner, type Synth } from './synth';

/**
 * The band: small synthesised instruments used by the score. Each takes a start time, a MIDI note (drums ignore it
 * or use it as a colour), a length in seconds and a velocity (0..1, scaled down here so a part at vel 1 sits at a
 * comfortable level), and schedules its nodes into `dest`.
 */
export type Instrument = (s: Synth, owner: Owner, dest: AudioNode, t: number, midi: number, dur: number, vel: number) => void;

const keys: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), len = Math.min(2.2, Math.max(0.35, dur * 1.4));
  s.tone(o, d, { type: 'sine', freq: f, t, dur: len, vel: 0.19 * v, attack: 0.006 });
  s.tone(o, d, { type: 'triangle', freq: f * 2, t, dur: len * 0.45, vel: 0.035 * v, attack: 0.004 });
  s.tone(o, d, { type: 'sine', freq: f * 4.01, t, dur: 0.12, vel: 0.025 * v, attack: 0.002 });
};

const marimba: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), len = Math.min(0.55, Math.max(0.18, dur));
  s.tone(o, d, { type: 'sine', freq: f, t, dur: len, vel: 0.2 * v, attack: 0.003 });
  s.tone(o, d, { type: 'sine', freq: f * 3.98, t, dur: 0.07, vel: 0.05 * v, attack: 0.001 });
};

const pluck: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), len = Math.min(0.6, Math.max(0.22, dur));
  s.tone(o, d, { type: 'triangle', freq: f, t, dur: len, vel: 0.17 * v, attack: 0.002, filter: { type: 'lowpass', freq: Math.min(9000, f * 7), to: f * 1.4, sweep: len * 0.6, q: 2 } });
};

const musicbox: Instrument = (s, o, d, t, m, _dur, v) => {
  const f = mtof(m);
  s.tone(o, d, { type: 'sine', freq: f, t, dur: 1.4, vel: 0.11 * v, attack: 0.002 });
  s.tone(o, d, { type: 'sine', freq: f * 3, t, dur: 0.35, vel: 0.025 * v, attack: 0.001 });
  s.tone(o, d, { type: 'sine', freq: f * 5.04, t, dur: 0.1, vel: 0.012 * v, attack: 0.001 });
};

const celesta: Instrument = (s, o, d, t, m, _dur, v) => {
  const f = mtof(m);
  s.tone(o, d, { type: 'sine', freq: f, t, dur: 0.9, vel: 0.08 * v, attack: 0.002 });
  s.tone(o, d, { type: 'sine', freq: f * 2, t, dur: 0.3, vel: 0.03 * v, attack: 0.001 });
};

const pad: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), hold = Math.max(0.05, dur - 0.35);
  for (const cents of [-7, 7]) {
    s.tone(o, d, { type: 'sawtooth', freq: f, detune: cents, t, dur: dur + 0.7, vel: 0.022 * v, attack: 0.35, hold, filter: { type: 'lowpass', freq: 700, q: 0.4 } });
  }
};

const glass: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), hold = Math.max(0.05, dur - 0.4);
  s.tone(o, d, { type: 'sine', freq: f, t, dur: dur + 0.9, vel: 0.05 * v, attack: 0.4, hold });
  s.tone(o, d, { type: 'sine', freq: f * 2.005, t, dur: dur + 0.6, vel: 0.016 * v, attack: 0.6, hold, trem: [4.5, 0.5] });
};

const bass: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), len = Math.max(0.2, dur * 0.95);
  s.tone(o, d, { type: 'triangle', freq: f, t, dur: len, vel: 0.11 * v, attack: 0.01, hold: len * 0.3, filter: { type: 'lowpass', freq: 600, q: 0.7 } });
  s.tone(o, d, { type: 'sine', freq: f, t, dur: len, vel: 0.06 * v, attack: 0.01, hold: len * 0.3 });
};

const pizz: Instrument = (s, o, d, t, m, _dur, v) => {
  const f = mtof(m);
  s.tone(o, d, { type: 'triangle', freq: f, t, dur: 0.22, vel: 0.17 * v, attack: 0.003, filter: { type: 'lowpass', freq: f * 5, to: f * 1.5, sweep: 0.15 } });
};

const reed: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), hold = Math.max(0.03, dur * 0.7);
  s.tone(o, d, { type: 'square', freq: f, t, dur: dur + 0.12, vel: 0.05 * v, attack: 0.035, hold, filter: { type: 'lowpass', freq: Math.min(1600, f * 3.2), q: 0.8 } });
};

const flute: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), hold = Math.max(0.03, dur * 0.75);
  s.tone(o, d, { type: 'sine', freq: f, t, dur: dur + 0.25, vel: 0.12 * v, attack: 0.06, hold, trem: [5.2, 0.12] });
  s.tone(o, d, { type: 'triangle', freq: f * 2, t, dur: dur + 0.1, vel: 0.012 * v, attack: 0.08, hold });
  s.noiseHit(o, d, { t, dur: 0.12, vel: 0.008 * v, attack: 0.03, filter: { type: 'bandpass', freq: f * 2, q: 3 } });
};

const lead: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m), hold = Math.max(0.03, dur * 0.6);
  s.tone(o, d, { type: 'sawtooth', freq: f, t, dur: dur + 0.1, vel: 0.045 * v, attack: 0.01, hold, filter: { type: 'lowpass', freq: 2400, to: 900, sweep: dur + 0.1, q: 1.2 } });
  s.tone(o, d, { type: 'square', freq: f * 0.5, t, dur: dur + 0.1, vel: 0.02 * v, attack: 0.01, hold, filter: { type: 'lowpass', freq: 900 } });
};

const brass: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m);
  for (const cents of [-5, 6]) s.tone(o, d, { type: 'sawtooth', freq: f, detune: cents, t, dur: Math.max(0.25, dur), vel: 0.04 * v, attack: 0.03, hold: dur * 0.3, filter: { type: 'lowpass', freq: 500, to: 1700, sweep: 0.08, q: 1 } });
};

const drivebass: Instrument = (s, o, d, t, m, dur, v) => {
  const f = mtof(m);
  s.tone(o, d, { type: 'sawtooth', freq: f, t, dur: Math.max(0.12, dur * 0.85), vel: 0.08 * v, attack: 0.004, filter: { type: 'lowpass', freq: 900, to: 260, sweep: 0.16, q: 3 } });
  s.tone(o, d, { type: 'sine', freq: f, t, dur: Math.max(0.12, dur * 0.85), vel: 0.06 * v, attack: 0.004 });
};

// ------------------------------------------------------------------ percussion (the note is ignored)

const kick: Instrument = (s, o, d, t, _m, _dur, v) => {
  s.tone(o, d, { type: 'sine', freq: 115, to: 48, glide: 0.12, t, dur: 0.26, vel: 0.26 * v, attack: 0.002 });
};
const tom: Instrument = (s, o, d, t, m, _dur, v) => {
  s.tone(o, d, { type: 'sine', freq: mtof(m), to: mtof(m) * 0.6, glide: 0.25, t, dur: 0.35, vel: 0.25 * v, attack: 0.002 });
};
const snare: Instrument = (s, o, d, t, _m, _dur, v) => {
  s.noiseHit(o, d, { t, dur: 0.16, vel: 0.12 * v, filter: { type: 'bandpass', freq: 2200, q: 0.7 } });
  s.tone(o, d, { type: 'triangle', freq: 210, to: 150, t, dur: 0.08, vel: 0.07 * v, attack: 0.001 });
};
const brush: Instrument = (s, o, d, t, _m, _dur, v) => {
  s.noiseHit(o, d, { t, dur: 0.2, vel: 0.05 * v, attack: 0.02, filter: { type: 'bandpass', freq: 3200, q: 0.6 } });
};
const hat: Instrument = (s, o, d, t, _m, _dur, v) => {
  s.noiseHit(o, d, { t, dur: 0.045, vel: 0.04 * v, filter: { type: 'highpass', freq: 7000, q: 0.5 } });
};
/** Long, soft frying-pan hat for the stove. */
const sizzle: Instrument = (s, o, d, t, _m, dur, v) => {
  s.noiseHit(o, d, { t, dur: Math.max(0.12, dur), vel: 0.03 * v, attack: 0.01, filter: { type: 'highpass', freq: 5200, q: 0.4 }, trem: [23, 0.5] });
};
const shaker: Instrument = (s, o, d, t, _m, _dur, v) => {
  s.noiseHit(o, d, { t, dur: 0.07, vel: 0.03 * v, attack: 0.012, filter: { type: 'bandpass', freq: 6000, q: 0.9 } });
};
const wood: Instrument = (s, o, d, t, m, _dur, v) => {
  s.tone(o, d, { type: 'sine', freq: mtof(m), t, dur: 0.06, vel: 0.12 * v, attack: 0.001 });
  s.noiseHit(o, d, { t, dur: 0.025, vel: 0.04 * v, filter: { type: 'bandpass', freq: mtof(m) * 2, q: 6 } });
};
const drip: Instrument = (s, o, d, t, m, _dur, v) => {
  const f = mtof(m);
  s.tone(o, d, { type: 'sine', freq: f, to: f * 1.9, glide: 0.06, t, dur: 0.12, vel: 0.07 * v, attack: 0.002 });
};
const tick: Instrument = (s, o, d, t, m, _dur, v) => {
  s.tone(o, d, { type: 'sine', freq: mtof(m), t, dur: 0.035, vel: 0.05 * v, attack: 0.001 });
};

export const INSTRUMENTS = {
  keys, marimba, pluck, musicbox, celesta, pad, glass, bass, pizz, reed, flute, lead, brass, drivebass,
  kick, tom, snare, brush, hat, sizzle, shaker, wood, drip, tick
} satisfies Record<string, Instrument>;
export type InstrumentName = keyof typeof INSTRUMENTS;
