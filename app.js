import { DrumEngine } from "./engine.js";
import { PATTERNS } from "./patterns.js";

const $ = (id) => document.getElementById(id);
const eng = new DrumEngine();
const saved = JSON.parse(localStorage.getItem("groove") || "{}");
// Kit settings saved before v8 may point at a part-synth kit (v2's default); reset once.
if ((saved.kitVersion ?? 0) < 8) { delete saved.kit; saved.kitAuto = true; }
let kitAuto = saved.kitAuto ?? true;
const tempos = saved.tempos ?? {};        // groove name -> last hand-set BPM
const muted = new Set(saved.muted ?? []); // voice keys silenced   // follow each groove's suggested kit until the user picks one

PATTERNS.forEach((p, i) => $("pattern").add(new Option(p.name, i)));
$("pattern").value = saved.pattern ?? 0;

function loadPattern() {
  eng.pattern = PATTERNS[$("pattern").value];
  const g = $("grid");
  g.style.gridTemplateColumns = `repeat(${eng.pattern.steps}, 1fr)`;
  g.innerHTML = "";
  for (let i = 0; i < eng.pattern.steps; i++) {
    const c = document.createElement("div");
    const hit = "kst".split("").some((k) => /[Xx]/.test(eng.pattern.main[k]?.[i] ?? ""));
    c.className = "cell" + (hit ? " on" : "");
    g.append(c);
  }
  save();
}

function save() {
  localStorage.setItem("groove", JSON.stringify({
    pattern: $("pattern").value, bpm: eng.bpm, kit: $("kit").value,
    feel: $("feel").value, fills: $("fills").value, song: $("song").value, kitAuto, kitVersion: 8,
    tempos, muted: [...muted], gap: $("gap").value,
  }));
}

// Feel options apply live, no restart needed.
$("feel").value = saved.feel ?? 50;
$("fills").value = saved.fills ?? "4";
function applyFeel() {
  eng.feel = $("feel").value / 100;
  eng.fillEvery = +$("fills").value;
  save();
}
$("feel").oninput = applyFeel;

// Song mode: "v8,c8" -> [{section: "verse", bars: 8}, {section: "chorus", bars: 8}]
$("song").value = saved.song ?? "";
function applySong() {
  const v = $("song").value;
  eng.song = v ? v.split(",").map((x) => ({ section: x[0] === "v" ? "verse" : "chorus", bars: +x.slice(1) })) : null;
  if (eng.song && eng.playing) { eng.songIdx = 0; eng.phraseBar = 0; eng.setSection(eng.song[0].section); }
  save();
}
$("song").onchange = applySong;

// Live status: song position and speed-trainer progress, in sync with the audio.
eng.onBar = (i) => {
  if (!eng.playing) return;
  const parts = [];
  if (i.bar < 0) parts.push("count-in");
  else if (i.gap) parts.push("— gap: keep time —");
  else if (i.partBars) parts.push(`${i.section === "verse" ? "Verse" : "Chorus"} ${i.partBar}/${i.partBars}`);
  if (i.trainer) parts.push(i.trainer.bpm >= i.trainer.max ? `at target ${i.trainer.max}` : `→ ${i.trainer.max} · +${eng.trainer.add} in ${i.trainer.inBars} bar${i.trainer.inBars > 1 ? "s" : ""}`);
  $("status").textContent = parts.join("  ·  ");
};
$("dropback").onclick = () => eng.setBpm(eng.bpm - 10);

// Each groove remembers the tempo you last set by hand (trainer climbs don't count).
function userBpm(b) {
  eng.setBpm(b);
  tempos[eng.pattern.name] = eng.bpm;
  save();
}

// Mutes apply instantly; gap trainer applies from the next bar.
for (const b of document.querySelectorAll(".mute")) {
  const keys = [...b.dataset.keys];
  b.classList.toggle("on", keys.every((k) => muted.has(k)));
  b.onclick = () => {
    const on = !b.classList.contains("on");
    keys.forEach((k) => (on ? muted.add(k) : muted.delete(k)));
    b.classList.toggle("on", on);
    eng.muted = new Set(muted);
    save();
  };
}
eng.muted = new Set(muted);
$("gap").value = saved.gap ?? "";
function applyGap() {
  const [play, silent] = $("gap").value.split(",").map(Number);
  eng.gap = play ? { play, silent } : null;
  save();
}
$("gap").onchange = applyGap;

// Sections: the button pulses while the change waits for its transition fill.
eng.onSection = (cur, pending) => {
  for (const id of ["verse", "chorus"]) {
    $(id).classList.toggle("on", id === cur);
    $(id).classList.toggle("queued", id === pending);
  }
};
$("verse").onclick = () => eng.setSection("verse");
$("chorus").onclick = () => eng.setSection("chorus");
eng.onSection("verse");
$("fills").onchange = applyFeel;

$("kit").value = saved.kit ?? PATTERNS[$("pattern").value]?.kit ?? "muldjord";
let kitLoaded = null;
async function ensureKit() {
  if (kitLoaded === $("kit").value) return;
  kitLoaded = $("kit").value;
  await eng.loadKit(kitLoaded);
}
$("kit").onchange = () => {
  kitAuto = $("kit").value === (eng.pattern?.kit ?? "muldjord");
  save(); if (eng.ctx) ensureKit();
};

eng.onBpm = (b) => { $("bpm").textContent = b; $("slider").value = b; save(); };
eng.setBpm(saved.bpm ?? 90);
loadPattern();
applyFeel();
applySong();
applyGap();

// Pattern switch while playing takes effect at the next step; reset to bar start.
// Grooves can suggest a kit (jazz -> bop kit). Follow the suggestion unless the user picked a kit by hand.
$("pattern").onchange = () => {
  loadPattern(); eng.step = 0; eng.grid = null;
  if (tempos[eng.pattern.name]) eng.setBpm(tempos[eng.pattern.name]);
  if (kitAuto) {
    $("kit").value = eng.pattern.kit ?? "muldjord";
    save(); if (eng.ctx) ensureKit();
  }
};
$("slider").oninput = (e) => userBpm(+e.target.value);
document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => userBpm(eng.bpm + +b.dataset.d)));

let taps = [];
$("tap").onclick = () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500).concat(now);
  if (taps.length >= 2) {
    const avg = (taps.at(-1) - taps[0]) / (taps.length - 1);
    userBpm(60000 / avg);
  }
};

// Visual playhead: queue step changes, render them when the audio clock reaches them.
const queue = [];
eng.onStep = (step, time, bar) => queue.push({ step, time, bar });
let lastCell = null;
function draw() {
  if (eng.playing) {
    while (queue.length && queue[0].time <= eng.ctx.currentTime) {
      const { step, bar } = queue.shift();
      lastCell?.classList.remove("now");
      lastCell = bar < 0 ? null : $("grid").children[step];
      lastCell?.classList.add("now");
    }
  }
  requestAnimationFrame(draw);
}
draw();

let wakeLock = null;
$("play").onclick = async () => {
  if (eng.playing) {
    eng.stop();
    queue.length = 0;
    lastCell?.classList.remove("now");
    wakeLock?.release(); wakeLock = null;
    $("play").textContent = "Play"; $("play").classList.remove("on");
    $("status").textContent = ""; $("dropback").style.display = "none";
    return;
  }
  eng.countIn = $("countin").checked ? 1 : 0;
  eng.trainer = $("trainer").checked
    ? { add: +$("tradd").value, every: +$("trevery").value, max: +$("trmax").value }
    : null;
  $("dropback").style.display = eng.trainer ? "" : "none";
  await ensureKit();
  await eng.start();
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  $("play").textContent = "Stop"; $("play").classList.add("on");
};

// iOS suspends audio on calls, Siri, or app switches; pick back up when we return.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !eng.playing) return;
  if (eng.ctx.state !== "running") {
    await eng.ctx.resume();
    eng.nextTime = eng.ctx.currentTime + 0.05;   // don't burst-play the backlog
  }
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
});

// Space bar toggles play (iPad keyboard, desktop).
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT") { e.preventDefault(); $("play").click(); }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
