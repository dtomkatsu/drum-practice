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
    humanize: $("humanize").checked, fills: $("fills").value,
  }));
}

// Feel options apply live, no restart needed.
$("humanize").checked = saved.humanize ?? true;
$("fills").value = saved.fills ?? "4";
function applyFeel() {
  eng.humanize = $("humanize").checked;
  eng.fillEvery = +$("fills").value;
  save();
}
$("humanize").onchange = applyFeel;
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
