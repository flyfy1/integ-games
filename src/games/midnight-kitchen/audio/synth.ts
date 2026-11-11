/**
 * Midnight Kitchen audio: low-level synthesis. Every sound in the game is built here from oscillators and one
 * shared noise buffer, against any `BaseAudioContext` (a live `AudioContext` or an `OfflineAudioContext` used to
 * render tracks for inspection). Each started source belongs to an `Owner` (a music track or one sfx instance) so it
 * can be stopped early, and every node is disconnected when its source ends.
 */

export type Owner = { sources: Set<AudioScheduledSourceNode>; /** Called when the owner's last source has ended. */ onEmpty?: () => void };

/** Small, fast, seedable PRNG. Audio variation never touches the simulation's `services.random`. */
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

export const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export type ToneOpts = {
  type?: OscillatorType;
  freq: number;
  /** Glide the pitch to this frequency over `glide` seconds (exponential). */
  to?: number;
  glide?: number;
  t: number;
  dur: number;
  vel: number;
  attack?: number;
  /** Hold at full level for this many seconds before decaying (pads, reeds). */
  hold?: number;
  detune?: number;
  filter?: { type: BiquadFilterType; freq: number; to?: number; sweep?: number; q?: number };
  /** Amplitude tremolo `[rate Hz, depth 0..1]`. */
  trem?: [number, number];
};

export type NoiseOpts = {
  t: number;
  dur: number;
  vel: number;
  attack?: number;
  hold?: number;
  filter: { type: BiquadFilterType; freq: number; to?: number; sweep?: number; q?: number };
  trem?: [number, number];
};

/** Counters the engine and the tests read. */
export type SynthStats = { created: number; live: number };

export class Synth {
  readonly noise: AudioBuffer;
  readonly stats: SynthStats = { created: 0, live: 0 };
  constructor(readonly ctx: BaseAudioContext, readonly rng: () => number) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0), r = mulberry32(0x5eed);
    // Pink-ish noise (one-pole filtered white) is gentler on the ear than pure white.
    let b = 0;
    for (let i = 0; i < length; i++) { const w = r() * 2 - 1; b = 0.6 * b + 0.4 * w; data[i] = (w * 0.55 + b * 0.75); }
  }

  private envelope(gain: GainNode, t: number, vel: number, attack: number, hold: number, end: number) {
    const g = gain.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(vel, t + attack);
    if (hold > 0) g.setValueAtTime(vel, t + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, end);
    g.linearRampToValueAtTime(0, end + 0.01);
  }

  private filterNode(spec: NonNullable<ToneOpts['filter']>, t: number, dur: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = spec.type;
    f.frequency.setValueAtTime(spec.freq, t);
    if (spec.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), t + (spec.sweep ?? dur));
    if (spec.q !== undefined) f.Q.value = spec.q;
    return f;
  }

  private tremolo(owner: Owner, input: AudioNode, t: number, end: number, rate: number, depth: number): AudioNode {
    const amp = this.ctx.createGain();
    amp.gain.value = 1 - depth / 2;
    const lfo = this.ctx.createOscillator(), lfoGain = this.ctx.createGain();
    lfo.frequency.value = rate; lfoGain.gain.value = depth / 2;
    lfo.connect(lfoGain).connect(amp.gain);
    input.connect(amp);
    this.track(owner, lfo, [lfo, lfoGain], t, end);
    return amp;
  }

  /** Start/stop bookkeeping: every node is disconnected once the source has ended. */
  private track(owner: Owner, source: AudioScheduledSourceNode, nodes: AudioNode[], t: number, end: number) {
    this.stats.created++; this.stats.live++;
    owner.sources.add(source);
    let done = false;
    source.onended = () => {
      if (done) return;
      done = true;
      this.stats.live--;
      owner.sources.delete(source);
      for (const node of nodes) { try { node.disconnect(); } catch { /* already gone */ } }
      if (owner.sources.size === 0) owner.onEmpty?.();
    };
    source.start(Math.max(0, t));
    source.stop(end + 0.03);
  }

  tone(owner: Owner, dest: AudioNode, o: ToneOpts): number {
    const ctx = this.ctx, attack = o.attack ?? 0.005, hold = o.hold ?? 0, end = o.t + Math.max(attack + hold + 0.01, o.dur);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, o.t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), o.t + (o.glide ?? o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const gain = ctx.createGain();
    this.envelope(gain, o.t, o.vel, attack, hold, end);
    const nodes: AudioNode[] = [osc, gain];
    let head: AudioNode = osc;
    if (o.filter) { const f = this.filterNode(o.filter, o.t, o.dur); head.connect(f); head = f; nodes.push(f); }
    head.connect(gain);
    let out: AudioNode = gain;
    if (o.trem) { out = this.tremolo(owner, gain, o.t, end, o.trem[0], o.trem[1]); nodes.push(out); }
    out.connect(dest);
    this.track(owner, osc, nodes, o.t, end);
    return end;
  }

  noiseHit(owner: Owner, dest: AudioNode, o: NoiseOpts): number {
    const ctx = this.ctx, attack = o.attack ?? 0.002, hold = o.hold ?? 0, end = o.t + Math.max(attack + hold + 0.01, o.dur);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = 0; src.loopEnd = this.noise.duration;
    const f = this.filterNode(o.filter, o.t, o.dur);
    const gain = ctx.createGain();
    this.envelope(gain, o.t, o.vel, attack, hold, end);
    src.connect(f).connect(gain);
    let out: AudioNode = gain;
    const nodes: AudioNode[] = [src, f, gain];
    if (o.trem) { out = this.tremolo(owner, gain, o.t, end, o.trem[0], o.trem[1]); nodes.push(out); }
    out.connect(dest);
    // Start at a random point so repeated hits do not sound identical.
    src.start(Math.max(0, o.t), this.rng() * (this.noise.duration - 0.2));
    src.stop(end + 0.03);
    this.stats.created++; this.stats.live++;
    owner.sources.add(src);
    let done = false;
    src.onended = () => {
      if (done) return;
      done = true; this.stats.live--; owner.sources.delete(src);
      for (const node of nodes) { try { node.disconnect(); } catch { /* already gone */ } }
      if (owner.sources.size === 0) owner.onEmpty?.();
    };
    return end;
  }
}

/** Stop every source an owner still holds, a few ms from now (after its gain has been ramped down). */
export function stopOwner(owner: Owner, at: number) {
  for (const source of [...owner.sources]) {
    try { source.stop(at); } catch { /* not started or already stopped */ }
  }
}

/** A gentle room: a short, dark, decaying noise impulse. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch), r = mulberry32(seed + ch * 977);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const p = i / length;
      low = low * 0.82 + (r() * 2 - 1) * 0.18; // darken
      data[i] = low * Math.pow(1 - p, 3.2) * (i < 64 ? i / 64 : 1);
    }
  }
  return buffer;
}
