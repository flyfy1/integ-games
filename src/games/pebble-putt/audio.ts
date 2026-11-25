import type { GameServices } from '../../core/game-types';

/**
 * Pebble Putt sound, all synthesised with WebAudio: a sand roll whose hiss follows the pebble's speed, wooden clacks
 * off the boards, a stone knock, a hollow "tok" and rattle when the cup takes it, a splash, the bamboo deer-scarer,
 * a spring "boing", and a pentatonic chime for an ace. The context starts inside a user gesture (`unlock`), the
 * arcade mute is honoured on every frame, and pause suspends the context. Without WebAudio it stays silent.
 */
export function createAudio(services: GameServices) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, failed = false, disposed = false, paused = false;
  let noise: AudioBuffer | null = null;
  let rollGain: GainNode | null = null, rollFilter: BiquadFilterNode | null = null, windGain: GainNode | null = null;
  let volume = 0.8;
  let lastClack = 0;

  function ensure(): AudioContext | null {
    if (disposed || failed) return null;
    if (ctx) { if (ctx.state === 'suspended' && !paused) void ctx.resume().catch(() => {}); return ctx; }
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) { failed = true; return null; }
    try {
      ctx = new Ctor();
      master = ctx.createGain(); master.gain.value = services.sound.muted ? 0 : volume;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5;
      master.connect(comp); comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noise.getChannelData(0); let seed = 99991;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
      // the roll: looping noise through a band-pass whose level follows the pebble's speed
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      rollFilter = ctx.createBiquadFilter(); rollFilter.type = 'bandpass'; rollFilter.frequency.value = 700; rollFilter.Q.value = 0.9;
      const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 2400;
      rollGain = ctx.createGain(); rollGain.gain.value = 0;
      src.connect(rollFilter); rollFilter.connect(low); low.connect(rollGain); rollGain.connect(master); src.start();
      // a faint garden breeze
      const wsrc = ctx.createBufferSource(); wsrc.buffer = noise; wsrc.loop = true; wsrc.playbackRate.value = 0.5;
      const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
      windGain = ctx.createGain(); windGain.gain.value = 0.035;
      wsrc.connect(wf); wf.connect(windGain); windGain.connect(master); wsrc.start();
      return ctx;
    } catch { failed = true; ctx = null; return null; }
  }

  function tone(freq: number, at: number, dur: number, vel: number, type: OscillatorType = 'sine', to?: number) {
    if (!ctx || !master) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vel, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.02);
  }
  function burst(at: number, dur: number, vel: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    if (!ctx || !master || !noise) return;
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vel, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.02);
  }

  const now = () => (ctx ? ctx.currentTime : 0);
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  const note = (n: number, root = 69) => 440 * Math.pow(2, (root + n - 69) / 12);

  return {
    unlock() { ensure(); },
    /** Called every frame with the fastest rolling pebble's speed (0 when all rest). */
    roll(speed: number, onGravel = false) {
      if (!ctx || !rollGain || !rollFilter || !master) return;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(services.sound.muted ? 0 : volume, t, 0.03);
      const v = Math.min(1, speed / 9);
      rollGain.gain.setTargetAtTime(speed > 0.08 ? 0.05 + v * 0.32 : 0, t, 0.05);
      rollFilter.frequency.setTargetAtTime((onGravel ? 1500 : 420) + v * 1300, t, 0.05);
    },
    hit(kind: 'wall' | 'stone' | 'ball' | 'gate', speed: number) {
      if (!ensure()) return;
      const t = now();
      if (t - lastClack < 0.035) return;
      lastClack = t;
      const v = Math.min(1, 0.15 + speed / 9);
      if (kind === 'wall' || kind === 'gate') { tone(kind === 'gate' ? 520 : 360, t, 0.12, 0.35 * v, 'triangle', 300); burst(t, 0.04, 0.4 * v, 1800, 1.5); }
      else if (kind === 'stone') { tone(820, t, 0.09, 0.3 * v, 'sine', 700); burst(t, 0.03, 0.5 * v, 3200, 2); }
      else { tone(2100, t, 0.05, 0.25 * v, 'sine'); tone(1350, t, 0.07, 0.2 * v, 'triangle'); burst(t, 0.02, 0.4 * v, 4200, 3); }
    },
    spring(speed: number) { if (!ensure()) return; const t = now(); const v = Math.min(1, 0.3 + speed / 8); tone(180, t, 0.32, 0.4 * v, 'sine', 420); tone(360, t + 0.02, 0.2, 0.12 * v, 'triangle', 700); },
    cup(ace: boolean) {
      if (!ensure()) return; const t = now();
      tone(310, t, 0.22, 0.5, 'sine', 170); burst(t, 0.06, 0.35, 900, 2);
      for (let i = 0; i < 3; i++) burst(t + 0.09 + i * (0.07 - i * 0.015), 0.03, 0.22 - i * 0.05, 2400, 4);
      const seq = ace ? [0, 2, 4, 5, 7] : [2, 4];
      seq.forEach((k, i) => tone(note(PENTA[k], 74), t + 0.28 + i * 0.09, ace ? 0.9 : 0.6, ace ? 0.2 : 0.14, 'sine'));
      if (ace) seq.forEach((k, i) => tone(note(PENTA[k] + 12, 74), t + 0.3 + i * 0.09, 0.7, 0.06, 'triangle'));
    },
    lip() { if (!ensure()) return; const t = now(); tone(500, t, 0.08, 0.15, 'triangle', 380); },
    splash() { if (!ensure()) return; const t = now(); burst(t, 0.5, 0.5, 2400, 0.7, 'lowpass', 300); tone(160, t, 0.25, 0.15, 'sine', 90); },
    pipe() { if (!ensure()) return; const t = now(); burst(t, 0.45, 0.35, 400, 3, 'bandpass', 1600); tone(140, t, 0.35, 0.12, 'sine', 260); },
    /** The ace's shishi-odoshi: the bamboo tube swings back onto its stone, a hollow "kon" that echoes round the garden. */
    kon() {
      if (!ensure()) return; const t = now();
      for (const [d, g] of [[0, 1], [0.21, 0.32], [0.43, 0.12]] as const) {
        tone(560, t + d, 0.34, 0.42 * g, 'sine', 505); tone(1130, t + d, 0.16, 0.14 * g, 'sine', 1060); tone(205, t + d, 0.22, 0.16 * g, 'triangle', 180);
        burst(t + d, 0.025, 0.3 * g, 2600, 3);
      }
    },
    /** The deer-scarer: a hollow bamboo knock as the arm drops. */
    bamboo() { if (!ensure()) return; const t = now(); tone(690, t, 0.16, 0.16, 'sine', 640); tone(1120, t, 0.08, 0.07, 'sine'); burst(t, 0.02, 0.12, 2000, 3); },
    shoot(power: number) { if (!ensure()) return; const t = now(); tone(240 + power * 120, t, 0.06, 0.2, 'triangle', 160); burst(t, 0.04, 0.25 + power * 0.2, 1400, 1.2); },
    ui() { if (!ensure()) return; tone(880, now(), 0.05, 0.08, 'sine'); },
    result(kind: 'great' | 'par' | 'over') {
      if (!ensure()) return; const t = now();
      const seq = kind === 'great' ? [0, 4, 7] : kind === 'par' ? [0, 4] : [4, 2];
      seq.forEach((k, i) => tone(note(PENTA[k], 67), t + i * 0.11, 0.5, 0.1, 'sine'));
    },
    setVolume(v: number) { volume = v; if (master && ctx) master.gain.setTargetAtTime(services.sound.muted ? 0 : volume, ctx.currentTime, 0.02); },
    pause() { paused = true; if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {}); },
    resume() { paused = false; if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {}); },
    dispose() { disposed = true; if (ctx) void ctx.close().catch(() => {}); ctx = null; }
  };
}
export type Audio = ReturnType<typeof createAudio>;
