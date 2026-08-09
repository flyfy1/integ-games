import type { GameServices, GameSound, GameStorage } from './game-types';

const VERSION = 'v1';
const keyFor = (scope: string, key: string) => `integ-games:${VERSION}:${scope}:${key}`;

export function storageFor(scope: string): GameStorage {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(keyFor(scope, key));
        return raw === null ? fallback : JSON.parse(raw) as T;
      } catch { return fallback; }
    },
    set<T>(key: string, value: T) {
      try { localStorage.setItem(keyFor(scope, key), JSON.stringify(value)); } catch { /* storage is optional */ }
    },
    remove(key: string) { try { localStorage.removeItem(keyFor(scope, key)); } catch { /* storage is optional */ } }
  };
}

class Sound implements GameSound {
  private context: AudioContext | undefined;
  private lastCue = new Map<string, number>();
  private active = new Set<OscillatorNode>();
  constructor(private mutedState: boolean, private readonly theme: 'puzzle' | 'arcade' | 'action' | 'calm') {}
  get muted() { return this.mutedState; }
  setMuted(muted: boolean) { this.mutedState = muted; }
  stop() { this.active.forEach((node) => { try { node.stop(); } catch { /* already stopped */ } }); this.active.clear(); }
  play(kind: 'tap' | 'move' | 'merge' | 'collect' | 'clear' | 'jump' | 'shoot' | 'hit' | 'upgrade' | 'success' | 'fail') {
    if (this.mutedState || typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      const now = this.context.currentTime;
      const previous = this.lastCue.get(kind) ?? -Infinity;
      if (now - previous < (kind === 'move' ? .075 : .045)) return;
      this.lastCue.set(kind, now);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const tones = { tap: 340, move: 190, merge: 520, collect: 610, clear: 680, jump: 430, shoot: 330, hit: 150, upgrade: 720, success: 760, fail: 120 };
      oscillator.frequency.value = tones[kind];
      oscillator.type = this.theme === 'arcade' ? 'square' : this.theme === 'action' ? 'triangle' : 'sine';
      const duration = kind === 'success' || kind === 'fail' ? .18 : .11;
      gain.gain.setValueAtTime(kind === 'move' ? .025 : .05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.onended = () => this.active.delete(oscillator);
      this.active.add(oscillator); oscillator.start(); oscillator.stop(now + duration);
    } catch { /* Audio activation can be unavailable; gameplay remains intact. */ }
  }
}

export type ShellServices = {
  createGameServices(slug: string, callbacks: { score(score: number): void; complete(progress?: number): void }): GameServices;
  getMuted(): boolean;
  setMuted(value: boolean): void;
  stopActiveSound(): void;
  bestScore(slug: string): number;
  recordRecent(slug: string): void;
  recentlyPlayed(): string[];
};

export function createShellServices(): ShellServices {
  const shellStorage = storageFor('shell');
  let muted = shellStorage.get('muted', false);
  let activeSound: GameSound | undefined;
  return {
    createGameServices(slug, callbacks) {
      const gameStorage = storageFor(`game:${slug}`);
      const sound = new Sound(muted, soundTheme(slug));
      activeSound = sound;
      return {
        storage: gameStorage,
        sound,
        random: seededRandom(gameStorage.get('seed', Math.floor(Math.random() * 2 ** 31))),
        reportScore(score) {
          const best = Math.max(shellStorage.get(`best:${slug}`, 0), Math.round(score));
          shellStorage.set(`best:${slug}`, best);
          callbacks.score(score);
        },
        reportComplete: callbacks.complete,
        isReducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      };
    },
    getMuted: () => muted,
    setMuted(value) { muted = value; activeSound?.setMuted(value); if (value) activeSound?.stop(); shellStorage.set('muted', value); },
    stopActiveSound() { activeSound?.stop(); },
    bestScore: (slug) => shellStorage.get(`best:${slug}`, 0),
    recordRecent(slug) {
      const recent = shellStorage.get<string[]>('recent', []).filter((item) => item !== slug);
      shellStorage.set('recent', [slug, ...recent].slice(0, 6));
    },
    recentlyPlayed: () => shellStorage.get<string[]>('recent', [])
  };
}

function soundTheme(slug: string): 'puzzle' | 'arcade' | 'action' | 'calm' {
  if (['mines', 'solitaire', 'sudoku', 'word-grid', 'memory'].includes(slug)) return 'calm';
  if (['invaders', 'runner', 'platformer', 'arena', 'flap'].includes(slug)) return 'action';
  if (['block-drop', 'stack', 'breakout', 'drive', 'knife'].includes(slug)) return 'arcade';
  return 'puzzle';
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
