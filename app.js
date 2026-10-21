import { DrumEngine } from "./engine.js";
import { PATTERNS } from "./patterns.js";

const $ = (id) => document.getElementById(id);
const eng = new DrumEngine();
const saved = JSON.parse(localStorage.getItem("groove") || "{}");
// Kit settings saved before v8 may point at a part-synth kit (v2's default); reset once.
if ((saved.kitVersion ?? 0) < 8) { delete saved.kit; saved.kitAuto = true; }
// v11 introduces the DRS kits: anyone still following the default moves to them.
if ((saved.kitVersion ?? 0) < 11 && saved.kitAuto !== false) delete saved.kit;
let kitAuto = saved.kitAuto ?? true;     // follow each groove's suggested kit until the user picks one
const tempos = saved.tempos ?? {};        // groove name -> last hand-set BPM
const muted = new Set(saved.muted ?? []); // voice keys silenced

PATTERNS.forEach((p, i) => $("pattern").add(new Option(p.name, i)));
$("pattern").value = saved.pattern ?? 0;

// Drum lanes: one summary lane on the main screen, per-drum lanes (tap to mute) in the Sound sheet.
const LANES = [
  { label: "Hats/Ride", keys: "hor" }, { label: "Snare", keys: "st" },
  { label: "Kick", keys: "k" }, { label: "Cym/Toms", keys: "c123" },
];
function laneRow(label, keys, steps) {
  const row = document.createElement("div");
  row.className = "lane";
  row.innerHTML = `<span>${label}</span><div class="cells" style="grid-template-columns:repeat(${steps},1fr)"></div>`;
  const cells = row.lastChild;
  for (let i = 0; i < steps; i++) {
    const c = document.createElement("i");
    if ([...keys].some((k) => /[Xxg]/.test(eng.pattern.main[k]?.[i] ?? ""))) c.className = "on";
    cells.append(c);
  }
  return row;
}
function loadPattern() {
  eng.pattern = PATTERNS[$("pattern").value];
  const steps = eng.pattern.steps;
  $("mainlane").replaceChildren(laneRow("", "kst", steps));
  $("mainlane").firstChild.style.gridTemplateColumns = "0 1fr";
  $("mixlanes").replaceChildren(...LANES.map((l) => {
    const row = laneRow(l.label, l.keys, steps);
    const sync = () => row.classList.toggle("off", [...l.keys].every((k) => muted.has(k)));
    row.onclick = () => {
      const on = !row.classList.contains("off");
      [...l.keys].forEach((k) => (on ? muted.add(k) : muted.delete(k)));
      eng.muted = new Set(muted);
      sync(); save();
    };
    sync();
    return row;
  }));
  save();
}

// Text that mirrors the native pickers.
const optText = (id) => $(id).selectedOptions[0]?.text ?? "";
function refreshLabels() {
  const p = eng.pattern; if (!p) return;
  const meter = p.steps === 9 ? "3/4" : p.perBeat === 3 ? "12/8 feel" : "4/4";
  $("grooveName").textContent = p.name;
  const off = LANES.filter((l) => [...l.keys].every((k) => muted.has(k))).map((l) => l.label.toLowerCase());
  $("grooveSub").textContent = `${optText("kit")} · ${meter}` + (off.length ? ` · ${off.join(", ")} muted` : "");
  $("kitName").textContent = optText("kit");
  $("songName").textContent = optText("song");
  $("gapName").textContent = optText("gap");
  $("trainerSub").classList.toggle("show", $("trainer").checked);
  $("sections").style.display = eng.song ? "none" : "";
}

function save() {
  localStorage.setItem("groove", JSON.stringify({
    pattern: $("pattern").value, bpm: eng.bpm, kit: $("kit").value,
    feel: $("feel").value, fills: String(eng.fillEvery), song: $("song").value, kitAuto, kitVersion: 11,
    tempos, muted: [...muted], gap: $("gap").value,
    countin: $("countin").checked,
    trainer: { on: $("trainer").checked, add: $("tradd").value, every: $("trevery").value, max: $("trmax").value },
  }));
  refreshLabels();
}

// Feel options apply live, no restart needed.
$("feel").value = saved.feel ?? 50;
eng.fillEvery = +(saved.fills ?? 4);
for (const b of $("fills").children) {
  b.onclick = () => { eng.fillEvery = +b.dataset.v; syncFills(); save(); };
}
function syncFills() { for (const b of $("fills").children) b.classList.toggle("on", +b.dataset.v === eng.fillEvery); }
syncFills();
function applyFeel() {
  eng.feel = $("feel").value / 100;
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
  $("dropback").hidden = !i.trainer;
  $("pill").classList.toggle("idle", !parts.length);
};
$("dropback").onclick = () => eng.setBpm(eng.bpm - 10);

// Each groove remembers the tempo you last set by hand (trainer climbs don't count).
function userBpm(b) {
  eng.setBpm(b);
  tempos[eng.pattern.name] = eng.bpm;
  save();
}

// Gap trainer applies from the next bar.
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

$("kit").value = saved.kit ?? PATTERNS[$("pattern").value]?.kit ?? "drs";
let kitLoaded = null;
async function ensureKit() {
  if (kitLoaded === $("kit").value) return;
  kitLoaded = $("kit").value;
  await eng.loadKit(kitLoaded);
}
$("kit").onchange = () => {
  kitAuto = $("kit").value === (eng.pattern?.kit ?? "drs");
  save(); if (eng.ctx) ensureKit();
};

eng.onBpm = (b) => { $("bpm").textContent = b; save(); };
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
    $("kit").value = eng.pattern.kit ?? "drs";
    save(); if (eng.ctx) ensureKit();
  }
};
// Tempo: tap the number to tap tempo, drag it up/down to sweep, −/+ (hold to repeat) for fine steps.
let taps = [];
function tapTempo() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500).concat(now);
  if (taps.length >= 2) userBpm(60000 / ((taps.at(-1) - taps[0]) / (taps.length - 1)));
  $("bpmbox").classList.add("tapped");
  setTimeout(() => $("bpmbox").classList.remove("tapped"), 90);
}
let drag = null;
$("bpmbox").onpointerdown = (e) => { drag = { y: e.clientY, bpm: eng.bpm, moved: false }; $("bpmbox").setPointerCapture(e.pointerId); };
$("bpmbox").onpointermove = (e) => {
  if (!drag) return;
  const dy = drag.y - e.clientY;
  if (Math.abs(dy) > 8) drag.moved = true;
  if (drag.moved) userBpm(drag.bpm + Math.round(dy / 4));   // 4 px per BPM
};
$("bpmbox").onpointerup = () => { if (drag && !drag.moved) tapTempo(); drag = null; };
$("bpmbox").onpointercancel = () => { drag = null; };

for (const b of document.querySelectorAll("[data-d]")) {
  let hold;
  const step = () => userBpm(eng.bpm + +b.dataset.d);
  b.onpointerdown = () => { step(); hold = setTimeout(function rep() { step(); hold = setTimeout(rep, 70); }, 400); };
  b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(hold);
}

// Bottom sheets.
function openSheet(id) {
  document.querySelectorAll(".sheet").forEach((s) => s.classList.toggle("open", s.id === id));
  document.body.classList.add("sheet-open");
}
function closeSheets() {
  document.querySelectorAll(".sheet").forEach((s) => s.classList.remove("open"));
  document.body.classList.remove("sheet-open");
}
$("openSound").onclick = () => openSheet("soundSheet");
$("openPractice").onclick = () => openSheet("practiceSheet");
$("scrim").onclick = closeSheets;
document.querySelectorAll(".grab").forEach((g) => (g.onclick = closeSheets));

// Practice settings: restore, and apply live while playing.
$("countin").checked = saved.countin ?? true;
const tr = saved.trainer ?? {};
$("trainer").checked = !!tr.on;
if (tr.add) $("tradd").value = tr.add;
if (tr.every) $("trevery").value = tr.every;
if (tr.max) $("trmax").value = tr.max;
function applyTrainer() {
  eng.trainer = $("trainer").checked
    ? { add: +$("tradd").value || 1, every: +$("trevery").value || 1, max: +$("trmax").value || 240 }
    : null;
  if (!eng.trainer) $("dropback").hidden = true;
  save();
}
for (const id of ["trainer", "tradd", "trevery", "trmax"]) $(id).onchange = applyTrainer;
$("countin").onchange = save;
$("gap").addEventListener("change", refreshLabels);

// Visual playhead: queue step changes, render them when the audio clock reaches them.
const queue = [];
eng.onStep = (step, time, bar) => queue.push({ step, time, bar });
let lit = [];
function light(step) {
  lit.forEach((c) => c.classList.remove("now"));
  lit = step == null ? [] : [...document.querySelectorAll(`.cells i:nth-child(${step + 1})`)];
  lit.forEach((c) => c.classList.add("now"));
}
function draw() {
  if (eng.playing) {
    while (queue.length && queue[0].time <= eng.ctx.currentTime) {
      const { step, bar } = queue.shift();
      light(bar < 0 ? null : step);
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
    light(null);
    wakeLock?.release(); wakeLock = null;
    $("play").textContent = "Play"; $("play").classList.remove("on");
    $("status").textContent = ""; $("dropback").hidden = true; $("pill").classList.add("idle");
    return;
  }
  eng.countIn = $("countin").checked ? 1 : 0;
  applyTrainer();
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

save();   // persist restored settings once everything is wired

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
