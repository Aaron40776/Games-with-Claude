// Synthesized sound effects and an ambient pad (WebAudio, no asset files).
// Audio starts only after the first user interaction (browser policy).

const ACT_ROOT = { 1: 55, 2: 49, 3: 41.2 }; // A1, G1, E1
const SCALE = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish

export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.act = 1;
    this.music = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.out = ctx.createDynamicsCompressor();
    this.out.threshold.value = -14;
    this.out.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.settings.sound ? 0.55 : 0;
    this.sfxGain.connect(this.out);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.settings.music ? 0.5 : 0;
    this.musicGain.connect(this.out);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.settings.sound ? 0.55 : 0, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.settings.music ? 0.5 : 0, t, 0.3);
  }

  tone({ f = 440, to = null, type = 'sine', dur = 0.12, vol = 0.2, delay = 0, attack = 0.005 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.15, vol = 0.2, freq = 1200, to = null, q = 0.8, type = 'lowpass', delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, intensity = 1) {
    if (!this.ctx || !this.settings.sound) return;
    const v = Math.min(1.6, intensity);
    switch (name) {
      case 'click': this.tone({ f: 880, type: 'square', dur: 0.035, vol: 0.05 }); break;
      case 'hover': this.tone({ f: 1500, dur: 0.025, vol: 0.02 }); break;
      case 'card':
        this.noise({ dur: 0.14, vol: 0.12, freq: 2600, to: 700, type: 'bandpass', q: 1.2 });
        this.tone({ f: 520, to: 820, type: 'triangle', dur: 0.09, vol: 0.06 });
        break;
      case 'draw': this.tone({ f: 1250, to: 1500, dur: 0.03, vol: 0.025 }); break;
      case 'shoot':
        this.tone({ f: 900, to: 220, type: 'sawtooth', dur: 0.12, vol: 0.05 });
        this.noise({ dur: 0.08, vol: 0.06, freq: 4000, type: 'highpass' });
        break;
      case 'hit':
        this.noise({ dur: 0.16, vol: 0.28 * v, freq: 1600, to: 300 });
        this.tone({ f: 190, to: 55, dur: 0.16, vol: 0.32 * v });
        break;
      case 'hurt':
        this.noise({ dur: 0.25, vol: 0.3 * v, freq: 900, to: 200 });
        this.tone({ f: 140, to: 40, type: 'sawtooth', dur: 0.24, vol: 0.14 * v });
        break;
      case 'block':
        this.tone({ f: 1650, type: 'triangle', dur: 0.09, vol: 0.09 });
        this.tone({ f: 2480, dur: 0.07, vol: 0.05, delay: 0.01 });
        this.noise({ dur: 0.06, vol: 0.08, freq: 5000, type: 'highpass' });
        break;
      case 'shield': this.tone({ f: 520, to: 980, dur: 0.18, vol: 0.09 }); break;
      case 'buff':
        [440, 554, 659].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.09, vol: 0.06, delay: i * 0.05 }));
        break;
      case 'debuff': this.tone({ f: 420, to: 180, type: 'square', dur: 0.2, vol: 0.04 }); break;
      case 'burn': this.noise({ dur: 0.22, vol: 0.12, freq: 900, type: 'bandpass', q: 0.7 }); break;
      case 'death':
        this.tone({ f: 420, to: 50, type: 'sawtooth', dur: 0.5, vol: 0.08 });
        this.noise({ dur: 0.45, vol: 0.18, freq: 3000, to: 200 });
        break;
      case 'energy': this.tone({ f: 880, to: 1320, type: 'triangle', dur: 0.1, vol: 0.06 }); break;
      case 'turn':
        this.tone({ f: 330, type: 'triangle', dur: 0.14, vol: 0.07 });
        this.tone({ f: 495, type: 'triangle', dur: 0.18, vol: 0.07, delay: 0.08 });
        break;
      case 'enemyturn': this.tone({ f: 196, to: 147, type: 'triangle', dur: 0.22, vol: 0.06 }); break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.28, vol: 0.08, delay: i * 0.1 }));
        break;
      case 'defeat':
        [392, 311, 262, 196].forEach((f, i) => this.tone({ f, type: 'triangle', dur: 0.4, vol: 0.08, delay: i * 0.18 }));
        break;
      case 'coin':
        this.tone({ f: 1318, dur: 0.07, vol: 0.06 });
        this.tone({ f: 1760, dur: 0.12, vol: 0.06, delay: 0.06 });
        break;
      case 'heal': this.tone({ f: 523, to: 880, dur: 0.32, vol: 0.08 }); break;
      case 'error':
        this.tone({ f: 150, type: 'square', dur: 0.07, vol: 0.05 });
        this.tone({ f: 130, type: 'square', dur: 0.08, vol: 0.05, delay: 0.09 });
        break;
      case 'relic':
        this.tone({ f: 1568, dur: 0.12, vol: 0.05 });
        this.tone({ f: 2093, dur: 0.18, vol: 0.05, delay: 0.07 });
        break;
      case 'cell': this.tone({ f: 300, to: 900, dur: 0.18, vol: 0.08 }); break;
      case 'map': this.tone({ f: 660, dur: 0.12, vol: 0.05 }); break;
      case 'fade': this.noise({ dur: 0.3, vol: 0.07, freq: 3000, to: 8000, type: 'bandpass', q: 2 }); break;
      default: break;
    }
  }

  setAct(act) {
    this.act = act;
    if (this.music) this.music.retune(ACT_ROOT[act] || 55);
  }

  startMusic() {
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const pad = ctx.createGain();
    pad.gain.value = 0.05;
    filter.connect(pad).connect(this.musicGain);
    const oscs = [0, 7, 12, 15.1].map((semi, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'triangle';
      o.detune.value = (i - 1.5) * 6;
      o.connect(filter);
      o.start();
      return { o, semi };
    });
    const retune = (root) => {
      const t = ctx.currentTime;
      for (const { o, semi } of oscs) o.frequency.setTargetAtTime(root * 2 ** (semi / 12), t, 1.5);
      this.root = root;
    };
    retune(ACT_ROOT[this.act] || 55);
    // Sparse bell notes over the pad.
    const bell = () => {
      if (!this.ctx) return;
      if (this.settings.music) {
        const semi = SCALE[Math.floor(Math.random() * SCALE.length)] + 24;
        const f = this.root * 2 ** (semi / 12);
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.03, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        o.connect(g).connect(this.musicGain);
        o.start(t);
        o.stop(t + 3);
      }
      setTimeout(bell, 2200 + Math.random() * 4200);
    };
    setTimeout(bell, 1500);
    this.music = { retune };
  }
}
