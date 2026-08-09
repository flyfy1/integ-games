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
  constructor(private mutedState: boolean) {}
  get muted() { return this.mutedState; }
  setMuted(muted: boolean) { this.mutedState = muted; }
  play(kind: 'tap' | 'merge' | 'success' | 'fail' | 'move') {
    if (this.mutedState || typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const tones = { tap: 340, move: 220, merge: 520, success: 760, fail: 120 };
      oscillator.frequency.value = tones[kind];
      oscillator.type = kind === 'fail' ? 'sawtooth' : 'sine';
      gain.gain.setValueAtTime(0.05, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.07);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(); oscillator.stop(this.context.currentTime + 0.08);
    } catch { /* Audio activation can be unavailable; gameplay remains intact. */ }
  }
}

export type ShellServices = {
  createGameServices(slug: string, callbacks: { score(score: number): void; complete(progress?: number): void }): GameServices;
  getMuted(): boolean;
  setMuted(value: boolean): void;
  bestScore(slug: string): number;
  recordRecent(slug: string): void;
  recentlyPlayed(): string[];
};

export function createShellServices(): ShellServices {
  const shellStorage = storageFor('shell');
  let muted = shellStorage.get('muted', false);
  return {
    createGameServices(slug, callbacks) {
      const gameStorage = storageFor(`game:${slug}`);
      return {
        storage: gameStorage,
        sound: new Sound(muted),
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
    setMuted(value) { muted = value; shellStorage.set('muted', value); },
    bestScore: (slug) => shellStorage.get(`best:${slug}`, 0),
    recordRecent(slug) {
      const recent = shellStorage.get<string[]>('recent', []).filter((item) => item !== slug);
      shellStorage.set('recent', [slug, ...recent].slice(0, 6));
    },
    recentlyPlayed: () => shellStorage.get<string[]>('recent', [])
  };
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
