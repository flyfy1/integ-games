export type PelicanAudio = {
  jump(): void;
  fish(): void;
  star(): void;
  stomp(): void;
  spring(): void;
  hurt(): void;
  splash(): void;
  check(): void;
  win(): void;
  oneup(): void;
  crumble(): void;
  flap(): void;
  over(): void;
  click(): void;
  setTheme(theme: number): void;
  step(state: string): void;
  destroy(): void;
};

const SONGS = [
  { bpm: 138, root: 60, prog: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9], lead: 'square' as const, seed: 7 },
  { bpm: 124, root: 57, prog: [0, -4, -2, -5], scale: [0, 3, 5, 7, 10], lead: 'square' as const, seed: 21 },
  { bpm: 112, root: 62, prog: [0, -4, -7, -2], scale: [0, 3, 5, 7, 10], lead: 'triangle' as const, seed: 33 },
  { bpm: 146, root: 59, prog: [0, 3, -2, 5], scale: [0, 2, 3, 7, 10], lead: 'square' as const, seed: 48 }
];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const MELODIES = SONGS.map((s) => {
  const r = mulberry32(s.seed);
  const mel: (number | null)[] = [];
  for (let i = 0; i < 32; i++) {
    if (i % 8 === 0) {
      mel.push(s.scale[Math.floor(r() * 3)] + 12);
      continue;
    }
    mel.push((i % 2 === 0 || r() < 0.25) && r() < 0.8 ? s.scale[Math.floor(r() * 5)] + (r() < 0.3 ? 24 : 12) : null);
  }
  return mel;
});

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export function createPelicanAudio(getMuted: () => boolean): PelicanAudio {
  let actx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let curTheme = 0;
  let nextNote = 0;
  let mstep = 0;

  function initAudio() {
    if (getMuted()) return;
    if (actx) {
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      actx = new AudioCtx();
      master = actx.createGain();
      master.gain.value = 0.5;
      master.connect(actx.destination);
      sfxGain = actx.createGain();
      sfxGain.gain.value = 1;
      sfxGain.connect(master);
      musicGain = actx.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(master);
    } catch {
      actx = null;
    }
  }

  function tone(f: number, d: number, type: OscillatorType, vol: number, slide = 1, delay = 0, dest?: GainNode | null) {
    if (getMuted()) return;
    initAudio();
    if (!actx || !sfxGain) return;
    try {
      const t = actx.currentTime + (delay || 0);
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slide && slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol || 0.1, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      g.connect(dest || sfxGain);
      o.start(t);
      o.stop(t + d + 0.03);
    } catch {}
  }

  function noise(d: number, vol: number, freq = 1000, delay = 0, dest?: GainNode | null) {
    if (getMuted()) return;
    initAudio();
    if (!actx || !sfxGain) return;
    try {
      if (!noiseBuf) {
        noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
        const a = noiseBuf.getChannelData(0);
        for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
      }
      const t = actx.currentTime + (delay || 0);
      const s = actx.createBufferSource();
      s.buffer = noiseBuf;
      const f = actx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = actx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f);
      f.connect(g);
      g.connect(dest || sfxGain);
      s.start(t);
      s.stop(t + d + 0.02);
    } catch {}
  }

  return {
    jump() { tone(300, 0.14, 'square', 0.07, 2.2); },
    fish() { tone(1046, 0.07, 'square', 0.06); tone(1568, 0.1, 'square', 0.06, 1, 0.05); },
    star() { [784, 988, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, 1, i * 0.06)); },
    stomp() { tone(260, 0.14, 'square', 0.1, 0.45); noise(0.08, 0.15, 1500); },
    spring() { tone(180, 0.35, 'sine', 0.2, 4.5); tone(360, 0.25, 'triangle', 0.06, 3); },
    hurt() { tone(520, 0.45, 'sawtooth', 0.1, 0.2); noise(0.2, 0.15, 900); },
    splash() { noise(0.6, 0.3, 700); tone(200, 0.3, 'sine', 0.1, 0.4); },
    check() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'square', 0.06, 1, i * 0.08)); },
    win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'square', 0.07, 1, i * 0.11)); },
    oneup() { [660, 880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.1, 'triangle', 0.12, 1, i * 0.07)); },
    crumble() { noise(0.3, 0.12, 400); },
    flap() { noise(0.12, 0.05, 2500); },
    over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, 1, i * 0.22)); },
    click() { tone(880, 0.05, 'square', 0.05); },
    setTheme(th: number) { curTheme = Math.max(0, Math.min(SONGS.length - 1, th)); mstep = 0; },
    step(state: string) {
      if (getMuted() || !actx || !musicGain || !(state === 'playing' || state === 'title')) return;
      const song = SONGS[curTheme];
      const dur = 60 / song.bpm / 2;
      if (nextNote < actx.currentTime) nextNote = actx.currentTime + 0.05;
      while (nextNote < actx.currentTime + 0.15) {
        const i = mstep % 8, bar = Math.floor(mstep / 8) % 4, ch = song.root + song.prog[bar];
        const dl = nextNote - actx.currentTime;
        if (i % 2 === 0) tone(mtof(ch - 24 + (i === 4 ? 7 : i === 6 ? 12 : 0)), dur * 1.6, 'triangle', 0.32, 1, dl, musicGain);
        const m = MELODIES[curTheme][mstep % 32];
        if (m !== null) tone(mtof(song.root + m), dur * 1.4, song.lead, song.lead === 'square' ? 0.07 : 0.16, 1, dl, musicGain);
        if (i % 2 === 1) noise(0.04, 0.05, 6000, dl, musicGain);
        if (i === 0 || i === 4) noise(0.1, 0.12, 180, dl, musicGain);
        nextNote += dur;
        mstep++;
      }
    },
    destroy() {
      if (actx && actx.state !== 'closed') {
        actx.close().catch(() => {});
      }
      actx = null;
    }
  };
}
