import { INSTRUMENTS } from './instruments';
import { SCALES, TRACKS, type Note, type Scale, type StepCtx, type TrackDef, type TrackName } from './score';
import { playSfx, sfxMeta, variantKey, type SfxName, type SfxOptions } from './sfx';
import { makeImpulse, mulberry32, stopOwner, Synth, type Owner } from './synth';

/**
 * The Midnight Kitchen audio engine. Pure WebAudio graph + step sequencer + effect voice manager, with no timers and
 * no globals: whoever owns it calls `scheduleUntil(time)` (the live facade from a short interval; an offline render
 * once with the full duration). It runs on any `BaseAudioContext`.
 *
 * Graph: tracks -> music bus -> duck -> master; music reverb send -> convolver -> music bus;
 *        sfx instances -> sfx / ui bus -> master; master -> glue compressor -> limiter -> mute gain -> destination.
 */

export type Volumes = { music: number; sfx: number };
export type EngineStats = { liveSources: number; createdSources: number; sfxInstances: number; tracks: number; scene: string; dropped: number };

/** Default bus levels at volume 1. Effects sit under the music. */
const MUSIC_LEVEL = 0.55, SFX_LEVEL = 0.62, UI_LEVEL = 0.5;
export const SFX_BUDGET = 16;
/** Plays per second: per name for frequent (prio 0) / normal (prio 1) sounds, and for all frequent sounds together. */
const NAME_RATE = [10, 8, Infinity], FREQUENT_RATE = 26;
const LAYER_THRESHOLDS = [0, 0.3, 0.6, 0.85];

type SfxInstance = Owner & { name: SfxName; prio: number; end: number; out: GainNode; start: number };

type Player = Owner & {
  name: TrackName;
  def: TrackDef;
  out: GainNode;
  send: GainNode;
  layers: GainNode[];
  layerTargets: number[];
  bars: { section: string; sectionIndex: number; barInSection: number; chord: number }[];
  step: number;
  nextTime: number;
  rng: () => number;
  fading: boolean;
  killAt: number;
  ended: boolean;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export class Engine {
  readonly synth: Synth;
  private readonly master: GainNode;
  private readonly muteGain: GainNode;
  private readonly musicBus: GainNode;
  private readonly duckGain: GainNode;
  private readonly sfxBus: GainNode;
  private readonly uiBus: GainNode;
  private readonly reverb: ConvolverNode;
  private players: Player[] = [];
  private instances: SfxInstance[] = [];
  private lastPlayed = new Map<string, number>();
  private recent = new Map<string, number[]>();
  private recentFrequent: number[] = [];
  private volumes: Volumes = { music: 1, sfx: 1 };
  private intensity = 0.3;
  private mood = 0;
  private muted = false;
  private dropped = 0;
  private sceneName = 'silence';

  constructor(readonly ctx: BaseAudioContext, opts: { seed?: number; volumes?: Partial<Volumes> } = {}) {
    this.synth = new Synth(ctx, mulberry32(opts.seed ?? 0xc0ffee));
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 10; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.muteGain = ctx.createGain(); this.muteGain.gain.value = 1;
    this.master.connect(glue).connect(limiter).connect(this.muteGain).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.duckGain = ctx.createGain(); this.duckGain.gain.value = 1;
    this.musicBus.connect(this.duckGain).connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 1.8, 11);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.musicBus);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
    this.setVolumes({ ...this.volumes, ...opts.volumes });
  }

  get scene() { return this.sceneName; }

  // ---------------------------------------------------------------- mix controls

  setVolumes(v: Partial<Volumes>) {
    if (v.music !== undefined) this.volumes.music = clamp01(v.music);
    if (v.sfx !== undefined) this.volumes.sfx = clamp01(v.sfx);
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL * this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(SFX_LEVEL * this.volumes.sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(UI_LEVEL * this.volumes.sfx, t, 0.05);
  }
  getVolumes(): Volumes { return { ...this.volumes }; }

  /** Muting fades the whole output in ~30 ms and silences every playing voice. */
  setMuted(muted: boolean) {
    if (muted === this.muted) return;
    this.muted = muted;
    const t = this.ctx.currentTime, g = this.muteGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(muted ? 0 : 1, t + 0.03);
    if (muted) {
      for (const inst of this.instances) stopOwner(inst, t + 0.04);
      this.instances = [];
      for (const p of this.players) stopOwner(p, t + 0.04);
    } else {
      this.resync(t);
    }
  }
  get isMuted() { return this.muted; }

  /** Music dips to `level` and recovers over `seconds` (stingers stay readable). */
  duck(level: number, seconds: number, at = this.ctx.currentTime) {
    const g = this.duckGain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(Math.min(1, g.value), at);
    g.linearRampToValueAtTime(level, at + 0.06);
    g.setValueAtTime(level, at + seconds * 0.5);
    g.linearRampToValueAtTime(1, at + seconds);
  }

  /** 0 = calm, 1 = all hands. Layers fade over a couple of seconds; never instant. */
  setIntensity(value: number) { this.intensity = clamp01(value); }
  getIntensity() { return this.intensity; }
  /** Story state for tracks that read it (the finale's mode, 0..2). */
  setMood(mood: number) { this.mood = mood; }

  // ---------------------------------------------------------------- music

  setScene(name: string, at = this.ctx.currentTime) {
    if (name === this.sceneName) return;
    this.sceneName = name;
    const def = (TRACKS as Record<string, TrackDef>)[name];
    const fadeOut = def && !def.loop ? 0.35 : 1.4;
    // Fade whatever is playing; if something was already fading, cut it so at most two tracks ever overlap.
    for (const p of this.players) {
      if (p.fading) { this.kill(p, at, 0.05); continue; }
      p.fading = true;
      p.killAt = at + fadeOut + 0.1;
      const g = p.out.gain;
      g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); g.linearRampToValueAtTime(0, at + fadeOut);
    }
    this.players = this.players.filter(p => !p.ended);
    this.mood = 0;
    if (!def) return;
    this.players.push(this.createPlayer(name as TrackName, def, at, def.loop ? 1.2 : 0.02));
  }

  private createPlayer(name: TrackName, def: TrackDef, at: number, fadeIn: number): Player {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(def.gain, at + fadeIn);
    out.connect(this.musicBus);
    const send = ctx.createGain(); send.gain.value = def.reverb;
    out.connect(send).connect(this.reverb);
    const targets = LAYER_THRESHOLDS.map((_, i) => this.layerLevel(def, i));
    const layers = targets.map(level => { const g = ctx.createGain(); g.gain.value = level; g.connect(out); return g; });
    const bars: Player['bars'] = [];
    def.form.forEach((section, sectionIndex) => def.sections[section].chords.forEach((chord, barInSection) => bars.push({ section, sectionIndex, barInSection, chord })));
    let seed = 0;
    for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return { name, def, out, send, layers, layerTargets: targets, bars, step: 0, nextTime: at + 0.05, rng: mulberry32(seed), fading: false, killAt: Infinity, ended: false, sources: new Set() };
  }

  private layerLevel(def: TrackDef, layer: number) {
    const value = def.intensity ?? this.intensity, threshold = LAYER_THRESHOLDS[layer];
    if (layer === 0) return 1;
    return clamp01((value - threshold) / 0.2 + 0.5) ** 1.5;
  }

  private kill(p: Player, at: number, fade: number) {
    if (p.ended) return;
    p.ended = true;
    const g = p.out.gain;
    g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); g.linearRampToValueAtTime(0, at + fade);
    stopOwner(p, at + fade + 0.01);
    const out = p.out, send = p.send, layers = p.layers;
    const disconnect = () => { for (const node of [out, send, ...layers]) { try { node.disconnect(); } catch { /* gone */ } } };
    // Detach the track's gain nodes once its last voice has ended.
    if (p.sources.size === 0) disconnect();
    else p.onEmpty = disconnect;
  }

  /** After a pause, mute or a throttled tab: continue from now instead of catching up. */
  resync(t = this.ctx.currentTime) {
    for (const p of this.players) if (p.nextTime < t + 0.02) p.nextTime = t + 0.05;
  }

  private scaleOf(def: TrackDef): Scale {
    return typeof def.scale === 'function' ? def.scale(this.mood) : def.scale ?? SCALES.major;
  }

  /** Schedule every music step that starts before `until`, and retire tracks that have faded out. */
  scheduleUntil(until: number) {
    const now = this.ctx.currentTime;
    for (const p of this.players) {
      if (p.ended) continue;
      if (p.fading && now >= p.killAt) { this.kill(p, now, 0.02); continue; }
      if (this.muted) continue;
      // Re-aim the intensity layers (smoothly) once per scheduling pass.
      p.layers.forEach((g, i) => {
        const target = this.layerLevel(p.def, i);
        if (Math.abs(target - p.layerTargets[i]) > 0.01) { p.layerTargets[i] = target; g.gain.setTargetAtTime(target, Math.max(now, p.nextTime - 0.1), 1.2); }
      });
      if (p.nextTime < now - 0.25) p.nextTime = now + 0.02; // never burst to catch up
      const stepDur = 60 / p.def.bpm / 4;
      while (p.nextTime < until && !p.ended) {
        if (!p.def.loop && p.step >= p.bars.length * 16) {
          // A stinger is done once its last notes ring out.
          if (!p.fading) { p.fading = true; p.killAt = p.nextTime + 4; }
          break;
        }
        if (!p.fading || p.nextTime < p.killAt) this.playStep(p, p.nextTime, stepDur);
        p.step++;
        p.nextTime += stepDur;
      }
    }
    this.players = this.players.filter(p => !p.ended);
    this.instances = this.instances.filter(inst => inst.end > now);
  }

  private playStep(p: Player, t: number, stepDur: number) {
    const def = p.def, total = p.bars.length, barIndex = Math.floor(p.step / 16), step = p.step % 16;
    const bar = p.bars[barIndex % total], cycle = Math.floor(barIndex / total), key = def.key, scale = this.scaleOf(def);
    const section = def.sections[bar.section];
    const note = (deg: number, oct = 0) => key + scale[((deg % 7) + 7) % 7] + 12 * (Math.floor(deg / 7) + oct);
    const melodyBar = section.melody?.[bar.barInSection];
    const ctx: StepCtx = {
      abs: barIndex, cycle, step, section: bar.section, sectionIndex: bar.sectionIndex, barInSection: bar.barInSection, chord: bar.chord,
      melody: step % 2 === 0 ? melodyBar?.find(e => e.slot === step / 2) ?? null : null,
      note, tones: (seventh = false) => (seventh ? [0, 2, 4, 6] : [0, 2, 4]).map(i => bar.chord + i),
      rng: p.rng, mood: this.mood
    };
    const swing = def.swing && step % 4 === 2 ? def.swing * stepDur : 0;
    def.parts.forEach(part => {
      // Skip parts whose layer is (and is staying) silent: saves nodes when the fight is calm.
      if (p.layerTargets[part.layer] < 0.02 && p.layers[part.layer].gain.value < 0.02) return;
      const out = part.play(ctx);
      if (!out) return;
      for (const n of (Array.isArray(out) ? out : [out]) as Note[]) {
        INSTRUMENTS[n.inst](this.synth, p, p.layers[part.layer], t + swing, n.midi, n.steps * stepDur, n.vel);
      }
    });
  }

  // ---------------------------------------------------------------- effects

  /** Play an effect now (or at `at`). Returns false when muted, rate-limited or over the voice budget. */
  sfx(name: SfxName, opts: SfxOptions = {}, at = this.ctx.currentTime): boolean {
    if (this.muted) return false;
    const meta = sfxMeta(name) ?? sfxMeta('event');
    const key = variantKey(name, opts), last = this.lastPlayed.get(key);
    if (last !== undefined && at - last < meta.gap && at >= last) { this.dropped++; return false; }
    // Density: a full board asks for dozens of hits a second; past a few the ear only hears noise.
    const window = (this.recent.get(name) ?? []).filter(time => Math.abs(at - time) < 1);
    this.recent.set(name, window);
    if (window.length >= NAME_RATE[meta.prio]) { this.dropped++; return false; }
    if (meta.prio === 0) {
      this.recentFrequent = this.recentFrequent.filter(time => Math.abs(at - time) < 1);
      if (this.recentFrequent.length >= FREQUENT_RATE) { this.dropped++; return false; }
    }
    this.instances = this.instances.filter(inst => inst.end > at);
    const same = this.instances.filter(inst => inst.name === name);
    if (same.length >= meta.max) {
      if (meta.prio < 2) { this.dropped++; return false; }
      this.steal(same[0], at);
    }
    if (this.instances.length >= SFX_BUDGET) {
      const victim = this.instances.filter(inst => inst.prio < meta.prio).sort((a, b) => a.prio - b.prio || a.start - b.start)[0];
      if (!victim) { this.dropped++; return false; }
      this.steal(victim, at);
    }
    this.lastPlayed.set(key, at);
    window.push(at);
    if (meta.prio === 0) this.recentFrequent.push(at);
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(meta.bus === 'ui' ? this.uiBus : this.sfxBus);
    const inst: SfxInstance = { name, prio: meta.prio, out, end: at, start: at, sources: new Set() };
    inst.end = playSfx(this.synth, inst, out, name, at + 0.005, opts) + 0.05;
    // The instance's gain node goes when its last source ends.
    const release = () => { try { out.disconnect(); } catch { /* gone */ } };
    if (inst.sources.size) inst.onEmpty = release; else release();
    this.instances.push(inst);
    if (meta.duck) this.duck(meta.duck[0], meta.duck[1], at);
    return true;
  }

  private steal(inst: SfxInstance, at: number) {
    const g = inst.out.gain;
    g.cancelScheduledValues(at); g.setValueAtTime(g.value, at); g.linearRampToValueAtTime(0, at + 0.02);
    stopOwner(inst, at + 0.03);
    inst.end = at;
    this.instances = this.instances.filter(i => i !== inst);
  }

  // ---------------------------------------------------------------- teardown

  /** Stop every voice and track now. */
  stopAll() {
    const t = this.ctx.currentTime;
    for (const inst of this.instances) stopOwner(inst, t);
    for (const p of this.players) { p.ended = true; stopOwner(p, t); }
    this.instances = []; this.players = [];
    this.sceneName = 'silence';
  }

  stats(): EngineStats {
    return {
      liveSources: this.synth.stats.live, createdSources: this.synth.stats.created,
      sfxInstances: this.instances.filter(i => i.end > this.ctx.currentTime).length,
      tracks: this.players.length, scene: this.sceneName, dropped: this.dropped
    };
  }
}
