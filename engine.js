// Web Audio drum engine with a look-ahead scheduler.
// Hits are scheduled against ctx.currentTime ~120 ms ahead, so UI/JS jank
// never moves a hit; only the audio clock decides timing.

const LOOKAHEAD = 0.12;   // seconds scheduled ahead
const TICK_MS = 25;       // scheduler wake interval
const VOICE_ORDER = ["k", "s", "t", "h", "o", "r", "c", "1", "2", "3"];

// Per-voice feel: bias = consistent push(-)/drag(+), jitter = random spread (seconds).
// Kick sits tight on the grid, snare lays back a hair, hats breathe the most.
const HUMAN = {
  k: { bias: 0, jitter: 0.003 },
  s: { bias: 0.004, jitter: 0.004 },
  h: { bias: -0.002, jitter: 0.006 },
  o: { bias: -0.002, jitter: 0.006 },
  r: { bias: -0.002, jitter: 0.006 },
  default: { bias: 0, jitter: 0.004 },
};

// Chorus = same groove, bigger: hats move to the ride (accent on the beat), kick and
// snare get promoted. Grooves can supply their own `chorus` instead.
const chorusCache = new WeakMap();
function chorusOf(p) {
  if (p.chorus) return { ...p.main, ...p.chorus };
  if (!chorusCache.has(p)) {
    const g = { ...p.main };
    const up = (row) => row?.replace(/x/g, "X").replace(/g/g, "x");
    if (g.h) {
      g.r = g.h.replace(/g/g, "-").split("").map((c, i) => (c === "-" ? "-" : i % p.perBeat === 0 ? "X" : "x")).join("");
      delete g.h;
      delete g.o;
    }
    if (g.t && !g.s) { g.s = g.t.replace(/x/g, "X"); delete g.t; }   // cross-stick opens up to full snare
    g.k = up(g.k); g.s = up(g.s);
    chorusCache.set(p, g);
  }
  return chorusCache.get(p);
}

// Gaussian-ish noise in roughly [-1, 1] (sum of uniforms).
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

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
    this.feel = 0.5;           // humanize amount 0..1
    this.section = "verse";
    this.song = null;          // [{section, bars}, ...] loops; null = manual sections
    this.pendingSection = null;
    this.fillEvery = 4;        // bars per phrase; 0 = no fills
    this.onStep = null;        // (step, time, bar) for the UI
    this.onBpm = null;
  }

  async init() {
    if (this.ctx) return;
    // iOS 16.4+: play even with the ring/silent switch on.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    this.buildOutput(this.ctx);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // Bus: gentle compression, then a limiter-style stage and trim so stacked hits never clip.
  buildOutput(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.12;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.05;
    const trim = ctx.createGain();
    trim.gain.value = 0.6;
    comp.connect(limit); limit.connect(trim); trim.connect(ctx.destination);
    this.out = comp;
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
    this.phraseBar = 0;
    this.grid = null;
    this.crashNext = false;
    this.transition = false;
    this.songRepeat = false;
    this.songIdx = 0;
    if (this.song) { this.section = this.song[0].section; this.pendingSection = null; this.onSection?.(this.section); }
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.reportBar(this.nextTime);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  // Which grid plays this bar. Bars count from the start of the current section, so
  // fills land at the end of each 4/8-bar phrase and a section change gets its own fill.
  barGrid() {
    const p = this.pattern;
    // Song mode: on a part's last bar, queue the next part so this bar becomes its transition.
    if (this.song && !this.pendingSection) {
      const part = this.song[this.songIdx % this.song.length];
      if (this.phraseBar >= part.bars - 1) {
        const next = this.song[(this.songIdx + 1) % this.song.length];
        if (next.section !== this.section) this.pendingSection = next.section;
        else this.songRepeat = true;
      }
    }
    const hasFill = !!p.fill;
    let fill = false;
    if (this.songRepeat && hasFill) {
      fill = true;                         // same section again: just mark the part boundary
    } else if (this.pendingSection && hasFill) {
      fill = true;
      this.transition = true;              // section switches after this bar
    } else if (this.pendingSection) {
      this.applySection();                 // groove without a fill: switch right away
    } else {
      fill = hasFill && this.fillEvery > 0 && (this.phraseBar + 1) % this.fillEvery === 0;
    }
    const base = this.section === "chorus" ? chorusOf(p) : p.main;
    const alt = !fill && p.alt && this.phraseBar % 2 === 1 && this.section !== "chorus";
    const g = { ...base, ...(fill ? p.fill : alt ? p.alt : {}) };
    // In a chorus that rides, fill hats stay on the ride.
    if (fill && g.r && !base.h && p.fill.h) { g.r = p.fill.h.replace(/g/g, "-"); delete g.h; delete g.o; }
    if (this.crashNext && !p.noCrash) g.c = "X" + (g.c ?? "-".repeat(p.steps)).slice(1);
    this.crashNext = fill;
    return g;
  }

  // Progress for the UI, delivered when the bar actually starts sounding.
  reportBar(atTime) {
    if (!this.onBar) return;
    const tr = this.trainer;
    const part = this.song?.[this.songIdx % this.song.length];
    const info = {
      bar: this.bar, section: this.pendingSection ?? this.section,
      partBar: part ? Math.min(this.phraseBar, part.bars - 1) + 1 : null, partBars: part?.bars ?? null,
      trainer: tr && this.bar >= 0 ? { bpm: this.bpm, max: tr.max, inBars: tr.every - (this.bar % tr.every) } : null,
    };
    const delay = Math.max(0, (atTime - this.ctx.currentTime) * 1000);
    setTimeout(() => this.onBar(info), delay);
  }

  applySection() {
    if (this.song) this.songIdx++;
    this.section = this.pendingSection;
    this.pendingSection = null;
    this.phraseBar = 0;
    this.crashNext = true;
    this.onSection?.(this.section);
  }

  // Queue a section change; it lands after a transition fill (or at once if no fill).
  setSection(name) {
    if (!this.playing) { this.section = name; this.pendingSection = null; this.onSection?.(name); return; }
    this.pendingSection = name === this.section ? null : name;
    this.onSection?.(this.section, this.pendingSection);
  }

  schedule() {
    const p = this.pattern;
    const stepDur = 60 / this.bpm / p.perBeat;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const t = this.nextTime;
      if (this.bar < 0) {
        // count-in: rim click on each beat
        if (this.step % p.perBeat === 0) this.rim(t, this.step === 0 ? 1 : 0.7);
      } else {
        if (this.step === 0 || !this.grid) this.grid = this.barGrid();
        // Swing delays every other subdivision (16ths on a 4-per-beat grid).
        const swing = p.swing && this.step % 2 === 1 ? p.swing * stepDur : 0;
        for (const key of VOICE_ORDER) {
          const ch = this.grid[key]?.[this.step];
          let v = ch === "X" ? 1 : ch === "x" ? 0.75 : ch === "g" ? 0.3 : 0;
          if (!v) continue;
          // Cymbal hand leans on the beat, lighter in between.
          if ("hr".includes(key) && ch === "x" && this.step % p.perBeat !== 0) v *= 0.85;
          let when = t + swing;
          if (this.feel > 0) {
            // feel 0..1: 0 = machine-tight, 0.5 = natural player, 1 = loose
            const h = HUMAN[key] ?? HUMAN.default, f = this.feel * 2;
            when += (h.bias + gauss() * h.jitter) * f;
            v *= 1 + gauss() * 0.06 * f;
          }
          this.voice(key, Math.max(when, this.ctx.currentTime), Math.min(1.1, Math.max(0.05, v)));
        }
      }
      this.onStep?.(this.step, t, this.bar);
      this.nextTime += stepDur;
      if (++this.step >= p.steps) {
        this.step = 0;
        this.bar++;
        this.grid = null;
        if (this.bar > 0) this.phraseBar++;
        if (this.transition) { this.transition = false; this.applySection(); }
        if (this.songRepeat) { this.songRepeat = false; this.songIdx++; this.phraseBar = 0; this.crashNext = true; }
        const tr = this.trainer;
        if (tr && this.bar > 0 && this.bar % tr.every === 0 && this.bpm < tr.max) {
          this.setBpm(Math.min(tr.max, this.bpm + tr.add));
        }
        this.reportBar(t + stepDur);
      }
    }
  }

  // Sampled kit: kick/snare/closed hat from kits/<name>/; other voices stay synthesized.
  async loadKit(name) {
    if (!name) { this.samples = null; return; }
    await this.init();
    const decode = async (path) =>
      this.ctx.decodeAudioData(await (await fetch(`kits/${name}/${path}`)).arrayBuffer());
    const manifest = await fetch(`kits/${name}/kit.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let entries;
    if (manifest) {
      // Multi-sampled kit: manifest[key] = [ghost, normal, accent] layers, each a list of takes.
      entries = await Promise.all(Object.entries(manifest).map(async ([key, layers]) =>
        [key, await Promise.all(layers.map((takes) => Promise.all(takes.map(decode))))]));
    } else {
      const files = { k: "kick", s: "snare", h: "hihat" };
      entries = await Promise.all(Object.entries(files).map(async ([key, f]) =>
        [key, [[await decode(`${f}.wav`)]]]));
    }
    this.samples = Object.fromEntries(entries);
    this.rr = {};
  }

  voice(key, t, v) {
    const layers = this.samples?.[key];
    if (layers) {
      // Pick layer by velocity, rotate takes so repeats don't machine-gun.
      const layer = layers[Math.min(layers.length - 1, v >= 0.95 ? 2 : v >= 0.6 ? 1 : 0)];
      this.rr[key] = (this.rr[key] ?? 0) + 1;
      const buf = layer[this.rr[key] % layer.length];
      // Layered kits encode most loudness in the sample; keep only the fine variation.
      const nominal = v >= 0.95 ? 1 : v >= 0.6 ? 0.75 : 0.3;
      const gain = layers.length > 1 ? v / nominal : v;
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      s.connect(g); g.connect(this.out);
      s.start(t);
      this.choke(key, t, g);
      return;
    }
    ({ k: this.kick, s: this.snare, h: this.hat, o: this.openHat, r: this.ride, c: this.crash,
       t: this.rim, 1: this.tomHi, 2: this.tomMid, 3: this.tomLow })[key].call(this, t, v);
  }

  // A closed hat (or another open hat) cuts off the ringing open hat, like a real foot pedal.
  choke(key, t, gainNode) {
    if ((key === "h" || key === "o") && this.openHatGain) {
      const g = this.openHatGain.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, 0.015);
      this.openHatGain = null;
    }
    if (key === "o") this.openHatGain = gainNode;
  }

  tom(t, v, f) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    o.connect(this.env(t, v * 0.8, 0.35));
    o.start(t); o.stop(t + 0.4);
  }
  tomHi(t, v) { this.tom(t, v, 200); }
  tomMid(t, v) { this.tom(t, v, 150); }
  tomLow(t, v) { this.tom(t, v, 100); }

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
