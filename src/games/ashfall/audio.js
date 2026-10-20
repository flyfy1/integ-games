// Ashfall audio: procedural WebAudio sound effects and a layered, intensity-driven score.
// Everything is synthesised at runtime so the cabinet ships without audio assets.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chord progressions as MIDI roots + minor/major triads (dark modal colours per area).
const SCORES = {
  title: { bpm: 64, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 48, 52]], drums: 0, arp: 0 },
  woods: { bpm: 72, chords: [[50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 48, 52]], drums: 0.6, arp: 0.25 },
  quarter: { bpm: 80, chords: [[45, 48, 52], [41, 45, 48], [43, 46, 50], [40, 43, 47]], drums: 0.8, arp: 0.35 },
  foundry: { bpm: 88, chords: [[43, 46, 50], [39, 43, 46], [41, 44, 48], [38, 42, 45]], drums: 1, arp: 0.45 },
  railyard: { bpm: 84, chords: [[47, 50, 54], [43, 47, 50], [45, 48, 52], [42, 45, 49]], drums: 0.8, arp: 0.35 },
  wastes: { bpm: 90, chords: [[44, 47, 51], [40, 44, 47], [42, 45, 49], [39, 42, 46]], drums: 0.9, arp: 0.5 },
  cathedral: { bpm: 94, chords: [[41, 44, 48], [37, 41, 44], [39, 42, 46], [36, 40, 43]], drums: 1, arp: 0.55 },
  boss1: { bpm: 116, chords: [[36, 39, 43], [36, 39, 43], [32, 36, 39], [34, 38, 41]], drums: 1, arp: 0.9 },
  boss2: { bpm: 136, chords: [[37, 40, 44], [33, 37, 40], [35, 39, 42], [32, 35, 39]], drums: 1, arp: 1 },
  victory: { bpm: 60, chords: [[50, 54, 57], [47, 50, 54], [43, 47, 50], [45, 49, 52]], drums: 0, arp: 0.2 }
};

export function createAudio() {
  let ctx = null, master, sfxBus, musicBus, comp, noiseBuf, ambience = null, distCurve;
  const lastCue = new Map();
  const sources = new Map();
  let suspended = false, destroyed = false, generation = 0;
  const track = (source, nodes) => {
    const disconnect = () => { sources.delete(source); nodes.forEach(node => node.disconnect()); };
    sources.set(source, disconnect); source.onended = disconnect;
  };
  const cancelPlayback = () => {
    generation++; clearInterval(timer); timer = 0;
    for (const [source, disconnect] of sources) { try { source.stop(); } catch { /* already stopped */ } disconnect(); }
    ambience = null; lastCue.clear();
    if (musicBus && ctx) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.value = 0.42; }
  };
  const resumePlayback = () => {
    if (!ctx || suspended || muted || destroyed) return;
    const current = generation;
    const start = () => {
      if (current !== generation || suspended || muted || destroyed || timer) return;
      startAmbience(); tuneAmbience(); step = 0; nextTime = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 30);
    };
    ctx.resume().then(start).catch(() => {});
  };
  let muted = false, mode = 'title', intensity = 0, targetIntensity = 0, step = 0, nextTime = 0, timer = 0;

  const ensure = () => {
    if (destroyed) return null;
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.42;
    sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 3.2); }
    return ctx;
  };

  // ---------- primitives ----------
  const env = (g, t, peak, attack, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  function noise(t, o) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur); f.Q.value = o.q ?? 1;
    const g = ctx.createGain(); env(g, t, o.gain ?? 0.3, o.attack ?? 0.003, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus); src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.05); track(src, [src, f, g]);
  }
  function tone(t, o) {
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.freq, t); if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur); if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain(); env(g, t, o.gain ?? 0.3, o.attack ?? 0.004, o.dur);
    let node = osc; const nodes = [osc, g];
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lpEnd) f.frequency.exponentialRampToValueAtTime(o.lpEnd, t + o.dur); f.Q.value = o.q ?? 0.8; node.connect(f); node = f; nodes.push(f); }
    if (o.dist) { const w = ctx.createWaveShaper(); w.curve = distCurve; node.connect(w); node = w; nodes.push(w); }
    node.connect(g); g.connect(o.bus || sfxBus); osc.start(t); osc.stop(t + o.dur + 0.05); track(osc, nodes);
  }

  function startAmbience() {
    // Continuous wind bed; its colour is retuned per area in setMode.
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 49; const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160; const hg = ctx.createGain(); hg.gain.value = 0;
    hum.connect(hf); hf.connect(hg); hg.connect(musicBus); hum.start();
    src.connect(f); f.connect(g); g.connect(musicBus); src.start();
    track(src, [src, f, g]); track(lfo, [lfo, lg]); track(hum, [hum, hf, hg]);
    ambience = { f, g, hg };
  }

  // ---------- music ----------
  function schedule() {
    if (!ctx || suspended || muted || destroyed || ctx.state !== 'running') return;
    intensity += (targetIntensity - intensity) * 0.06;
    const score = SCORES[mode] || SCORES.title;
    const stepDur = 60 / score.bpm / 4;
    if (nextTime < ctx.currentTime - .2) nextTime = ctx.currentTime + .02;
    while (nextTime < ctx.currentTime + 0.14) { playStep(score, step, nextTime, stepDur); step++; nextTime += stepDur; }
  }
  function playStep(score, s, t, sd) {
    const bar = Math.floor(s / 16) % score.chords.length, pos = s % 16, chord = score.chords[bar];
    const boss = mode === 'boss1' || mode === 'boss2', I = boss ? Math.max(0.75, intensity) : intensity;
    const bus = musicBus;
    if (pos === 0) {
      const len = sd * 16;
      // Pad: detuned saws through a lowpass that opens with intensity.
      chord.forEach((n, i) => {
        [-7, 7].forEach((det) => tone(t, { type: 'sawtooth', freq: NOTE(n + 12), detune: det + i * 2, dur: len * 1.05, attack: len * 0.35, gain: 0.05, lp: 380 + I * 1300, lpEnd: 300 + I * 900, bus }));
      });
      tone(t, { type: 'sine', freq: NOTE(chord[0]), dur: len, attack: len * 0.3, gain: 0.12, bus });
    }
    if (mode === 'victory' || mode === 'title') {
      if (pos % 8 === 4) tone(t, { type: 'triangle', freq: NOTE(chord[(s >> 3) % 3] + 24), dur: sd * 7, attack: 0.02, gain: 0.035, bus });
      return;
    }
    // Bass pulse rises in as combat heats up.
    const bassPattern = boss ? [0, 3, 6, 8, 10, 14] : [0, 6, 8];
    if (I > 0.25 && bassPattern.includes(pos)) tone(t, { type: boss ? 'sawtooth' : 'triangle', freq: NOTE(chord[0] - 12), dur: sd * 1.8, gain: 0.16 * Math.min(1, I + 0.2), lp: boss ? 520 : 400, dist: mode === 'boss2', bus });
    // Percussion.
    const d = score.drums * I;
    if (d > 0.2) {
      const kicks = boss ? [0, 6, 8, 11] : [0, 8, 10];
      if (kicks.includes(pos)) tone(t, { type: 'sine', freq: 130, freqEnd: 38, dur: 0.22, gain: 0.5 * Math.min(1, d + 0.3), bus });
      if ((pos === 4 || pos === 12) && d > 0.45) noise(t, { type: 'bandpass', freq: 1700, q: 0.9, dur: 0.16, gain: 0.18 * d, bus });
      if (boss && pos % 2 === 0) noise(t, { type: 'highpass', freq: 7000, dur: 0.035, gain: 0.05, bus });
      if (!boss && d > 0.6 && pos % 4 === 2) noise(t, { type: 'highpass', freq: 6500, dur: 0.03, gain: 0.03, bus });
    }
    // Arpeggio / metallic motif.
    const a = score.arp * I;
    if (a > 0.3 && (boss ? true : pos % 2 === 0)) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const note = chord[seq[(s >> (boss ? 0 : 1)) % 8]] + (boss ? 24 : 24);
      tone(t, { type: boss ? 'square' : 'triangle', freq: NOTE(note), dur: sd * 0.9, gain: (boss ? 0.035 : 0.03) * a, lp: 1800 + a * 1600, bus });
    }
    if (mode === 'boss2' && pos === 0 && (s >> 4) % 2 === 0) tone(t, { type: 'sawtooth', freq: NOTE(chord[0] + 12), freqEnd: NOTE(chord[0] + 11), dur: sd * 14, attack: 0.3, gain: 0.05, lp: 900, dist: true, bus });
  }

  // ---------- sound effects ----------
  const SFX = {
    evade(t) { [880,1320,1760].forEach((freq,i)=>tone(t+i*.035,{type:'triangle',freq,dur:.2,gain:.09})); },
    chain(t,v=1) { [60,64,67].forEach((n,i)=>tone(t+i*.055,{type:'triangle',freq:NOTE(n+v*3),dur:.25,gain:.1})); },
    overdrive(t) { [48,55,60,64,67].forEach((n,i)=>tone(t+i*.06,{type:'sawtooth',freq:NOTE(n),dur:.4,gain:.07,lp:1800})); tone(t,{freq:100,freqEnd:40,dur:.3,gain:.45}); },
    clear(t) { [60,64,67,72].forEach((n,i)=>tone(t+i*.12,{type:'triangle',freq:NOTE(n),dur:.7,gain:.1})); },
    shot(t) {
      noise(t, { type: 'lowpass', freq: 5200, freqEnd: 300, dur: 0.32, gain: 0.9, q: 0.6 });
      noise(t, { type: 'highpass', freq: 3500, dur: 0.045, gain: 0.55 });
      tone(t, { type: 'sine', freq: 120, freqEnd: 38, dur: 0.3, gain: 0.95 });
      noise(t + 0.05, { type: 'bandpass', freq: 700, freqEnd: 260, q: 0.7, dur: 0.7, gain: 0.12, attack: 0.03 });
    },
    pump(t) {
      noise(t, { type: 'bandpass', freq: 2600, q: 3, dur: 0.05, gain: 0.35 });
      tone(t, { type: 'square', freq: 320, freqEnd: 240, dur: 0.03, gain: 0.08 });
      noise(t + 0.13, { type: 'bandpass', freq: 1900, q: 3, dur: 0.06, gain: 0.4 });
      tone(t + 0.13, { type: 'square', freq: 260, freqEnd: 420, dur: 0.03, gain: 0.08 });
    },
    shell(t) {
      noise(t, { type: 'bandpass', freq: 3600, q: 5, dur: 0.03, gain: 0.3 });
      tone(t, { type: 'triangle', freq: 1250, freqEnd: 900, dur: 0.05, gain: 0.1 });
      noise(t + 0.06, { type: 'bandpass', freq: 620, q: 2, dur: 0.06, gain: 0.28 });
    },
    reloadStart(t) { noise(t, { type: 'bandpass', freq: 1400, q: 2, dur: 0.08, gain: 0.2 }); tone(t, { type: 'square', freq: 200, dur: 0.03, gain: 0.05 }); },
    empty(t) { tone(t, { type: 'square', freq: 1900, dur: 0.018, gain: 0.12 }); noise(t, { type: 'bandpass', freq: 4000, q: 6, dur: 0.02, gain: 0.15 }); },
    slash(t, v = 0) {
      const base = [1300, 1600, 900][v] || 1300;
      noise(t, { type: 'bandpass', freq: base, freqEnd: base * 3.2, q: 1.6, dur: v === 2 ? 0.24 : 0.15, gain: v === 2 ? 0.42 : 0.32, attack: 0.02 });
      if (v === 2) noise(t, { type: 'lowpass', freq: 600, freqEnd: 150, dur: 0.25, gain: 0.25, attack: 0.03 });
    },
    hit(t, v = 0) {
      tone(t, { type: 'sine', freq: 170, freqEnd: 48, dur: 0.14, gain: 0.75 });
      noise(t, { type: 'lowpass', freq: 2400, freqEnd: 400, dur: 0.1, gain: 0.55 });
      if (v === 1) { tone(t, { type: 'triangle', freq: 980, dur: 0.28, gain: 0.07 }); tone(t, { type: 'triangle', freq: 1427, dur: 0.22, gain: 0.05 }); }
      if (v === 2) tone(t, { type: 'sine', freq: 90, freqEnd: 30, dur: 0.3, gain: 0.6 });
    },
    kill(t) {
      tone(t, { type: 'sawtooth', freq: 240, freqEnd: 36, dur: 0.55, gain: 0.32, lp: 1400, lpEnd: 120 });
      noise(t, { type: 'lowpass', freq: 1600, freqEnd: 90, dur: 0.7, gain: 0.5 });
      noise(t + 0.02, { type: 'highpass', freq: 5000, dur: 0.4, gain: 0.07, attack: 0.05 });
    },
    jump(t) { noise(t, { type: 'bandpass', freq: 900, freqEnd: 1600, q: 1, dur: 0.09, gain: 0.12 }); },
    land(t) { tone(t, { type: 'sine', freq: 95, freqEnd: 45, dur: 0.09, gain: 0.3 }); noise(t, { type: 'lowpass', freq: 500, dur: 0.07, gain: 0.18 }); },
    step(t) { noise(t, { type: 'lowpass', freq: 380, dur: 0.05, gain: 0.07 }); },
    roll(t) { noise(t, { type: 'bandpass', freq: 650, freqEnd: 260, q: 0.8, dur: 0.3, gain: 0.22, attack: 0.03 }); },
    hurt(t) { tone(t, { type: 'square', freq: 230, freqEnd: 90, dur: 0.18, gain: 0.16, lp: 900 }); noise(t, { type: 'lowpass', freq: 1400, dur: 0.12, gain: 0.4 }); tone(t, { type: 'sine', freq: 70, freqEnd: 40, dur: 0.2, gain: 0.5 }); },
    floodWarn(t) { tone(t, { type: 'sine', freq: 220, dur: 0.24, gain: 0.13 }); tone(t + 0.28, { type: 'sine', freq: 330, dur: 0.3, gain: 0.1 }); },
    warn(t) { tone(t, { type: 'triangle', freq: 1320, dur: 0.07, gain: 0.08 }); tone(t + 0.06, { type: 'triangle', freq: 1760, dur: 0.1, gain: 0.07 }); },
    bigWarn(t) { tone(t, { type: 'sawtooth', freq: 220, dur: 0.35, gain: 0.08, lp: 1200 }); tone(t, { type: 'sawtooth', freq: 233, dur: 0.35, gain: 0.08, lp: 1200 }); },
    slam(t) { tone(t, { type: 'sine', freq: 80, freqEnd: 28, dur: 0.9, gain: 1 }); noise(t, { type: 'lowpass', freq: 900, freqEnd: 60, dur: 1.0, gain: 0.85 }); noise(t, { type: 'bandpass', freq: 2400, q: 2, dur: 0.2, gain: 0.25 }); },
    explode(t) { tone(t, { type: 'sine', freq: 110, freqEnd: 30, dur: 0.6, gain: 0.8 }); noise(t, { type: 'lowpass', freq: 2200, freqEnd: 80, dur: 0.8, gain: 0.7 }); },
    roar(t) {
      [62, 65.5, 93].forEach((f) => tone(t, { type: 'sawtooth', freq: f, freqEnd: f * 0.7, dur: 1.9, attack: 0.25, gain: 0.3, lp: 300, lpEnd: 1300, dist: true }));
      noise(t, { type: 'bandpass', freq: 500, freqEnd: 1200, q: 0.8, dur: 1.6, attack: 0.3, gain: 0.25 });
    },
    armorBreak(t) {
      [523, 761, 1187, 1663, 2311].forEach((f, i) => tone(t + i * 0.01, { type: 'triangle', freq: f, dur: 0.9 - i * 0.1, gain: 0.08 }));
      noise(t, { type: 'highpass', freq: 2500, dur: 0.9, gain: 0.35 });
      tone(t, { type: 'sine', freq: 90, freqEnd: 25, dur: 1.2, gain: 0.9 });
    },
    plate(t) { tone(t, { type: 'triangle', freq: 840 + Math.random() * 300, dur: 0.3, gain: 0.08 }); noise(t, { type: 'bandpass', freq: 3000, q: 2, dur: 0.1, gain: 0.3 }); },
    laserCharge(t) { tone(t, { type: 'sine', freq: 220, freqEnd: 1400, dur: 1.0, attack: 0.3, gain: 0.1 }); },
    laser(t) { tone(t, { type: 'sawtooth', freq: 140, dur: 0.45, gain: 0.25, lp: 1600 }); noise(t, { type: 'bandpass', freq: 2600, q: 1, dur: 0.45, gain: 0.3 }); },
    bolt(t) { tone(t, { type: 'square', freq: 700, freqEnd: 180, dur: 0.14, gain: 0.1, lp: 2500 }); noise(t, { type: 'bandpass', freq: 1800, dur: 0.1, gain: 0.15 }); },
    missile(t) { noise(t, { type: 'bandpass', freq: 900, freqEnd: 2600, q: 1.2, dur: 0.4, gain: 0.25, attack: 0.04 }); },
    pickup(t) { tone(t, { type: 'sine', freq: 660, dur: 0.18, gain: 0.12 }); tone(t + 0.07, { type: 'sine', freq: 990, dur: 0.25, gain: 0.1 }); tone(t + 0.14, { type: 'sine', freq: 1320, dur: 0.3, gain: 0.07 }); },
    checkpoint(t) { [587, 880, 1175].forEach((f, i) => tone(t + i * 0.09, { type: 'triangle', freq: f, dur: 0.6, gain: 0.06 })); },
    gate(t) { noise(t, { type: 'lowpass', freq: 700, freqEnd: 120, dur: 0.9, gain: 0.6 }); tone(t + 0.6, { type: 'sine', freq: 70, freqEnd: 32, dur: 0.6, gain: 0.8 }); },
    start(t) { tone(t, { type: 'sine', freq: 65, freqEnd: 32, dur: 2.2, gain: 0.7 }); [440, 659].forEach((f, i) => tone(t + 0.2 + i * 0.15, { type: 'triangle', freq: f, dur: 1.6, gain: 0.05 })); },
    death(t) { tone(t, { type: 'sine', freq: 200, freqEnd: 40, dur: 1.4, gain: 0.4 }); noise(t, { type: 'lowpass', freq: 800, freqEnd: 80, dur: 1.4, gain: 0.3 }); }
  };

  function tuneAmbience() {
    if (ambience && ctx) {
      const now = ctx.currentTime;
      const wind = { title: 0.05, woods: 0.07, quarter: 0.05, foundry: 0.025, railyard: 0.06, wastes: 0.08, cathedral: 0.035, boss1: 0.02, boss2: 0.02, victory: 0.04 }[mode] ?? 0.04;
      ambience.g.gain.setTargetAtTime(wind, now, 1.2);
      ambience.hg.gain.setTargetAtTime(mode === 'foundry' || mode === 'cathedral' || mode.startsWith('boss') ? 0.05 : 0, now, 1.5);
    }
  }

  const MUSIC_INT = { title: 0, woods: 0.15, quarter: 0.15, foundry: 0.2, railyard: 0.2, wastes: 0.22, cathedral: 0.25, boss1: 0.85, boss2: 1, victory: 0 };
  return {
    unlock() { if (suspended || destroyed) return; ensure(); resumePlayback(); },
    get ready() { return !!ctx; },
    setMuted(m) { if (m === muted) return; muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05); if (m) cancelPlayback(); else resumePlayback(); },
    play(name, v) {
      if (!ctx || muted || suspended || destroyed || ctx.state !== 'running') return;
      const now=ctx.currentTime, cooldown={hit:.035,kill:.07,explode:.12,plate:.06,step:.08}[name]||.025;
      if(now-(lastCue.get(name)??-Infinity)<cooldown)return;lastCue.set(name,now);
      if(['shot','armorBreak','overdrive','clear'].includes(name)){musicBus.gain.cancelScheduledValues(now);musicBus.gain.setTargetAtTime(.17,now,.015);musicBus.gain.setTargetAtTime(.42,now+.25,.14);}
      const fn=SFX[name];if(fn)fn(now+.005,v);
    },
    setMode(m) {
      if (m === mode) return; mode = m; targetIntensity = Math.max(targetIntensity, MUSIC_INT[m] ?? 0);
      tuneAmbience();
    },
    setIntensity(v) { targetIntensity = Math.max(MUSIC_INT[mode] ?? 0, Math.min(1, v)); },
    suspend() { suspended = true; cancelPlayback(); if (ctx) ctx.suspend().catch(() => {}); },
    resume() { suspended = false; resumePlayback(); },
    destroy() { destroyed = true; suspended = true; cancelPlayback(); if (ctx) ctx.close().catch(() => {}); ctx = null; }
  };
}
