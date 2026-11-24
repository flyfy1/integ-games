import type { GameServices } from '../../core/game-types';
import { PARTS } from './parts';
import type { PartKind, SimEvent } from './types';

/**
 * Lantern Works audio. The signature: every machine plays one pitched note when it works, and the sim works on
 * the beat, so a running factory plays a little looping tune (and a jam goes quiet). Pitches come from a major
 * pentatonic scale, so any factory sounds pleasant; the machine type picks the degree and timbre and the row it
 * stands on shifts the melody, so two layouts of the same level sing differently.
 *
 * Everything is synthesised with WebAudio. The context is created lazily inside a user gesture (`unlock`), the
 * arcade's mute is honoured on every note, pause suspends the context, and a per-beat voice cap keeps 4x speed sane.
 * Without WebAudio (tests, old browsers) the arcade's shared cues stand in for the few big moments.
 */
const SCALE = [0, 2, 4, 7, 9];
const ROOT = 62; // D4
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Voice = 'marimba' | 'pluck' | 'bell' | 'wood' | 'glass' | 'thump' | 'click' | 'chord';
const VOICE: Record<PartKind, Voice> = {
  belt: 'click', folder: 'marimba', vat: 'pluck', joiner: 'wood', splitter: 'click', mixer: 'glass', sorter: 'click', bin: 'thump', bridge: 'click', wick: 'bell', gate: 'click', stamp: 'thump', bundler: 'chord'
};

export type Audio = ReturnType<typeof createAudio>;

export function createAudio(services: GameServices, volumes: { sfx: number; music: number }) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, sfxBus: GainNode | null = null, musicBus: GainNode | null = null;
  let pad: { stop(): void } | null = null;
  let paused = false, disposed = false, failed = false;
  let noise: AudioBuffer | null = null;
  const vol = { ...volumes };

  function ensure(): AudioContext | null {
    if (disposed || failed) return null;
    if (ctx) { if (ctx.state === 'suspended' && !paused) void ctx.resume().catch(() => {}); return ctx; }
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) { failed = true; return null; }
    try {
      ctx = new Ctor();
      master = ctx.createGain(); master.gain.value = services.sound.muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noise.getChannelData(0); let seed = 12345;
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      return ctx;
    } catch { failed = true; ctx = null; return null; }
  }

  const muted = () => services.sound.muted;
  function syncMute() { if (master && ctx) master.gain.setTargetAtTime(muted() ? 0 : 0.8, ctx.currentTime, 0.02); }

  function tone(freq: number, t: number, dur: number, vel: number, type: OscillatorType, opts: { attack?: number; to?: number; filter?: number; bus?: GainNode | null } = {}) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = g;
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; g.connect(f); out = f; }
    o.connect(g); out.connect(opts.bus ?? sfxBus!);
    o.start(t); o.stop(t + dur + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  }
  function hiss(t: number, dur: number, vel: number, freq: number, q = 2) {
    if (!ctx || !noise) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus!);
    src.start(t, Math.random() * 0.3, dur + 0.02);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  function play(voice: Voice, midi: number, t: number, vel: number) {
    const f = mtof(midi);
    switch (voice) {
      case 'marimba': tone(f, t, 0.5, vel, 'sine'); tone(f * 4, t, 0.08, vel * 0.25, 'sine'); break;
      case 'pluck': tone(f, t, 0.35, vel, 'triangle', { filter: 2400 }); tone(f * 2, t, 0.12, vel * 0.2, 'sine'); break;
      case 'bell': tone(f * 2, t, 1.2, vel * 0.6, 'sine'); tone(f * 2 * 2.76, t, 0.5, vel * 0.18, 'sine'); tone(f, t, 0.8, vel * 0.3, 'sine'); break;
      case 'wood': tone(f, t, 0.18, vel, 'square', { filter: 1600 }); hiss(t, 0.03, vel * 0.5, 2400, 6); break;
      case 'glass': tone(f * 2, t, 0.7, vel * 0.5, 'sine'); tone(f * 3, t, 0.4, vel * 0.2, 'sine'); break;
      case 'thump': tone(f / 2, t, 0.25, vel, 'sine', { to: f / 3 }); hiss(t, 0.05, vel * 0.3, 900); break;
      case 'click': hiss(t, 0.025, vel * 0.6, 3200 + (midi % 12) * 120, 8); break;
      case 'chord': for (const k of [0, 4, 7]) tone(mtof(midi + k), t, 0.6, vel * 0.4, 'triangle', { filter: 3000 }); break;
    }
  }

  const noteOf = (kind: PartKind, y: number) => {
    const [deg, oct] = PARTS[kind].note;
    const k = deg + (4 - (y % 5));
    return ROOT + 12 * oct + SCALE[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5) - 12;
  };

  let lastBeatAt = 0;
  return {
    unlock() { ensure(); syncMute(); },
    /** Plays one beat's events. `beatDur` seconds per beat (the speed): at high speed fewer, softer notes. */
    beat(events: SimEvent[], beatDur: number) {
      if (paused || muted()) { syncMute(); return; }
      const c = ensure();
      if (!c) {
        for (const e of events) {
          if (e.type === 'won') services.sound.play('success');
          else if (e.type === 'spoiled' || e.type === 'shiftOver') services.sound.play('fail');
          else if (e.type === 'orderDone') services.sound.play('collect');
        }
        return;
      }
      syncMute();
      const t = Math.max(c.currentTime + 0.02, lastBeatAt + beatDur * 0.5);
      lastBeatAt = t;
      const cap = beatDur < 0.1 ? 3 : beatDur < 0.2 ? 5 : 8;
      let notes = 0;
      const seen = new Set<string>();
      for (const e of events) {
        if (e.type === 'work') {
          const key = `${e.part}:${e.y}`;
          if (seen.has(key) || notes >= cap) continue;
          seen.add(key); notes++;
          play(VOICE[e.part], noteOf(e.part, e.y), t, beatDur < 0.1 ? 0.12 : 0.22);
        } else if (e.type === 'deliver' && !e.extra) {
          if (notes++ < cap + 2) { const m = ROOT + 12 + SCALE[(e.stall * 2 + (e.x + e.y)) % 5]; play('bell', m, t, 0.2); }
        } else if (e.type === 'wrong') { tone(110, t, 0.35, 0.25, 'sawtooth', { filter: 700 }); tone(116, t, 0.35, 0.2, 'sawtooth', { filter: 700 }); }
        else if (e.type === 'emit' && beatDur >= 0.15 && notes < cap) hiss(t, 0.02, 0.06, 5200, 10);
        else if (e.type === 'won') { [0, 2, 4, 5, 7].forEach((k, i) => play('bell', ROOT + 12 + SCALE[k % 5] + (k >= 5 ? 12 : 0), t + 0.12 * i + 0.1, 0.22)); }
        else if (e.type === 'spoiled' || e.type === 'shiftOver') { [4, 2, 0].forEach((k, i) => tone(mtof(ROOT + SCALE[k]), t + i * 0.18, 0.4, 0.2, 'triangle')); }
        else if (e.type === 'orderDone') { play('chord', ROOT + 7, t, 0.3); }
        else if (e.type === 'orderExpired') { tone(mtof(ROOT - 5), t, 0.5, 0.2, 'triangle', { to: mtof(ROOT - 10) }); }
        else if (e.type === 'catSit') { tone(mtof(ROOT + 19), t, 0.25, 0.08, 'sine', { to: mtof(ROOT + 14) }); }
      }
    },
    ui(kind: 'tap' | 'place' | 'deny' | 'run' | 'remove' = 'tap') {
      if (muted()) return;
      const c = ensure(); if (!c) { services.sound.play(kind === 'deny' ? 'fail' : 'tap'); return; }
      syncMute();
      const t = c.currentTime + 0.01;
      if (kind === 'tap') hiss(t, 0.02, 0.15, 2600, 6);
      else if (kind === 'place') { tone(mtof(ROOT + 7), t, 0.12, 0.12, 'triangle'); hiss(t, 0.03, 0.12, 1800, 4); }
      else if (kind === 'remove') tone(mtof(ROOT), t, 0.15, 0.1, 'triangle', { to: mtof(ROOT - 7) });
      else if (kind === 'deny') tone(180, t, 0.15, 0.12, 'square', { filter: 900 });
      else { tone(mtof(ROOT), t, 0.2, 0.15, 'triangle'); tone(mtof(ROOT + 7), t + 0.08, 0.3, 0.15, 'triangle'); }
    },
    /** A soft workshop hum under the tune while a level is open. */
    hum(on: boolean) {
      const c = on ? ensure() : ctx;
      if (!c) return;
      if (!on) { pad?.stop(); pad = null; return; }
      if (pad) return;
      const oscs: OscillatorNode[] = [];
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05, c.currentTime, 1.5);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      g.connect(f); f.connect(musicBus!);
      for (const [m, d] of [[ROOT - 24, 0], [ROOT - 17, 4], [ROOT - 12, -5]]) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = d; o.connect(g); o.start(); oscs.push(o);
      }
      pad = { stop() { const t = c.currentTime; g.gain.setTargetAtTime(0.0001, t, 0.4); oscs.forEach(o => o.stop(t + 1.5)); setTimeout(() => { g.disconnect(); f.disconnect(); }, 1800); } };
    },
    setVolumes(v: Partial<{ sfx: number; music: number }>) {
      Object.assign(vol, v);
      if (ctx && sfxBus && musicBus) { sfxBus.gain.setTargetAtTime(vol.sfx, ctx.currentTime, 0.05); musicBus.gain.setTargetAtTime(vol.music * 0.5, ctx.currentTime, 0.05); }
    },
    pause() { paused = true; if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {}); },
    resume() { paused = false; if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {}); },
    dispose() { disposed = true; pad?.stop(); pad = null; if (ctx) void ctx.close().catch(() => {}); ctx = null; },
    get backend() { return ctx ? 'webaudio' : failed ? 'shared' : 'idle'; }
  };
}
