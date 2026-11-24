import type { GameServices } from '../../core/game-types';

/**
 * Synthesised pond sounds: a croak per frog (pitched per seat), hop blips, a woody thunk for a shove, a rubbery
 * boing for a bounce, a noise splash, a soft tick for the last seconds of planning and a little fanfare.
 * The AudioContext is created lazily on the first gesture, honours the arcade mute, and is silent without WebAudio.
 */
const SEAT_PITCH = [196, 247, 165, 294, 220, 131];

export function createAudio(services: GameServices) {
  let ctx: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null, failed = false, disposed = false;
  function ensure(): AudioContext | null {
    if (disposed || failed) return null;
    if (ctx) { if (ctx.state === 'suspended') void ctx.resume().catch(() => {}); return ctx; }
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) { failed = true; return null; }
    try {
      ctx = new Ctor();
      master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const d = noise.getChannelData(0); let seed = 99;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
      return ctx;
    } catch { failed = true; return null; }
  }
  const live = () => (services.sound.muted ? null : ensure());
  function tone(freq: number, dur: number, vel: number, type: OscillatorType, to?: number, delay = 0) {
    const c = live(); if (!c || !master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur: number, vel: number, freq: number, delay = 0) {
    const c = live(); if (!c || !master || !noise) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq * 0.35, t + dur); f.Q.value = 0.8;
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  return {
    unlock() { ensure(); },
    croak(seat: number, delay = 0) {
      const p = SEAT_PITCH[seat % SEAT_PITCH.length];
      tone(p, 0.09, 0.12, 'sawtooth', p * 0.7, delay); tone(p * 1.02, 0.12, 0.1, 'square', p * 0.6, delay + 0.08);
    },
    hop(seat: number) { const p = SEAT_PITCH[seat % SEAT_PITCH.length] * 2; tone(p, 0.12, 0.06, 'sine', p * 1.6); },
    shove() { tone(150, 0.14, 0.2, 'triangle', 70); hiss(0.06, 0.08, 1200); },
    bounce() { tone(330, 0.22, 0.12, 'sine', 140); tone(500, 0.12, 0.05, 'triangle', 260, 0.05); },
    splash() { hiss(0.5, 0.28, 2400); tone(420, 0.18, 0.06, 'sine', 120); },
    brace() { tone(110, 0.1, 0.12, 'square', 90); },
    sink() { tone(220, 0.6, 0.08, 'sine', 70); hiss(0.6, 0.08, 600); },
    tick(urgent: boolean) { tone(urgent ? 1200 : 900, 0.04, 0.05, 'square'); },
    tap() { tone(660, 0.05, 0.05, 'triangle'); },
    eat() { tone(880, 0.08, 0.08, 'triangle', 1320); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 0.09, 'triangle', undefined, i * 0.11)); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 0.07, 'triangle', undefined, i * 0.14)); },
    pause() { if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {}); },
    dispose() { disposed = true; if (ctx) void ctx.close().catch(() => {}); ctx = null; }
  };
}
export type Audio = ReturnType<typeof createAudio>;
