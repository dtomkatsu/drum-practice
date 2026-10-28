// Logic check for the variation engine: 400 bars per groove at Variety = Lots.
// Verifies bar lengths, that accented backbones never move, locked kicks stay put,
// and reports how many distinct bars/fills each groove produces.
// Run: node tests/variation.test.mjs
const { DrumEngine } = await import("../engine.js");
const { PATTERNS } = await import("../patterns.js");
let problems = 0;
for (const p of PATTERNS) {
  const e = new DrumEngine(); e.pattern = p; e.variety = 1; e.fillEvery = 4; e.section = "verse";
  e.phraseBar = 0; e.crashNext = false;
  const bars = new Set(), fills = new Set();
  for (let bar = 0; bar < 400; bar++) {
    const isFill = !!p.fill && (e.phraseBar + 1) % 4 === 0;
    const g = e.barGrid();
    (isFill ? fills : bars).add(JSON.stringify(g));
    for (const [k, row] of Object.entries(g)) if (row && row.length !== p.steps) { problems++; console.log("LENGTH", p.name, k, row); }
    if (!isFill) {
      for (const k of ["k", "s", "t"]) [...(p.main[k] ?? "")].forEach((c, i) => {
        if (c === "X" && g[k]?.[i] !== "X" && !p.alt?.[k]) { problems++; console.log("BACKBONE", p.name, k, i); }
      });
      if (p.lockKick && !p.comp && g.k !== p.main.k && !p.alt?.k) { problems++; console.log("KICK MOVED", p.name); }
    }
    e.phraseBar++;
  }
  console.log(p.name.padEnd(26), "bars:", String(bars.size).padStart(3), " fills:", fills.size);
}
console.log(problems ? `FAIL: ${problems} problems` : "OK: 0 problems");
process.exit(problems ? 1 : 0);
