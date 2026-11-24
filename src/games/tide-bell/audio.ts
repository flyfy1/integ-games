import type { GameServices } from '../../core/game-types';

/**
 * Tide Bell sound, all synthesised with WebAudio. The signature is the bell: a struck-metal tone built from
 * inharmonic partials, pitched by the tide it leaves behind (low water rings low, high water rings bright),
 * followed by the sea's hush as the water moves. Steps, wood thunks and splashes are short filtered noise.
 * The context starts inside a user gesture, honours the arcade mute on every sound, and suspends on pause.
 * Without WebAudio (tests, old browsers) the arcade's shared cues stand in.
 */
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Bell pitch per tide after the ring: G4, C5, E5 (a calm major triad as the sea climbs). */
const BELL = [67, 72, 76];
const PARTIALS: [number, number, number][] = [[0.5, 0.35, 2.6], [1, 1, 2.2], [2, 0.42, 1.4], [2.76, 0.3, 1.0], [5.4, 0.14, 0.5], [8.93, 0.06, 0.28]];

export type Audio = ReturnType<typeof createAudio>;
export type Cue = 'step' | 'sand' | 'push' | 'splash' | 'bump' | 'undo' | 'wash' | 'flow' | 'win' | 'stuck' | 'tap';

export function createAudio(services: GameServices) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, verb: ConvolverNode | null = null, wet: GainNode | null = null;
  let noise: AudioBuffer | null = null, sea: { stop(): void } | null = null;
  let paused = false, disposed = false, failed = false;

  function ensure(): AudioContext | null {
    if (disposed || failed) return null;
    if (ctx) { if (ctx.state === 'suspended' && !paused) void ctx.resume().catch(() => {}); return ctx; }
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) { failed = true; return null; }
    try {
      ctx = new Ctor();
      master = ctx.createGain(); master.gain.value = services.sound.muted ? 0 : 0.75;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0); let seed = 4242;
      for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      // A short synthetic hall so the bell rings out over the water.
      verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 1073741823.5 - 1) * Math.pow(1 - i / len, 3); } }
      verb.buffer = ir; wet = ctx.createGain(); wet.gain.value = 0.28; verb.connect(wet); wet.connect(master);
      return ctx;
    } catch { failed = true; ctx = null; return null; }
  }
  const muted = () => services.sound.muted;
  function syncMute() { if (master && ctx) master.gain.setTargetAtTime(muted() ? 0 : 0.75, ctx.currentTime, 0.02); }

  function tone(freq: number, t: number, dur: number, vel: number, type: OscillatorType = 'sine', o: { attack?: number; to?: number; reverb?: boolean } = {}) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel), t + (o.attack ?? 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master); if (o.reverb && verb) g.connect(verb);
    osc.start(t); osc.stop(t + dur + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  function hiss(t: number, dur: number, vel: number, freq: number, q = 1.5, o: { attack?: number; sweep?: number; type?: BiquadFilterType } = {}) {
    if (!ctx || !noise || !master) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = o.type ?? 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }
  function bellAt(midi: number, t: number, vel: number) {
    const f = mtof(midi);
    for (const [ratio, amp, dur] of PARTIALS) tone(f * ratio, t, dur, vel * amp, 'sine', { attack: 0.002, reverb: true });
    hiss(t, 0.03, vel * 0.25, 5200, 3); // the strike
  }

  function ready() { if (paused || muted()) { syncMute(); return null; } const c = ensure(); if (c) syncMute(); return c; }
  const fallback: Partial<Record<Cue | 'bell', Parameters<GameServices['sound']['play']>[0]>> = { push: 'move', bump: 'tap', win: 'success', stuck: 'fail', bell: 'collect', tap: 'tap' };

  return {
    unlock() { ensure(); syncMute(); },
    /** The bell, pitched by the tide it leaves; with a tide change, the hush of the sea moving after it. */
    bell(tide: number, from: number) {
      const c = ready(); if (!c) { if (!muted() && failed) services.sound.play('collect'); return; }
      const t = c.currentTime + 0.005;
      bellAt(BELL[Math.max(0, Math.min(2, tide))], t, 0.32);
      if (tide !== from) hiss(t + 0.04, 0.42, 0.07, tide > from ? 500 : 1400, 0.8, { attack: 0.12, sweep: tide > from ? 1400 : 420, type: 'lowpass' });
    },
    cue(kind: Cue) {
      const c = ready(); if (!c) { const f = fallback[kind]; if (f && !muted() && failed) services.sound.play(f); return; }
      const t = c.currentTime + 0.005;
      switch (kind) {
        case 'step': hiss(t, 0.05, 0.08, 1700, 2.5); break;
        case 'sand': hiss(t, 0.07, 0.07, 900, 1.2); break;
        case 'push': tone(150, t, 0.16, 0.22, 'sine', { to: 95 }); hiss(t, 0.06, 0.12, 700, 2); tone(300, t, 0.05, 0.05, 'triangle'); break;
        case 'splash': hiss(t, 0.32, 0.14, 1600, 0.9, { sweep: 500, attack: 0.01 }); tone(420, t, 0.1, 0.05, 'sine', { to: 900 }); break;
        case 'flow': hiss(t, 0.5, 0.06, 700, 0.7, { attack: 0.1, sweep: 1100 }); break;
        case 'bump': tone(110, t, 0.09, 0.12, 'sine', { to: 80 }); break;
        case 'undo': tone(mtof(79), t, 0.08, 0.05, 'sine', { to: mtof(74) }); break;
        case 'wash': hiss(t, 0.6, 0.12, 1200, 0.8, { attack: 0.03, sweep: 300 }); tone(200, t + 0.05, 0.3, 0.05, 'triangle', { to: 120 }); break;
        case 'tap': hiss(t, 0.02, 0.08, 2600, 5); break;
        case 'stuck': tone(mtof(62), t, 0.4, 0.08, 'triangle'); tone(mtof(61), t + 0.16, 0.5, 0.07, 'triangle'); break;
        case 'win': [0, 4, 7, 12, 16].forEach((k, i) => bellAt(BELL[1] + k - 12, t + 0.09 * i, 0.2 + i * 0.02)); break;
      }
    },
    /** The quiet sea under a level: brown noise swelling slowly like waves on a far shore. */
    ambience(on: boolean) {
      if (!on) { sea?.stop(); sea = null; return; }
      const c = ready(); if (!c || sea || !noise || !master) return;
      const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.035, c.currentTime, 1.2);
      const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = 0.11; depth.gain.value = 0.022;
      lfo.connect(depth); depth.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(master); src.start(); lfo.start();
      sea = { stop() { const t = c.currentTime; g.gain.setTargetAtTime(0.0001, t, 0.3); src.stop(t + 1.2); lfo.stop(t + 1.2); setTimeout(() => { src.disconnect(); f.disconnect(); g.disconnect(); lfo.disconnect(); depth.disconnect(); }, 1500); } };
    },
    pause() { paused = true; if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {}); },
    resume() { paused = false; if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {}); },
    dispose() { disposed = true; sea?.stop(); sea = null; if (ctx) void ctx.close().catch(() => {}); ctx = null; },
    get backend() { return ctx ? 'webaudio' : failed ? 'shared' : 'idle'; }
  };
}
