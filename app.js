import { DrumEngine } from "./engine.js";
import { PATTERNS } from "./patterns.js";

const $ = (id) => document.getElementById(id);
const eng = new DrumEngine();
const saved = JSON.parse(localStorage.getItem("groove") || "{}");

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
    feel: $("feel").value, fills: $("fills").value,
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

$("kit").value = saved.kit ?? "muldjord";
let kitLoaded = null;
async function ensureKit() {
  if (kitLoaded === $("kit").value) return;
  kitLoaded = $("kit").value;
  await eng.loadKit(kitLoaded);
}
$("kit").onchange = () => { save(); if (eng.ctx) ensureKit(); };

eng.onBpm = (b) => { $("bpm").textContent = b; $("slider").value = b; save(); };
eng.setBpm(saved.bpm ?? 90);
loadPattern();
applyFeel();

// Pattern switch while playing takes effect at the next step; reset to bar start.
$("pattern").onchange = () => { loadPattern(); eng.step = 0; eng.grid = null; };
$("slider").oninput = (e) => eng.setBpm(+e.target.value);
document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => eng.setBpm(eng.bpm + +b.dataset.d)));

let taps = [];
$("tap").onclick = () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500).concat(now);
  if (taps.length >= 2) {
    const avg = (taps.at(-1) - taps[0]) / (taps.length - 1);
    eng.setBpm(60000 / avg);
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
    return;
  }
  eng.countIn = $("countin").checked ? 1 : 0;
  eng.trainer = $("trainer").checked
    ? { add: +$("tradd").value, every: +$("trevery").value, max: +$("trmax").value }
    : null;
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
