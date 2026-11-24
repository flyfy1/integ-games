import type { GameServices } from '../../core/game-types';
import type { SimEvent } from './types';

/**
 * Synthesized audio. Nothing is loaded: every sound is oscillators and filtered noise built on demand.
 *
 * Music is a marching pizzicato: a plucked bass on the beat, a pentatonic tune, a counter-line and a woodblock. One
 * extra voice joins per 50 ants alive (`setColony`), so a big colony literally sounds bigger. Effects follow the sim:
 * crumbs pop into the nest with a rising pitch, the shoe lands with a thud, water splashes.
 *
 * Backends: WebAudio when available (the context is created on the first sound, inside a click, so iOS unlocks);
 * otherwise the arcade's shared cues (`services.sound`) and no music. `services.sound.muted` is honoured on every
 * call and polled by the scheduler.
 */
export type SfxName = 'ui' | 'select' | 'deny' | 'paint' | 'erase' | 'hatch' | 'pop' | 'bigpop' | 'bite' | 'death' | 'stomp' | 'warn' | 'splash' | 'gulp' | 'peck'
  | 'buzz' | 'alarm' | 'scatter' | 'rally' | 'recall' | 'win' | 'lose' | 'unlock' | 'dig' | 'bridge' | 'zap' | 'connect' | 'lift' | 'voice';
export type MusicScene = 'silence' | 'menu' | 'level' | 'boss' | 'endless' | 'night' | 'story';
export type Audio = {
  sfx(name: SfxName, pitch?: number): void;
  music(scene: MusicScene | string): void;
  handle(event: SimEvent): void;
  setColony(ants: number, tension: number): void;
  setVolumes(v: Partial<{ music: number; sfx: number }>): void;
  pause(): void; resume(): void; dispose(): void;
  readonly backend: 'webaudio' | 'shared';
  readonly scene: string;
};

const SCALES: Record<string, number[]> = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10], night: [0, 2, 3, 7, 8] };
const TUNE = [0, 2, 4, 2, 3, 4, 1, 0, 2, 4, 5, 4, 3, 2, 1, -1];
const COUNTER = [4, -1, 5, -1, 3, -1, 2, -1, 4, -1, 6, -1, 5, -1, 3, -1];

export function createAudio(services: GameServices, volumes: { music: number; sfx: number }): Audio {
  type Ctx = AudioContext;
  const Ctor: (new () => Ctx) | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext) : undefined;
  let ctx: Ctx | null = null, master: GainNode | null = null, musicBus: GainNode | null = null, sfxBus: GainNode | null = null, noise: AudioBuffer | null = null;
  let vol = { ...volumes }, scene = 'silence', paused = false, disposed = false, timer: ReturnType<typeof setInterval> | null = null;
  let nextBeat = 0, beat = 0, ants = 0, tension = 0, popStreak = 0, lastPop = 0;
  const lastPlayed = new Map<string, number>();
  const muted = () => services.sound.muted;

  function ensure(): boolean {
    if (disposed || !Ctor) return false;
    if (!ctx) {
      try {
        ctx = new Ctor();
        master = ctx.createGain(); master.gain.value = 0.8;
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp).connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(master);
        sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx * 0.7; sfxBus.connect(master);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0); let seed = 1;
        for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
        timer = setInterval(schedule, 50);
      } catch { ctx = null; return false; }
    }
    if (ctx.state === 'suspended' && !paused) void ctx.resume().catch(() => undefined);
    return true;
  }

  function tone(type: OscillatorType, freq: number, start: number, dur: number, gain: number, bus: GainNode, opts: { to?: number; attack?: number; filter?: number } = {}): void {
    if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, start);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let node: AudioNode = osc;
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; osc.connect(f); node = f; }
    node.connect(g).connect(bus);
    osc.start(start); osc.stop(start + dur + 0.02);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  function hiss(start: number, dur: number, gain: number, bus: GainNode, freq: number, type: BiquadFilterType = 'bandpass', q = 1): void {
    if (!ctx || !noise) return;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(start, Math.random() * 0.5); src.stop(start + dur + 0.02);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

  // ------------------------------------------------------------ music
  function schedule(): void {
    if (!ctx || paused || disposed || !musicBus) return;
    if (muted()) { musicBus.gain.value = 0; return; }
    musicBus.gain.value = vol.music * 0.5;
    if (scene === 'silence') return;
    const bpm = scene === 'boss' ? 128 : scene === 'menu' || scene === 'story' ? 96 : scene === 'night' ? 92 : 112;
    const sixteenth = 60 / bpm / 4;
    if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
    while (nextBeat < ctx.currentTime + 0.2) { playStep(beat, nextBeat, sixteenth); beat++; nextBeat += sixteenth; }
  }
  function playStep(i: number, at: number, len: number): void {
    if (!musicBus) return;
    const scale = SCALES[scene === 'boss' ? 'minor' : scene === 'night' ? 'night' : 'major'];
    const root = scene === 'night' ? 50 : scene === 'boss' ? 52 : 55;
    const bar = Math.floor(i / 16) % 4, s = i % 16;
    const chord = [0, 3, 4, 0][bar];
    const note = (deg: number, oct = 0) => { const d = deg + chord; return midi(root + 12 * oct + scale[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5)); };
    const voices = scene === 'menu' || scene === 'story' ? 2 : 1 + Math.min(3, Math.floor(ants / 50));
    // Bass pluck on beats.
    if (s % 4 === 0) tone('triangle', note(0, -1), at, len * 3, 0.22, musicBus, { filter: 900 });
    if (s % 8 === 6 && voices >= 1) tone('triangle', note(2, -1), at, len * 1.5, 0.12, musicBus, { filter: 900 });
    // Tune: plucked, every other sixteenth.
    if (s % 2 === 0 && scene !== 'story') { const deg = TUNE[(s / 2 + bar * 3) % TUNE.length]; if (deg >= 0) tone('sine', note(deg, 1), at, len * 1.6, 0.11, musicBus); }
    if (voices >= 2 && s % 2 === 0) { const deg = COUNTER[(s + bar * 2) % 16]; if (deg >= 0) tone('square', note(deg, 0), at, len * 0.9, 0.025, musicBus, { filter: 1800 }); }
    if (voices >= 3 && (s === 2 || s === 10)) tone('sine', note(4, 2), at, len * 0.8, 0.05, musicBus);
    // Woodblock march.
    if (scene !== 'story' && scene !== 'menu' && (s % 4 === 2 || (voices >= 4 && s % 2 === 1))) hiss(at, 0.04, 0.12, musicBus, 1800 + (s % 4) * 300, 'bandpass', 6);
    if (tension > 0.6 && s % 4 === 0) tone('sawtooth', note(0, -2), at, len * 2, 0.04 * tension, musicBus, { filter: 400 });
  }

  // ------------------------------------------------------------ effects
  function play(name: SfxName, pitch = 1): void {
    if (muted() || vol.sfx <= 0) return;
    if (!ensure() || !ctx || !sfxBus) { fallback(name); return; }
    const now = ctx.currentTime;
    const gap = name === 'paint' || name === 'bite' || name === 'pop' ? 0.035 : 0.06;
    if (now - (lastPlayed.get(name) ?? -1) < gap) return;
    lastPlayed.set(name, now);
    const b = sfxBus;
    switch (name) {
      case 'ui': tone('sine', 660, now, 0.08, 0.15, b); break;
      case 'select': tone('triangle', 520, now, 0.07, 0.15, b, { to: 780 }); break;
      case 'deny': tone('square', 180, now, 0.12, 0.06, b, { filter: 800 }); tone('square', 150, now + 0.06, 0.12, 0.05, b, { filter: 800 }); break;
      case 'paint': tone('sine', 900 * pitch, now, 0.05, 0.05, b); break;
      case 'erase': hiss(now, 0.12, 0.2, b, 3000, 'highpass'); break;
      case 'hatch': tone('sine', 300, now, 0.12, 0.18, b, { to: 700 }); tone('sine', 450, now + 0.05, 0.1, 0.1, b, { to: 900 }); break;
      case 'pop': tone('triangle', 520 * pitch, now, 0.1, 0.13, b, { to: 700 * pitch }); break;
      case 'bigpop': [0, 4, 7, 12].forEach((n, i) => tone('triangle', midi(72 + n), now + i * 0.06, 0.25, 0.14, b)); break;
      case 'bite': hiss(now, 0.03, 0.08, b, 2500, 'bandpass', 3); break;
      case 'death': tone('sine', 700, now, 0.25, 0.08, b, { to: 260 }); break;
      case 'stomp': tone('sine', 90, now, 0.35, 0.6, b, { to: 40 }); hiss(now, 0.3, 0.4, b, 300, 'lowpass'); break;
      case 'warn': tone('square', 880, now, 0.1, 0.06, b, { filter: 2000 }); tone('square', 660, now + 0.13, 0.12, 0.06, b, { filter: 2000 }); break;
      case 'splash': hiss(now, 0.35, 0.25, b, 1500, 'bandpass', 0.7); break;
      case 'gulp': tone('sine', 220, now, 0.18, 0.3, b, { to: 90 }); break;
      case 'peck': hiss(now, 0.05, 0.3, b, 2200, 'bandpass', 4); tone('square', 1200, now, 0.04, 0.05, b); break;
      case 'buzz': tone('sawtooth', 110, now, 0.4, 0.07, b, { filter: 700 }); break;
      case 'alarm': tone('sine', 520, now, 0.15, 0.12, b, { to: 980 }); tone('sine', 980, now + 0.16, 0.15, 0.12, b, { to: 520 }); break;
      case 'scatter': hiss(now, 0.3, 0.25, b, 4000, 'highpass'); tone('sine', 900, now, 0.2, 0.05, b, { to: 300 }); break;
      case 'rally': [0, 4, 7].forEach((n, i) => tone('square', midi(60 + n), now + i * 0.08, 0.18, 0.06, b, { filter: 1800 })); break;
      case 'recall': tone('sine', midi(79), now, 0.5, 0.12, b); tone('sine', midi(72), now + 0.15, 0.6, 0.1, b); break;
      case 'win': [0, 4, 7, 12, 16].forEach((n, i) => tone('triangle', midi(67 + n), now + i * 0.1, 0.35, 0.14, b)); break;
      case 'lose': [7, 4, 0, -5].forEach((n, i) => tone('triangle', midi(64 + n), now + i * 0.16, 0.35, 0.12, b)); break;
      case 'unlock': [0, 7, 12, 19].forEach((n, i) => tone('sine', midi(76 + n), now + i * 0.07, 0.3, 0.1, b)); break;
      case 'dig': hiss(now, 0.12, 0.15, b, 500, 'lowpass'); break;
      case 'bridge': tone('triangle', 330, now, 0.15, 0.12, b, { to: 495 }); break;
      case 'zap': hiss(now, 0.1, 0.2, b, 5000, 'highpass'); tone('sawtooth', 1400, now, 0.08, 0.05, b); break;
      case 'connect': tone('sine', 660, now, 0.1, 0.1, b); tone('sine', 990, now + 0.07, 0.14, 0.1, b); break;
      case 'lift': tone('triangle', 200, now, 0.3, 0.15, b, { to: 400 }); break;
      case 'voice': tone('sine', 300 * pitch + Math.random() * 60, now, 0.05, 0.05, b); break;
    }
  }
  function fallback(name: SfxName): void {
    const map: Partial<Record<SfxName, Parameters<GameServices['sound']['play']>[0]>> = { ui: 'tap', select: 'tap', deny: 'fail', hatch: 'upgrade', pop: 'collect', bigpop: 'clear', death: 'hit', stomp: 'hit', win: 'success', lose: 'fail', unlock: 'upgrade', connect: 'merge' };
    const kind = map[name];
    if (kind) try { services.sound.play(kind); } catch { /* optional */ }
  }

  const audio: Audio = {
    get backend() { return Ctor ? 'webaudio' : 'shared'; },
    get scene() { return scene; },
    sfx: play,
    music(next) { scene = next; if (next !== 'silence') ensure(); },
    setColony(n, t) { ants = n; tension = t; },
    handle(event) {
      switch (event.type) {
        case 'paint': play('paint', 0.9 + (event.cell % 5) * 0.06); break;
        case 'erase': play('erase'); break;
        case 'hatch': play('hatch'); break;
        case 'deliver': {
          const now = ctx?.currentTime ?? 0;
          popStreak = now - lastPop < 1.2 ? Math.min(12, popStreak + 1) : 0; lastPop = now;
          play(event.big ? 'bigpop' : 'pop', Math.pow(2, popStreak / 12)); break;
        }
        case 'bite': play('bite'); break;
        case 'death': play('death'); break;
        case 'connect': play('connect'); break;
        case 'lift': play('lift'); break;
        case 'alert': play('alarm'); break;
        case 'warn': play('warn'); break;
        case 'strike':
          if (event.kind === 'stomp') play('stomp');
          else if (event.kind === 'tongue') play('gulp');
          else if (event.kind === 'sparrow') play('peck');
          else if (event.kind === 'dive' || event.kind === 'sprinkler') play('splash');
          else if (event.kind === 'mower') play('buzz');
          else if (event.kind === 'zap' || event.kind === 'sun') play('zap');
          break;
        case 'washed': play('splash'); break;
        case 'queen': play(event.call); break;
        case 'dig': play('dig'); break;
        case 'bridge': play('bridge'); break;
        case 'lamp': play('zap'); break;
        case 'end': play(event.won ? 'win' : 'lose'); break;
        case 'nest': play('stomp'); break;
      }
    },
    setVolumes(v) { vol = { ...vol, ...v }; if (musicBus) musicBus.gain.value = vol.music * 0.5; if (sfxBus) sfxBus.gain.value = vol.sfx * 0.7; },
    pause() { paused = true; if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined); },
    resume() { paused = false; if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined); nextBeat = 0; },
    dispose() { disposed = true; if (timer) clearInterval(timer); timer = null; if (ctx) void ctx.close().catch(() => undefined); ctx = null; }
  };
  return audio;
}
