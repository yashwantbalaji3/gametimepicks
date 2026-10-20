// Per-day ranges for the three levers (full UTC days 10-12 → 10-18; 10-19 partial shown separately).
import fs from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const P = JSON.parse(fs.readFileSync(S + "pushes.json", "utf8"));
const built = (p) => p.o === "completed" || p.o === "failed";
const STRICT = new Set(["nba internal research", "forecast ledger", "soccer DC v2 shadow", "cron-slot coverage", "nfl sim v2 shadow", "top boards", "mlb pregame archive metadata", "auto-refresh (ops)"]);
const BROAD = new Set([...STRICT, "pregame weather", "soccer leagues", "ufc", "injuries facts", "morning projections", "epl", "nba other"]);
function debounce(ps, w, botOnly) {
  // bot pushes within w minutes of a group's first push share ONE build; human pushes always build alone (if they have input)
  let groups = 0, g0 = null, has = false;
  for (const p of ps) {
    const human = p.headWriter === "PR merge / human";
    if (botOnly && human) { if (p.ownReplay === "BUILD") groups++; continue; }
    const t = Date.parse(p.t);
    if (g0 == null || (t - g0) / 6e4 > w) { if (g0 != null && has) groups++; g0 = t; has = false; }
    if (p.ownReplay === "BUILD") has = true;
  }
  if (has) groups++;
  return ps.filter(built).length - groups;
}
const days = [...new Set(P.map((p) => p.day))].sort();
const rows = [];
console.log("day | completed+failed | L1 ignored | L1 inherited(NO_INPUT completed) | L2 bot debounce 5/10/15 | L3 strict/broad | NFL-input builds | NFL-only debounce 10");
for (const d of days) {
  const ps = P.filter((p) => p.day === d);
  const comp = ps.filter((p) => p.o === "completed");
  const r = {
    d, b: ps.filter(built).length,
    ign: ps.filter((p) => p.o === "ignored").length,
    inh: comp.filter((p) => p.ownReplay === "SKIP").length,
    db: [5, 10, 15].map((w) => debounce(ps, w, true)),
    l3s: comp.filter((p) => p.inputWriters.length && p.inputWriters.every((w) => STRICT.has(w))).length,
    l3b: comp.filter((p) => p.inputWriters.length && p.inputWriters.every((w) => BROAD.has(w))).length,
    nfl: comp.filter((p) => p.inputWriters.some((w) => w.startsWith("nfl"))).length,
  };
  rows.push(r);
  console.log(`| ${d} | ${r.b} | ${r.ign} | ${r.inh} | ${r.db.join("/")} | ${r.l3s}/${r.l3b} | ${r.nfl} |`);
}
const full = rows.filter((r) => r.d <= "2026-10-18");
const rng = (f) => { const v = full.map(f); return `${Math.min(...v)}–${Math.max(...v)} (mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)})`; };
console.log("full-day ranges n=7:", "built", rng((r) => r.b), "| L1 ignored", rng((r) => r.ign), "| L1 inherited", rng((r) => r.inh), "| L2 db5", rng((r) => r.db[0]), "db10", rng((r) => r.db[1]), "db15", rng((r) => r.db[2]), "| L3 strict", rng((r) => r.l3s), "broad", rng((r) => r.l3b));
// L1 detail: which writers' ignored pushes, and inherited builds' head writers
const ig = P.filter((p) => p.o === "ignored").reduce((m, p) => (m[p.headWriter] = (m[p.headWriter] ?? 0) + 1, m), {});
const inh = P.filter((p) => p.o === "completed" && p.ownReplay === "SKIP").reduce((m, p) => (m[p.headWriter] = (m[p.headWriter] ?? 0) + 1, m), {});
console.log("ignored by head writer", JSON.stringify(ig));
console.log("inherited completed by head writer", JSON.stringify(inh));
const recent = P.filter((p) => p.t >= "2026-10-18T04:54");
console.log("since 10-18T04:54Z: inherited", recent.filter((p) => p.o === "completed" && p.ownReplay === "SKIP").map((p) => p.head.slice(0, 10) + " " + p.headWriter).join(", "), "| ignored", recent.filter((p) => p.o === "ignored").length);
// L2 safety: how many debounce-merged groups would delay an NFL receipts push, and the human-excluded share
const nflSun = P.filter((p) => p.day === "2026-10-18");
console.log("NFL Sunday 10-18: built", nflSun.filter(built).length, "bot debounce 10 avoided", debounce(nflSun, 10, true), "NFL-headed completed", nflSun.filter((p) => p.o === "completed" && p.headWriter.startsWith("nfl")).length);
