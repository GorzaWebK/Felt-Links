// All sound is made here with the Web Audio API: soft thuds, woody plips,
// elastic twangs, the sewing machine, the pop into the cup, and gentle
// generative music (plucked strings, ukulele, music box), one theme per course.

import { mulberry32 } from './rng.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class Audio {
  constructor() {
    this.ctx = null;
    this.music = 0.6;
    this.sfx = 0.8;
    this.muted = false;
    this.theme = null;
    this.buffers = new Map();
    this.whirr = null;
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // A small generated room so the music sounds like it's in the attic.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    this.reverb.connect(wet).connect(this.musicBus);
    this.noiseBuf = this.makeNoise(1.5);
    this.applyVolumes();
    this.startScheduler();
    if (this.theme) this.playTheme(this.theme, true);
  }

  setVolumes(music, sfx, muted) {
    this.music = music;
    this.sfx = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfx, t, 0.05);
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.round(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = mulberry32(5);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  makeNoise(sec) {
    const ctx = this.ctx;
    const len = Math.round(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = mulberry32(11);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + 0.03 * (r() * 2 - 1); // soft brown-ish noise
      d[i] = b * 6;
    }
    return buf;
  }

  // ------------------------------------------------------------ instruments

  /** Karplus-Strong pluck rendered once per pitch and tone. */
  pluckBuffer(freq, bright = 0.5, sec = 1.8) {
    const key = `p${freq.toFixed(1)}|${bright}|${sec}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.round(sr * sec);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const r = mulberry32(Math.round(freq));
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = r() * 2 - 1;
    // Pre-soften the excitation for felt-like plucks.
    for (let k = 0; k < (1 - bright) * 4; k++) for (let i = 1; i < N; i++) line[i] = (line[i] + line[i - 1]) * 0.5;
    const decay = 0.994 + bright * 0.005;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = line[idx];
      const b = line[(idx + 1) % N];
      // Averaging two neighbours is the string's damping; brighter keeps more of the raw sample.
      const v = bright * 0.3 * a + (1 - bright * 0.3) * 0.5 * (a + b);
      line[idx] = v * decay;
      d[i] = a * 0.6;
      idx = (idx + 1) % N;
    }
    this.buffers.set(key, buf);
    return buf;
  }

  /** Music-box tine: inharmonic partials with a bell decay. */
  boxBuffer(freq) {
    const key = `b${freq.toFixed(1)}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.round(sr * 2.4);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const parts = [
      [1, 1, 2.2],
      [2.76, 0.35, 5],
      [5.4, 0.16, 9],
      [8.93, 0.06, 14],
    ];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let v = 0;
      for (const [m, a, dk] of parts) v += Math.sin(2 * Math.PI * freq * m * t) * a * Math.exp(-t * dk);
      d[i] = v * 0.35 * Math.min(1, t * 400);
    }
    this.buffers.set(key, buf);
    return buf;
  }

  playBuf(buf, when, gain, bus, rate = 1, toReverb = true, pan = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(bus);
    if (toReverb && this.reverb) node.connect(this.reverb);
    src.start(when);
    return src;
  }

  // ------------------------------------------------------------ effects

  env(node, when, a, peak, d) {
    node.gain.setValueAtTime(0.0001, when);
    node.gain.exponentialRampToValueAtTime(peak, when + a);
    node.gain.exponentialRampToValueAtTime(0.0001, when + a + d);
  }

  noise(when, dur, filterType, freq, q, peak) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, when, 0.004, peak, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(when, Math.random() * 0.8);
    src.stop(when + dur + 0.1);
    return f;
  }

  tone(when, type, f0, f1, dur, peak, dest = this.sfxBus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    const g = ctx.createGain();
    this.env(g, when, 0.005, peak, dur);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + dur + 0.05);
    return o;
  }

  play(name, opts = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.005;
    const k = Math.min(1, (opts.speed ?? 400) / 700);
    switch (name) {
      case 'thud': {
        // A soft woolly landing; the surface changes the colour.
        const s = opts.surf;
        const bright = { satin: 2400, denim: 1400, corduroy: 900, wood: 2000, tin: 3000 }[s] || 600;
        this.noise(t, 0.09 + k * 0.08, 'lowpass', bright, 0.7, 0.25 + k * 0.5);
        this.tone(t, 'sine', 120 + k * 40, 55, 0.14, 0.15 + k * 0.35);
        if (s === 'wood' || s === 'tin') this.tone(t, 'triangle', s === 'tin' ? 1300 : 520, 380, 0.08, 0.1 * k + 0.03);
        break;
      }
      case 'ridge':
        this.noise(t, 0.03, 'bandpass', 1600, 3, 0.06);
        break;
      case 'plip': {
        // Woody button plip: quick falling pitch and a knock.
        const f = opts.wood ? 380 : 620;
        this.tone(t, 'triangle', f * 1.6, f, 0.09, 0.28 + 0.3 * k);
        this.noise(t, 0.04, 'bandpass', f * 3, 5, 0.12);
        break;
      }
      case 'tink':
        this.tone(t, 'sine', 2400, 2200, 0.25, 0.12);
        this.tone(t, 'sine', 3700, 3500, 0.15, 0.05);
        break;
      case 'twang': {
        // Elastic band: a bent, wobbling saw through a falling lowpass.
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const base = 110 + k * 60;
        o.frequency.setValueAtTime(base * 1.6, t);
        o.frequency.exponentialRampToValueAtTime(base, t + 0.08);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 18;
        const lg = ctx.createGain();
        lg.gain.value = base * 0.05;
        lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2600, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
        const g = ctx.createGain();
        this.env(g, t, 0.004, 0.3 + 0.2 * k, 0.55);
        o.connect(f).connect(g).connect(this.sfxBus);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.65);
        lfo.stop(t + 0.65);
        break;
      }
      case 'shot':
        this.noise(t, 0.12 + 0.12 * (opts.power ?? 0.5), 'bandpass', 700 + 900 * (opts.power ?? 0.5), 1.2, 0.2 + 0.25 * (opts.power ?? 0.5));
        this.tone(t, 'sine', 200, 90, 0.08, 0.2);
        break;
      case 'pop': {
        // The pompom dropping into the buttonhole, then a little music-box flourish.
        this.tone(t, 'sine', 260, 900, 0.07, 0.4);
        this.noise(t, 0.05, 'highpass', 2000, 0.7, 0.15);
        this.tone(t + 0.09, 'sine', 140, 60, 0.18, 0.4);
        const notes = [79, 83, 86, 91];
        notes.forEach((n, i) => this.playBuf(this.boxBuffer(midi(n)), t + 0.2 + i * 0.09, 0.5, this.sfxBus, 1, true));
        break;
      }
      case 'splash':
        this.noise(t, 0.35, 'lowpass', 900, 0.6, 0.5);
        this.noise(t + 0.05, 0.25, 'bandpass', 2200, 1.5, 0.15);
        this.tone(t, 'sine', 400, 120, 0.25, 0.15);
        break;
      case 'prick':
        this.tone(t, 'square', 1800, 1500, 0.05, 0.08);
        this.noise(t, 0.12, 'highpass', 3000, 1, 0.12);
        this.tone(t + 0.08, 'triangle', 300, 200, 0.2, 0.15);
        break;
      case 'snag':
        this.noise(t, 0.18, 'bandpass', 3200, 2.5, 0.2);
        this.tone(t, 'sawtooth', 420, 340, 0.12, 0.04);
        break;
      case 'zip':
        for (let i = 0; i < 6; i++) this.noise(t + i * 0.022, 0.015, 'bandpass', 2600 + i * 120, 6, 0.08);
        break;
      case 'click':
        this.tone(t, 'triangle', 900, 600, 0.05, 0.18);
        break;
      case 'stitch':
        this.noise(t, 0.03, 'bandpass', 4200, 4, 0.08);
        this.tone(t, 'sine', 1500 + Math.random() * 300, 1200, 0.03, 0.03);
        break;
      case 'thimble':
        this.playBuf(this.boxBuffer(midi(84 + (opts.i || 0) * 4)), t, 0.6, this.sfxBus, 1, true);
        break;
      case 'chalk':
        this.noise(t, 0.15, 'bandpass', 2500, 0.8, 0.07);
        break;
      case 'out':
        this.tone(t, 'triangle', 330, 220, 0.3, 0.12);
        break;
      default:
        break;
    }
  }

  /** The sewing machine's whirr: level 0..1 by how close the ball is. */
  setWhirr(level, rate = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.whirr && level > 0) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 52;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 104.5;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 520;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lg = ctx.createGain();
      lg.gain.value = 0.4;
      lfo.connect(lg).connect(am.gain);
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(f);
      o2.connect(f);
      f.connect(am).connect(g).connect(this.sfxBus);
      o.start();
      o2.start();
      lfo.start();
      this.whirr = { o, o2, g, lfo };
    }
    if (this.whirr) {
      const t = ctx.currentTime;
      this.whirr.g.gain.setTargetAtTime(this.muted ? 0 : level * 0.16, t, 0.15);
      this.whirr.lfo.frequency.setTargetAtTime(6 + rate * 4, t, 0.2);
    }
  }

  // ------------------------------------------------------------ music

  playTheme(name, force = false) {
    if (this.theme === name && !force) return;
    this.theme = name;
    this.bar = 0;
    this.stepIdx = 0;
    this.rand = mulberry32(name.length * 101);
    if (this.ctx) this.nextStep = this.ctx.currentTime + 0.3;
  }

  startScheduler() {
    this.nextStep = this.ctx.currentTime + 0.3;
    this.stepIdx = 0;
    setInterval(() => this.schedule(), 40);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.theme || ctx.state !== 'running') return;
    const song = SONGS[this.theme] || SONGS.menu;
    const stepDur = 60 / song.bpm / 2; // eighth notes
    while (this.nextStep < ctx.currentTime + 0.25) {
      if (this.nextStep < ctx.currentTime - 0.1) this.nextStep = ctx.currentTime + 0.05;
      song.step(this, this.nextStep, this.stepIdx, stepDur);
      this.stepIdx++;
      this.nextStep += stepDur;
    }
  }
}

// Chord tables as MIDI roots plus intervals.
const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];

function chordAt(prog, idx, stepsPerBar) {
  return prog[Math.floor(idx / stepsPerBar) % prog.length];
}

const SONGS = {
  // Menu: a slow music-box lullaby in F.
  menu: {
    bpm: 66,
    step(a, t, i) {
      const prog = [[65, MAJ], [62, MIN], [70, MAJ], [72, MAJ]];
      const [root, q] = chordAt(prog, i, 8);
      const pos = i % 8;
      if (pos === 0) a.playBuf(a.pluckBuffer(midi(root - 24), 0.2, 2.4), t, 0.35, a.musicBus);
      if (pos % 2 === 0) {
        const n = root + q[(pos / 2) % 3] + 12;
        a.playBuf(a.boxBuffer(midi(n)), t, 0.22, a.musicBus);
      }
      if (pos === 5 && a.rand() < 0.6) a.playBuf(a.boxBuffer(midi(root + 24 + q[Math.floor(a.rand() * 3)])), t, 0.14, a.musicBus);
    },
  },
  // Meadow Quilt: soft plucked strings in G, rolling arpeggios.
  meadow: {
    bpm: 88,
    step(a, t, i) {
      const prog = [[67, MAJ], [62, MAJ], [64, MIN], [60, MAJ]];
      const [root, q] = chordAt(prog, i, 8);
      const pos = i % 8;
      if (pos === 0 || pos === 4) a.playBuf(a.pluckBuffer(midi(root - 24 + (pos ? 7 : 0)), 0.25, 2), t, 0.4, a.musicBus);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      a.playBuf(a.pluckBuffer(midi(root + q[arp[pos]]), 0.45), t + (pos % 2 ? 0.012 : 0), 0.16, a.musicBus, 1, true, -0.2);
      // A wandering pentatonic melody, sparse.
      if (pos % 2 === 0 && a.rand() < 0.42) {
        const scale = [67, 69, 71, 74, 76, 79];
        a.mel = Math.max(0, Math.min(scale.length - 1, (a.mel ?? 2) + Math.floor(a.rand() * 3) - 1));
        a.playBuf(a.pluckBuffer(midi(scale[a.mel] + 12), 0.65, 1.4), t, 0.15, a.musicBus, 1, true, 0.25);
      }
    },
  },
  // Seaside Bunting: ukulele strums in C with a lilting island rhythm.
  seaside: {
    bpm: 104,
    step(a, t, i) {
      const prog = [[60, MAJ], [65, MAJ], [67, MAJ], [60, MAJ], [57, MIN], [65, MAJ], [67, MAJ], [67, MAJ]];
      const [root, q] = chordAt(prog, i, 8);
      const pos = i % 8;
      const pattern = [1, 0, 1, 1, 0, 1, 1, 0]; // D . D U . U D .
      if (pattern[pos]) {
        const up = pos === 3 || pos === 5;
        const strings = [root + 7, root + q[1] + 12, root + 12, root + q[2] + 12];
        const order = up ? strings.slice().reverse() : strings;
        order.forEach((n, k) => a.playBuf(a.pluckBuffer(midi(n), 0.8, 1.0), t + k * 0.014, up ? 0.08 : 0.11, a.musicBus, 1, true, -0.15));
      }
      if (pos === 0) a.playBuf(a.pluckBuffer(midi(root - 12), 0.3, 1.6), t, 0.35, a.musicBus);
      if (pos === 6 && a.rand() < 0.5) {
        const scale = [72, 74, 76, 79, 81];
        a.playBuf(a.boxBuffer(midi(scale[Math.floor(a.rand() * scale.length)])), t, 0.12, a.musicBus, 1, true, 0.3);
      }
    },
  },
  // Attic Sewing Box: a music-box waltz in D minor over plucked bass.
  attic: {
    bpm: 76,
    step(a, t, i) {
      const prog = [[62, MIN], [67, MIN], [60, MAJ], [65, MAJ], [70, MAJ], [67, MIN], [69, MAJ], [69, MAJ]];
      const [root, q] = chordAt(prog, i, 6);
      const pos = i % 6; // 3/4 in eighth notes
      if (pos === 0) a.playBuf(a.pluckBuffer(midi(root - 24), 0.2, 2.2), t, 0.42, a.musicBus);
      if (pos === 2 || pos === 4) {
        for (const k of [1, 2]) a.playBuf(a.pluckBuffer(midi(root - 12 + q[k]), 0.35, 1.2), t, 0.1, a.musicBus);
      }
      if (pos % 2 === 0 || a.rand() < 0.25) {
        const n = root + 12 + q[Math.floor(a.rand() * 3)] + (a.rand() < 0.3 ? 12 : 0);
        a.playBuf(a.boxBuffer(midi(n)), t, 0.17, a.musicBus, 1, true, 0.2);
      }
    },
  },
};

export const audio = new Audio();
