// Web Audio drum engine with a look-ahead scheduler.
// Hits are scheduled against ctx.currentTime ~120 ms ahead, so UI/JS jank
// never moves a hit; only the audio clock decides timing.

const LOOKAHEAD = 0.12;   // seconds scheduled ahead
const TICK_MS = 25;       // scheduler wake interval

export class DrumEngine {
  constructor() {
    this.ctx = null;
    this.bpm = 90;
    this.pattern = null;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.bar = 0;
    this.countIn = 0;          // bars of click before the groove
    this.trainer = null;       // {every: bars, add: bpm, max: bpm}
    this.onStep = null;        // (step, time, bar) for the UI
    this.onBpm = null;
  }

  async init() {
    if (this.ctx) return;
    // iOS 16.4+: play even with the ring/silent switch on.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    this.out = this.ctx.createDynamicsCompressor();
    this.out.threshold.value = -8;
    this.out.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
    this.onBpm?.(this.bpm);
  }

  async start() {
    await this.init();
    await this.ctx.resume();
    this.step = 0;
    this.bar = -this.countIn;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  schedule() {
    const p = this.pattern;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const t = this.nextTime;
      if (this.bar < 0) {
        // count-in: rim click on each beat
        if (this.step % p.perBeat === 0) this.rim(t, this.step === 0 ? 1 : 0.7);
      } else {
        for (const key of "kshorct") {
          const ch = p[key]?.[this.step];
          const v = ch === "X" ? 1 : ch === "x" ? 0.75 : ch === "g" ? 0.3 : 0;
          if (v) this.voice(key, t, v);
        }
      }
      this.onStep?.(this.step, t, this.bar);
      this.nextTime += 60 / this.bpm / p.perBeat;
      if (++this.step >= p.steps) {
        this.step = 0;
        this.bar++;
        const tr = this.trainer;
        if (tr && this.bar > 0 && this.bar % tr.every === 0 && this.bpm < tr.max) {
          this.setBpm(Math.min(tr.max, this.bpm + tr.add));
        }
      }
    }
  }

  // Sampled kit: kick/snare/closed hat from kits/<name>/; other voices stay synthesized.
  async loadKit(name) {
    if (!name) { this.samples = null; return; }
    await this.init();
    const files = { k: "kick", s: "snare", h: "hihat" };
    const entries = await Promise.all(Object.entries(files).map(async ([key, f]) => {
      const res = await fetch(`kits/${name}/${f}.wav`);
      return [key, await this.ctx.decodeAudioData(await res.arrayBuffer())];
    }));
    this.samples = Object.fromEntries(entries);
  }

  voice(key, t, v) {
    const buf = this.samples?.[key];
    if (buf) {
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = v;
      s.connect(g); g.connect(this.out);
      s.start(t);
      return;
    }
    ({ k: this.kick, s: this.snare, h: this.hat, o: this.openHat,
       r: this.ride, c: this.crash, t: this.rim })[key].call(this, t, v);
  }

  env(t, v, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(this.out);
    return g;
  }

  noiseSrc(t, dur, filterType, freq, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    s.connect(f);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
    return f;
  }

  kick(t, v) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, v, 0.4));
    o.start(t); o.stop(t + 0.42);
  }

  snare(t, v) {
    this.noiseSrc(t, 0.2, "highpass", 1200).connect(this.env(t, v * 0.8, 0.18));
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.05);
    o.connect(this.env(t, v * 0.5, 0.08));
    o.start(t); o.stop(t + 0.1);
  }

  hat(t, v)     { this.noiseSrc(t, 0.06, "highpass", 8000).connect(this.env(t, v * 0.5, 0.045)); }
  openHat(t, v) { this.noiseSrc(t, 0.35, "highpass", 7500).connect(this.env(t, v * 0.45, 0.3)); }
  ride(t, v)    { this.noiseSrc(t, 0.5, "bandpass", 6000, 2).connect(this.env(t, v * 0.5, 0.45)); }
  crash(t, v)   { this.noiseSrc(t, 1.4, "highpass", 4000).connect(this.env(t, v * 0.6, 1.3)); }

  rim(t, v) {
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1700;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1700;
    o.connect(f); f.connect(this.env(t, v * 0.6, 0.03));
    o.start(t); o.stop(t + 0.04);
  }
}
