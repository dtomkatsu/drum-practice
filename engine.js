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

// ---------- Variation ----------
// Small, style-safe changes a drummer makes bar to bar. The backbone never moves: downbeat
// kick, accented backbeats, and anything a groove marks as locked (e.g. reggae's drop).
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const setAt = (row, i, c) => row.slice(0, i) + c + row.slice(i + 1);
const empty = (g, i) => !["k", "s", "t"].some((k) => /[Xxg]/.test(g[k]?.[i] ?? ""));

function vary(g, p, amount) {
  const n = p.steps, pb = p.perBeat;
  if (pb === 1 || Math.random() > 0.35 + 0.5 * amount) return;     // most bars get a touch
  const snareKey = g.s ? "s" : g.t ? "t" : null;
  const moves = [];
  // Ghost notes either side of a backbeat.
  if (snareKey && !p.lockSnare) moves.push(() => {
    const backbeats = [...g[snareKey]].flatMap((c, i) => (c === "X" || c === "x" ? [i] : []));
    const spots = backbeats.flatMap((i) => [i - 1, i + 1, i + 2]).filter((i) => i > 0 && i < n && empty(g, i));
    for (let k = 0; k < (amount > 0.7 ? 2 : 1) && spots.length; k++) {
      const i = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      g[snareKey] = setAt(g[snareKey], i, "g");
    }
  });
  // Jazz comping: light snare (and the odd kick "bomb") on triplet partials.
  if (p.comp) moves.push(() => {
    const lets = [];
    for (let i = 2; i < n; i += 3) if (empty(g, i)) lets.push(i);
    for (let k = 0; k < 1 + Math.floor(Math.random() * 2) && lets.length; k++) {
      const i = lets.splice(Math.floor(Math.random() * lets.length), 1)[0];
      g.s = setAt(g.s ?? "-".repeat(n), i, Math.random() < 0.75 ? "g" : "x");
    }
    if (Math.random() < 0.2 * amount && lets.length) g.k = setAt(g.k, pick(lets), "x");
  });
  // Kick pickup on an empty off-beat (never on a backbeat).
  if (g.k && !p.lockKick) moves.push(() => {
    const step8 = pb === 4 ? 2 : pb;                                   // 8th-note grid (or beat for triplets)
    const spots = [];
    for (let i = step8; i < n; i += pb === 4 ? 2 : 1) if (empty(g, i) && (pb !== 3 || i % 3 === 2)) spots.push(i);
    if (spots.length) g.k = setAt(g.k, pick(spots), "x");
  });
  // Open-hat lift on the last off-beat, closed hat choked right after.
  if (g.h && /x/i.test(g.h)) moves.push(() => {
    const at = pb === 4 ? n - 2 : n - 1;                              // "and" of the last beat
    if (g.h[at] !== "-") { g.h = setAt(g.h, at, "-"); g.o = setAt(g.o ?? "-".repeat(n), at, "x"); }
  });
  const count = amount > 0.7 && Math.random() < 0.5 ? 2 : 1;
  for (let k = 0; k < count && moves.length; k++) moves.splice(Math.floor(Math.random() * moves.length), 1)[0]();
}

// Generated fills over the last 1 or 2 beats: snare roll, tom run, or snare-into-toms.
function makeFill(p, base, amount) {
  const n = p.steps, pb = p.perBeat;
  if (pb === 1) return p.fill ?? {};
  const beats = Math.random() < 0.35 + 0.3 * amount ? 2 : 1;
  const start = n - beats * pb;
  const region = [];
  for (let i = start; i < n; i++) region.push(i);
  const blank = () => "-".repeat(n);
  const f = {};
  // groove carries on until the fill starts
  for (const k of ["h", "o", "r"]) if (base[k]) f[k] = base[k].slice(0, start) + "-".repeat(n - start);
  if (base.k) f.k = base.k.slice(0, start) + "-".repeat(n - start);
  const snare = "s";                                                     // fills open up to full snare
  const keep = (k) => (base[k] ? base[k].slice(0, start) + "-".repeat(n - start) : blank());
  f[snare] = keep(snare);
  if (base.t) f.t = keep("t");
  const toms = ["1", "2", "3"];
  const type = pick(["roll", "toms", "snareToToms"]);
  region.forEach((i, j) => {
    const frac = j / Math.max(1, region.length - 1);
    const vel = frac > 0.75 ? "X" : frac > 0.3 ? "x" : "g";
    let voice = snare;
    if (type === "toms") voice = toms[Math.min(2, Math.floor(frac * 3))];
    if (type === "snareToToms" && frac >= 0.5) voice = toms[Math.min(2, Math.floor((frac - 0.5) * 6))];
    // thin out busy 16th rolls a little so it breathes
    if (pb === 4 && type !== "roll" && j % 2 === 1 && Math.random() < 0.4) return;
    f[voice] = setAt(f[voice] ?? blank(), i, vel);
  });
  // anchor the start of the fill with the kick; the crash on the next downbeat lands it
  f.k = setAt(f.k ?? blank(), start, "x");
  return f;
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
    this.variety = 0.5;        // bar-to-bar variation 0..1
    this.feel = 0.5;           // humanize amount 0..1
    this.section = "verse";
    this.muted = new Set();    // voice keys to skip, e.g. "k"
    this.gap = null;           // {play, silent} bars
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

  // Bus: no compression (it flattens the attack and makes real drums sound programmed),
  // just a fast safety limiter and trim so stacked hits never clip.
  buildOutput(ctx) {
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20;
    limit.attack.value = 0.001; limit.release.value = 0.08;
    const trim = ctx.createGain();
    trim.gain.value = 0.55;
    trim.connect(limit); limit.connect(ctx.destination);
    this.out = trim;
  }

  setBpm(bpm) {
    this.bpm = Math.max(30, Math.min(300, Math.round(bpm)));
    this.onBpm?.(this.bpm);
  }

  // iOS only lets audio (re)start inside the tap that asked for it: call this first thing in
  // the click handler, before any await. Resumes the context and plays one silent sample,
  // the classic iOS unlock.
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state !== "running") this.ctx.resume();
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    s.connect(this.ctx.destination);
    s.start();
  }

  async start() {
    await this.init();
    if (this.ctx.state !== "running") {
      // Wait (briefly) for the resume kicked off by unlock() to land.
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 1000))]);
    }
    if (this.ctx.state !== "running") throw new Error("audio-locked");
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
    // Watchdog: if the audio clock stops moving (iOS interruption, locked context), say so
    // instead of silently sitting on "count-in".
    this.lastClock = { t: this.ctx.currentTime, at: performance.now() };
    this.timer = setInterval(() => {
      const now = this.ctx.currentTime;
      if (now !== this.lastClock.t) this.lastClock = { t: now, at: performance.now() };
      else if (performance.now() - this.lastClock.at > 1500) { this.onStall?.(); return; }
      this.schedule();
    }, TICK_MS);
    this.schedule();
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    // Suspend so iOS treats every Play the same way (and the phone isn't driving silent audio).
    this.ctx?.suspend();
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
    // Fills: the groove's own fill, or (with variety on) a generated one in the same style.
    const fillGrid = fill && this.variety > 0 && Math.random() < 0.3 + 0.4 * this.variety
      ? makeFill(p, base, this.variety) : p.fill;
    const g = { ...base, ...(fill ? fillGrid : alt ? p.alt : {}) };
    if (!fill && this.variety > 0) vary(g, p, this.variety);
    // In a chorus that rides, fill hats stay on the ride.
    if (fill && g.r && !base.h && fillGrid.h) { g.r = fillGrid.h.replace(/g/g, "-"); delete g.h; delete g.o; }
    if (this.crashNext && !p.noCrash) g.c = "X" + (g.c ?? "-".repeat(p.steps)).slice(1);
    this.crashNext = fill;
    return g;
  }

  // Progress for the UI, delivered when the bar actually starts sounding.
  // Gap trainer: play `play` bars, then `silent` bars of nothing; your time has to hold.
  inGap(bar = this.bar) {
    const g = this.gap;
    return !!g && bar >= 0 && bar % (g.play + g.silent) >= g.play;
  }

  reportBar(atTime) {
    if (!this.onBar) return;
    const tr = this.trainer;
    const part = this.song?.[this.songIdx % this.song.length];
    const info = {
      bar: this.bar, section: this.pendingSection ?? this.section,
      partBar: part ? Math.min(this.phraseBar, part.bars - 1) + 1 : null, partBars: part?.bars ?? null,
      gap: this.inGap(),
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
        // Real stick click when the kit has one, synth click otherwise.
        if (this.step % p.perBeat === 0) {
          const v = this.step === 0 ? 1 : 0.75;
          if (this.samples?.t) this.voice("t", t, v); else this.rim(t, v);
        }
      } else {
        if (this.step === 0 || !this.grid) this.grid = this.barGrid();
        // Swing delays every other subdivision (16ths on a 4-per-beat grid).
        const swing = p.swing && this.step % 2 === 1 ? p.swing * stepDur : 0;
        const gap = this.inGap();
        for (const key of VOICE_ORDER) {
          if (gap || this.muted.has(key)) continue;
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
      // Velocity 0.2..1.05 spreads evenly across however many layers the kit has
      // (3-layer kits: g -> 0, x -> 1, X -> 2).
      const L = layers.length;
      const idx = L === 1 ? 0 : Math.max(0, Math.min(L - 1, Math.round(((v - 0.2) / 0.85) * (L - 1))));
      const layer = layers[idx];
      this.rr[key] = (this.rr[key] ?? 0) + 1;
      const buf = layer[this.rr[key] % layer.length];
      // Layered kits encode most loudness in the sample; keep only the fine variation.
      const nominal = L === 1 ? 1 : 0.2 + (0.85 * idx) / (L - 1);
      const gain = L > 1 ? v / nominal : v;
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
