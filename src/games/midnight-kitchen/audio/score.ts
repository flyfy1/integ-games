import type { InstrumentName } from './instruments';

/**
 * Midnight Kitchen score. One 16-bar lullaby ("the midnight theme") written in scale degrees, so every track can
 * play it in its own key and mode: major for the menu, Dorian for the sink, Mixolydian for the stove, minor for the
 * pantry, Lydian for the fridge, harmonic minor for the bosses. The finale changes mode while it plays (minor ->
 * Dorian -> major) as the Bloom is remembered. Each track = key + mode + tempo + form (a sequence of 8-bar sections)
 * + parts (small pattern functions on a 16th-note grid). Parts sit on intensity layers 0-3 that the engine fades
 * in and out with the fight.
 */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11]
} as const;
export type Scale = readonly number[];

export type Note = { inst: InstrumentName; midi: number; steps: number; vel: number };
export type MelodyEvent = { slot: number; deg: number; len: number };

export type StepCtx = {
  /** Absolute bar since the track started; `cycle` counts trips through the whole form. */
  abs: number; cycle: number; step: number;
  section: string; sectionIndex: number; barInSection: number;
  /** Chord degree of this bar. */
  chord: number;
  /** Melody note starting on this 8th (only on even steps), if the section has a melody. */
  melody: MelodyEvent | null;
  /** Degree -> MIDI in the current key and mode (`oct` octaves up/down). */
  note(deg: number, oct?: number): number;
  /** Chord tones of the current bar as degrees (triad, or 7th chord when `seventh`). */
  tones(seventh?: boolean): number[];
  rng: () => number;
  /** Finale/endless story state set by the conductor (0 = start). */
  mood: number;
};

export type Part = { layer: number; play(c: StepCtx): Note[] | Note | null | undefined | void };
export type Section = { chords: number[]; melody?: MelodyEvent[][] };
export type TrackDef = {
  bpm: number;
  /** Delay applied to every off-beat 8th, in 16th steps (0.67 = triplet swing). */
  swing?: number;
  key: number;
  scale: Scale | ((mood: number) => Scale);
  form: string[];
  sections: Record<string, Section>;
  parts: Part[];
  /** Reverb send 0..1 and overall level. */
  reverb: number; gain: number;
  /** Stingers play their form once. */
  loop: boolean;
  /** Fixed intensity for scenes the fight does not drive (menu, story). */
  intensity?: number;
};

// ------------------------------------------------------------------ the theme

/** 8 slots (8th notes) per bar, bars split by `|`. Numbers are scale degrees, `-` holds, `.` rests. */
export function melody(text: string): MelodyEvent[][] {
  return text.split('|').map(bar => {
    const tokens = bar.trim().split(/\s+/), events: MelodyEvent[] = [];
    tokens.forEach((token, slot) => {
      if (token === '-') { if (events.length) events[events.length - 1].len++; return; }
      if (token === '.') return;
      events.push({ slot, deg: Number(token), len: 1 });
    });
    // A held note never runs past the bar line it started in.
    for (const e of events) e.len = Math.min(e.len, 8 - e.slot);
    return events;
  });
}

const THEME_A = melody('2 - 4 2 1 - 0 - | 1 - 2 3 2 - - - | 5 - 4 2 3 - 1 - | 2 - 1 - 4 - - - | 2 - 4 2 1 - 0 - | 1 - 2 3 5 - - - | 4 - 3 2 1 - 2 3 | 0 - - - . . . .');
const THEME_B = melody('5 - 7 - 6 5 4 - | 3 - 5 - 4 3 2 - | 2 - 4 - 7 - 5 - | 4 - - - . . 4 5 | 5 - 7 - 6 5 4 - | 3 - 5 - 4 3 2 - | 1 - 3 2 1 - -1 - | 0 - - - . . . .');
/** Counter line the high layers trade with the theme. */
const COUNTER = melody('. . 7 - 6 - 4 - | . . 6 - 5 - 3 - | . . 5 - 6 - 7 - | 8 - 7 - 6 - . . | . . 7 - 9 - 7 - | . . 6 - 8 - 6 - | . . 7 6 5 - 4 - | 7 - - - . . . .');
const CHORDS_A = [0, 1, 3, 4, 0, 1, 4, 0];
const CHORDS_B = [5, 3, 0, 4, 5, 3, 4, 0];
const A: Section = { chords: CHORDS_A, melody: THEME_A };
const B: Section = { chords: CHORDS_B, melody: THEME_B };
/** Same harmony, no melody: lets the ear breathe. */
const I: Section = { chords: CHORDS_A };
const J: Section = { chords: CHORDS_B };

// ------------------------------------------------------------------ part helpers

type Pick = (c: StepCtx) => boolean;
const always: Pick = () => true;

/** Theme player: `variant` can thin it to the strong beats, lift an octave or rest for a phrase. */
function lead(inst: InstrumentName, layer: number, oct: number, vel: number, variant: (c: StepCtx) => 'full' | 'sparse' | 'high' | 'rest' = () => 'full'): Part {
  return {
    layer,
    play(c) {
      if (c.step % 2 || !c.melody) return;
      const v = variant(c);
      if (v === 'rest') return;
      if (v === 'sparse' && c.melody.slot % 4 !== 0) return;
      const len = v === 'sparse' ? Math.max(c.melody.len, 2) : c.melody.len;
      return { inst, midi: c.note(c.melody.deg, oct + (v === 'high' ? 1 : 0)), steps: len * 2, vel: vel * (c.melody.slot === 0 ? 1 : 0.85) * (0.92 + c.rng() * 0.16) };
    }
  };
}

/** A fixed line (like the counter melody) indexed by bar within the section. */
function line(inst: InstrumentName, layer: number, bars: MelodyEvent[][], oct: number, vel: number, when: Pick = always): Part {
  return {
    layer,
    play(c) {
      if (c.step % 2 || !when(c)) return;
      const bar = bars[c.barInSection % bars.length], e = bar.find(ev => ev.slot === c.step / 2);
      if (!e) return;
      return { inst, midi: c.note(e.deg, oct), steps: e.len * 2, vel: vel * (0.9 + c.rng() * 0.2) };
    }
  };
}

/** Bass: `pattern` maps a 16th step to an offset from the chord root, in scale degrees. */
function bassline(inst: InstrumentName, layer: number, oct: number, vel: number, pattern: Record<number, number>, len = 4, when: Pick = always): Part {
  return {
    layer,
    play(c) {
      const off = pattern[c.step];
      if (off === undefined || !when(c)) return;
      return { inst, midi: c.note(c.chord + off, oct), steps: len, vel: vel * (c.step === 0 ? 1 : 0.85) };
    }
  };
}

/** Broken chords: `order` lists chord-tone indices; one note per `every` steps. */
function arp(inst: InstrumentName, layer: number, oct: number, vel: number, every: number, order: number[], when: Pick = always, seventh = false, len = every): Part {
  return {
    layer,
    play(c) {
      if (c.step % every || !when(c)) return;
      const tones = c.tones(seventh), i = order[(c.step / every) % order.length];
      const deg = tones[i % tones.length] + 7 * Math.floor(i / tones.length);
      return { inst, midi: c.note(deg, oct), steps: len, vel: vel * (c.step % 8 === 0 ? 1 : 0.8) * (0.9 + c.rng() * 0.2) };
    }
  };
}

/** Held chord at the bar line (pads). */
function chords(inst: InstrumentName, layer: number, oct: number, vel: number, seventh = false, steps = 16, at: number[] = [0]): Part {
  return {
    layer,
    play(c) {
      if (!at.includes(c.step)) return;
      return c.tones(seventh).map(deg => ({ inst, midi: c.note(deg, oct), steps, vel }));
    }
  };
}

/** Drum line from a 16-char pattern: `x` accent, `o` soft, `.` rest. `midi` colours pitched percussion. */
function drums(inst: InstrumentName, layer: number, pattern: string, vel: number, midi = 60, when: Pick = always, humanize = 0.15): Part {
  return {
    layer,
    play(c) {
      const ch = pattern[c.step % pattern.length];
      if (ch === '.' || ch === undefined || !when(c)) return;
      return { inst, midi, steps: 1, vel: vel * (ch === 'x' ? 1 : 0.55) * (1 - humanize / 2 + c.rng() * humanize) };
    }
  };
}

const inSection = (...names: string[]): Pick => c => names.includes(c.section);
const notLastBar: Pick = c => c.barInSection !== 7;
const lastBar: Pick = c => c.barInSection === 7;

// ------------------------------------------------------------------ tracks

const menu: TrackDef = {
  bpm: 84, swing: 0.25, key: 65, scale: SCALES.major, form: ['I', 'A', 'B', 'A', 'J'], sections: { A, B, I, J },
  reverb: 0.35, gain: 1, loop: true, intensity: 0.5,
  parts: [
    chords('pad', 0, -1, 0.8, true),
    bassline('bass', 0, -2, 0.8, { 0: 0, 8: 4, 14: 0 }, 6),
    lead('keys', 0, 0, 0.75, c => (c.cycle % 3 === 2 && c.section === 'A' && c.sectionIndex === 1 ? 'high' : 'full')),
    arp('keys', 1, -1, 0.35, 2, [0, 1, 2, 1, 3, 2, 1, 2], inSection('I', 'J', 'B')),
    drums('brush', 1, 'x...o...x...o..o', 0.6, 60, c => c.section !== 'I' || c.cycle > 0),
    line('musicbox', 2, COUNTER, 1, 0.6, inSection('B'))
  ]
};

const story: TrackDef = {
  bpm: 70, key: 65, scale: SCALES.major, form: ['I', 'A', 'J', 'B'], sections: { A, B, I, J },
  reverb: 0.5, gain: 1.05, loop: true, intensity: 0.2,
  parts: [
    chords('pad', 0, -1, 0.7, true, 16),
    bassline('bass', 0, -2, 0.55, { 0: 0 }, 14),
    lead('musicbox', 0, 1, 0.65, c => (c.cycle % 2 ? 'sparse' : 'full')),
    arp('celesta', 0, 0, 0.45, 4, [0, 2, 1, 2], inSection('I', 'J'))
  ]
};

/** Chapter 1 - Countertop: bright C major, marimba bounce and pizzicato. */
const countertop: TrackDef = {
  bpm: 100, key: 60, scale: SCALES.major, form: ['I', 'A', 'B', 'J', 'A'], sections: { A, B, I, J },
  reverb: 0.22, gain: 1.7, loop: true,
  parts: [
    arp('marimba', 0, 0, 0.55, 2, [0, 2, 1, 2, 0, 2, 1, 3]),
    bassline('pizz', 0, -2, 0.85, { 0: 0, 4: 4, 8: 0, 12: 4 }),
    chords('pad', 0, -1, 0.35),
    lead('marimba', 1, 1, 0.85, c => (c.cycle % 2 && c.section === 'B' ? 'sparse' : 'full')),
    drums('shaker', 1, '..o...o...o...o.', 0.8),
    drums('wood', 1, 'x.......x..o....', 0.55, 84),
    line('keys', 2, COUNTER, 0, 0.55, inSection('A', 'B')),
    drums('kick', 2, 'x.......x.......', 0.6),
    drums('wood', 3, '....x.......x...', 0.5, 79)
  ]
};

/** Chapter 2 - Sink: D Dorian, watery plucks, drips, round bass. */
const sink: TrackDef = {
  bpm: 92, key: 62, scale: SCALES.dorian, form: ['I', 'A', 'J', 'B', 'A'], sections: { A, B, I, J },
  reverb: 0.4, gain: 1.15, loop: true,
  parts: [
    arp('pluck', 0, 0, 0.5, 2, [0, 1, 2, 3, 2, 1, 2, 4], always, true),
    bassline('bass', 0, -2, 0.8, { 0: 0, 6: 0, 10: 4 }, 4),
    chords('glass', 0, 0, 0.5, false),
    { layer: 0, play: c => (c.step % 4 === 3 && c.rng() < 0.18 ? { inst: 'drip', midi: c.note(7 + Math.floor(c.rng() * 5), 1), steps: 1, vel: 0.7 + c.rng() * 0.3 } : null) },
    lead('pluck', 1, 1, 0.8, c => (c.cycle % 3 === 1 ? 'sparse' : 'full')),
    drums('shaker', 1, 'o.o.x.o.o.o.x.o.', 0.55),
    line('celesta', 2, COUNTER, 1, 0.55, inSection('A', 'B')),
    drums('kick', 2, 'x.....x...x.....', 0.55),
    drums('wood', 3, '....x.......x..o', 0.45, 76)
  ]
};

/** Chapter 3 - Stove: B-flat Mixolydian, swung, electric piano and sizzling hats. */
const stove: TrackDef = {
  bpm: 96, swing: 0.6, key: 58, scale: SCALES.mixolydian, form: ['I', 'A', 'B', 'A', 'J'], sections: { A, B, I, J },
  reverb: 0.25, gain: 1.08, loop: true,
  parts: [
    chords('keys', 0, 0, 0.45, true, 3, [2, 10]),
    bassline('bass', 0, -2, 0.85, { 0: 0, 4: 2, 8: 4, 12: 5 }, 4),
    drums('sizzle', 0, '..x...x...x...x.', 0.7),
    lead('reed', 1, 0, 0.9, c => (c.cycle % 2 && c.section === 'A' && c.sectionIndex > 1 ? 'high' : 'full')),
    drums('brush', 1, '....x.......x...', 0.7),
    chords('pad', 1, -1, 0.35, true),
    line('keys', 2, COUNTER, 1, 0.5, inSection('A', 'B')),
    drums('kick', 2, 'x.........x.....', 0.6),
    drums('hat', 3, 'x.o.x.o.x.o.x.oo', 0.6)
  ]
};

/** Chapter 4 - Pantry: E minor, tiptoe pizzicato, woodblocks, a muted reed. */
const pantry: TrackDef = {
  bpm: 84, key: 64, scale: SCALES.minor, form: ['I', 'A', 'J', 'B'], sections: { A, B, I, J },
  reverb: 0.2, gain: 1.9, loop: true,
  parts: [
    bassline('pizz', 0, -2, 0.85, { 0: 0, 3: 4, 6: 2, 10: 0, 12: 4 }),
    drums('wood', 0, 'x..o..x...o..o..', 0.45, 88),
    chords('pad', 0, -1, 0.3),
    lead('reed', 1, 0, 0.85, c => (c.section === 'A' && c.cycle % 2 ? 'sparse' : 'full')),
    arp('pizz', 1, 0, 0.35, 4, [0, 1, 2, 1], inSection('I', 'J')),
    drums('tom', 2, 'x.......o.......', 0.55, 45),
    drums('shaker', 2, '..o...o...o...o.', 0.6),
    line('celesta', 3, COUNTER, 0, 0.5, inSection('A', 'B'))
  ]
};

/** Chapter 5 - Inside the Fridge: A Lydian, slow, glassy, a music box. */
const fridge: TrackDef = {
  bpm: 68, key: 69, scale: SCALES.lydian, form: ['I', 'A', 'J', 'B'], sections: { A, B, I, J },
  reverb: 0.6, gain: 0.66, loop: true,
  parts: [
    chords('glass', 0, -1, 0.85, true),
    bassline('bass', 0, -2, 0.55, { 0: 0, 8: 4 }, 8),
    lead('musicbox', 0, 1, 0.7, c => (c.cycle % 2 ? 'sparse' : 'full')),
    arp('celesta', 1, 1, 0.45, 4, [0, 2, 1, 3]),
    drums('tick', 1, 'x...o...x...o...', 0.4, 96),
    line('glass', 2, COUNTER, 0, 0.5, inSection('A', 'B')),
    drums('tom', 3, 'x.......x.......', 0.35, 40)
  ]
};

/** Boss fight: D harmonic minor with drive; riff sections alternate with the theme turned dark. */
const RIFF: Section = { chords: [0, 0, 5, 4, 0, 0, 5, 4] };
const boss: TrackDef = {
  bpm: 126, key: 62, scale: SCALES.harmonic, form: ['R', 'A', 'R', 'B'], sections: { A, B, R: RIFF },
  reverb: 0.18, gain: 1.6, loop: true,
  parts: [
    bassline('drivebass', 0, -2, 0.75, { 0: 0, 2: 0, 4: 0, 6: 7, 8: 0, 10: 0, 12: 4, 14: 7 }, 2),
    drums('kick', 0, 'x...x...x...x...', 0.75),
    chords('pad', 0, -1, 0.5),
    lead('lead', 1, 0, 0.85),
    { layer: 1, play: c => (c.section === 'R' && c.step % 2 === 0 ? { inst: 'lead', midi: c.note([0, 2, 4, 2, 7, 4, 2, 1][c.step / 2] + c.chord, 0), steps: 2, vel: 0.55 } : null) },
    drums('snare', 1, '....x.......x...', 0.75),
    chords('brass', 2, 0, 0.7, false, 2, [0, 6]),
    drums('hat', 2, 'xoxoxoxoxoxoxoxo', 0.6),
    drums('tom', 3, '........x.x.xxxx', 0.6, 50, lastBar),
    drums('snare', 3, '..............o.', 0.5, 60, notLastBar)
  ]
};

/** The finale: the theme in F, minor (forgotten) -> Dorian (remembering) -> major (warm) with `mood`. */
const finale: TrackDef = {
  bpm: 80, key: 65, scale: mood => (mood >= 2 ? SCALES.major : mood >= 1 ? SCALES.dorian : SCALES.minor),
  form: ['I', 'A', 'B', 'A', 'J'], sections: { A, B, I, J },
  reverb: 0.45, gain: 0.9, loop: true,
  parts: [
    chords('pad', 0, -1, 0.75, true),
    bassline('bass', 0, -2, 0.7, { 0: 0, 8: 4 }, 8),
    lead('flute', 0, 0, 0.8, c => (c.mood >= 2 && c.section === 'A' && c.sectionIndex === 3 ? 'high' : 'full')),
    arp('musicbox', 1, 0, 0.4, 4, [0, 1, 2, 3], inSection('I', 'J'), true),
    drums('brush', 1, 'x.......o.......', 0.5),
    line('celesta', 2, COUNTER, 1, 0.5, c => c.mood >= 1 && (c.section === 'A' || c.section === 'B')),
    drums('kick', 2, 'x.......x.......', 0.45, 60, c => c.mood >= 1),
    chords('keys', 3, 0, 0.35, true, 3, [4, 12])
  ]
};

/** Endless: G major groove that adds a layer as the waves climb. */
const C_SEC: Section = { chords: [3, 4, 2, 5, 3, 4, 0, 0] };
const endless: TrackDef = {
  bpm: 104, swing: 0.2, key: 67, scale: SCALES.major, form: ['I', 'A', 'C', 'B', 'A'], sections: { A, B, I, J, C: C_SEC },
  reverb: 0.25, gain: 1.2, loop: true,
  parts: [
    chords('pad', 0, -1, 0.55, true),
    bassline('bass', 0, -2, 0.85, { 0: 0, 6: 0, 8: 4, 14: 5 }, 3),
    drums('hat', 1, '..x...x...x...x.', 0.6),
    arp('pluck', 1, 0, 0.4, 2, [0, 1, 2, 1, 3, 2, 1, 2]),
    lead('keys', 2, 0, 0.8, c => (c.cycle % 2 ? 'high' : 'full')),
    drums('snare', 2, '....x.......x...', 0.5),
    drums('kick', 3, 'x.....x...x.....', 0.65),
    line('celesta', 3, COUNTER, 1, 0.5, inSection('A', 'B', 'C'))
  ]
};

/** Sunrise: an upward arpeggio, the theme's last phrase, the home chord. Plays once. */
const SUNRISE: Section = { chords: [0, 3, 0], melody: melody('0 2 4 6 7 - - - | 4 - 3 2 1 - 2 3 | 7 - - - - - - -') };
const victory: TrackDef = {
  bpm: 100, key: 65, scale: SCALES.major, form: ['S'], sections: { S: SUNRISE },
  reverb: 0.45, gain: 1.25, loop: false,
  parts: [
    chords('pad', 0, -1, 0.9, true, 12),
    lead('musicbox', 0, 1, 0.9),
    lead('keys', 0, 0, 0.55),
    bassline('bass', 0, -2, 0.7, { 0: 0 }, 12),
    { layer: 0, play: c => (c.barInSection === 2 && c.step === 0 ? [0, 2, 4, 7].map((d, i) => ({ inst: 'celesta' as const, midi: c.note(d, 2), steps: 12 - i, vel: 0.5 })) : null) }
  ]
};

/** Gentle defeat: the theme's falling tail in minor, iv -> i, then quiet. */
const DUSK: Section = { chords: [3, 0], melody: melody('4 - 3 - 2 - 1 - | 0 - - - - - - -') };
const defeat: TrackDef = {
  bpm: 88, key: 62, scale: SCALES.minor, form: ['D'], sections: { D: DUSK },
  reverb: 0.5, gain: 1.25, loop: false,
  parts: [
    chords('pad', 0, -1, 0.8, false, 16),
    lead('flute', 0, 0, 0.8),
    bassline('bass', 0, -2, 0.6, { 0: 0 }, 14)
  ]
};

export const TRACKS = { menu, story, countertop, sink, stove, pantry, fridge, boss, finale, endless, victory, defeat } satisfies Record<string, TrackDef>;
export type TrackName = keyof typeof TRACKS;

/** Seconds of one full pass through a track's form (what "one loop" means). */
export function trackLength(def: TrackDef): number {
  const bars = def.form.reduce((sum, name) => sum + def.sections[name].chords.length, 0);
  return bars * 4 * 60 / def.bpm;
}
