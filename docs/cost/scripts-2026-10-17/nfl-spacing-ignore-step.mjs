// Spacing implemented in the IGNORE STEP (window commits still land on main; a deferred window push's content rides the
// NEXT push of anything, which then builds). Replayed on the real push stream 10-09 → 10-17 (writers.json).
import fs from "node:fs";
const S = process.argv[2];
const { pushes } = JSON.parse(fs.readFileSync(`${S}/wb/writers.json`, "utf8"));
const { kick, events } = JSON.parse(fs.readFileSync(`${S}/wb/nflmat.json`, "utf8"));
const evBy = new Map(events.map((e) => [e.h, e]));
const kos = [...new Set(Object.values(kick).map((k) => Date.parse(k.ko)))].sort((a, b) => a - b);
const nextKoH = (t) => { const k = kos.find((x) => x > t); return k ? (k - t) / 36e5 : Infinity; };
const MAT = new Set(["FORECAST_NUMBER", "FORECAST_STATE", "PLAYER_BOARD", "INJURY_STATUS"]);
const LAG = 6 * 6e4;
const V = {
  "60 min everywhere": (t, last) => t - last >= 60 * 6e4,
  "120 min everywhere": (t, last) => t - last >= 120 * 6e4,
  "60 min, none within T-3h": (t, last) => nextKoH(t) <= 3 || t - last >= 60 * 6e4,
  "120 min, none within T-3h": (t, last) => nextKoH(t) <= 3 || t - last >= 120 * 6e4,
  "60 min, none within T-6h": (t, last) => nextKoH(t) <= 6 || t - last >= 60 * 6e4,
  "120 min, none within T-6h": (t, last) => nextKoH(t) <= 6 || t - last >= 120 * 6e4,
};
const days = (Date.parse(pushes.at(-1).t) - Date.parse(pushes[0].t)) / 864e5;
const isWin = (p) => p.commits.some((c) => /nfl event window/.test(c.s)) && p.commits.every((c) => /^auto: nfl (event window|settlement receipts|sim v2 shadow)/.test(c.s));
const NFLRE = /^auto: nfl (event window|settlement receipts|sim v2 shadow)/;
const kindOf = (p) => p.commits.every((c) => NFLRE.test(c.s)) ? "NFL" : (p.outcome === "ignored" || p.cls === "NO_INPUT") ? "NONINPUT" : "INPUT";
for (const [name, keep] of Object.entries(V)) {
  const realByK = {}, simByK = {}; let lastBuild = -Infinity, pending = [], realBuilds = 0, simBuilds = 0, delays = [], missed = 0, missedFC = 0, mat = 0, ex = [], maxStrand = 0;
  const deliver = (t) => { for (const c of pending) { const d = (t + LAG - c.base) / 6e4; delays.push(d); if (t + LAG >= c.ko && c.base < c.ko) { missed++; if (c.kind.startsWith("FORECAST")) missedFC++; if (ex.length < 6) ex.push(c.desc); } } pending = []; };
  for (const p of pushes) {
    const t = Date.parse(p.t); const k = kindOf(p);
    const own = p.commits.filter((c) => /nfl event window/.test(c.s)).flatMap((c) => evBy.get(c.h.slice(0, 10))?.changes ?? []).filter((c) => MAT.has(c.kind) && c.hToKo > 0);
    mat += own.length;
    const hasNfl = p.commits.some((c) => /nfl event window|nfl settlement receipts/.test(c.s));
    if (k === "INPUT") { if (p.outcome === "completed") { deliver(t); lastBuild = t; } continue; }
    if (p.outcome === "completed") { realBuilds++; realByK[k] = (realByK[k] ?? 0) + 1; }
    if (!hasNfl && !pending.length) { if (p.outcome === "completed") { simBuilds++; simByK[k] = (simByK[k] ?? 0) + 1; lastBuild = t; } continue; }
    for (const c of own) pending.push({ base: t + LAG, ko: Date.parse(kick[c.id].ko), kind: c.kind, desc: `${p.t.slice(5, 16)} ${kick[c.id].m} ${c.kind} ${c.what ?? ""} T-${c.hToKo}h`.slice(0, 170) });
    if (hasNfl && !own.length) pending.push({ base: t + LAG, ko: Infinity, kind: "-" });
    if (keep(t, lastBuild)) { simBuilds++; simByK[k] = (simByK[k] ?? 0) + 1; deliver(t); lastBuild = t; }
  }
  delays.sort((a, b) => a - b);
  console.log(name.padEnd(28), JSON.stringify({ realCompletedNflOrNonInput: realBuilds, simulated: simBuilds, avoidedPerDay: +((realBuilds - simBuilds) / days).toFixed(2), materialPreKickoff: mat, missedCutoff: missed, missedForecast: missedFC, strandedAtEnd: pending.length, realByK, simByK, delayMin: delays.length ? { n: delays.length, p50: Math.round(delays[delays.length >> 1]), p90: Math.round(delays[Math.floor(delays.length * 0.9)]), max: Math.round(delays.at(-1)) } : null }), ex.length ? "\n    e.g. " + ex.join("\n    e.g. ") : "");
}
console.log("days", days.toFixed(2));
