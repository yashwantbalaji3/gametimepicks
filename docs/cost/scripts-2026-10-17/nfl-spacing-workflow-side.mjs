import fs from "node:fs";
const [IN, FROM = "2026-10-01", TO = "2026-10-18"] = process.argv.slice(2);
const { kick, events: all } = JSON.parse(fs.readFileSync(IN, "utf8"));
const ev = all.filter((e) => e.t >= FROM && e.t < TO);
const T = ev.map((e) => Date.parse(e.t)); const LAG = 6 * 6e4;
const kos = [...new Set(Object.values(kick).map((k) => Date.parse(k.ko)))].sort((a, b) => a - b);
const nextKoH = (t) => { const k = kos.find((x) => x > t); return k ? (k - t) / 36e5 : Infinity; };
const MAT = new Set(["FORECAST_NUMBER", "FORECAST_STATE", "PLAYER_BOARD", "INJURY_STATUS"]);
const variants = {
  "none": () => true,
  "60 min everywhere": (i, last) => T[i] - last >= 60 * 6e4,
  "120 min everywhere": (i, last) => T[i] - last >= 120 * 6e4,
  "60 min, none within T-3h": (i, last) => nextKoH(T[i]) <= 3 || T[i] - last >= 60 * 6e4,
  "120 min, none within T-3h": (i, last) => nextKoH(T[i]) <= 3 || T[i] - last >= 120 * 6e4,
  "60 min, none within T-6h": (i, last) => nextKoH(T[i]) <= 6 || T[i] - last >= 60 * 6e4,
  "120 min, none within T-6h": (i, last) => nextKoH(T[i]) <= 6 || T[i] - last >= 120 * 6e4,
  "60 min only when next kickoff > 24h": (i, last) => nextKoH(T[i]) <= 24 || T[i] - last >= 60 * 6e4,
};
const days = (T.at(-1) - T[0]) / 864e5;
const out = {};
for (const [name, keep] of Object.entries(variants)) {
  const kept = []; let last = -Infinity;
  for (let i = 0; i < T.length; i++) if (keep(i, last)) { kept.push(i); last = T[i]; }
  const keptSet = new Set(kept);
  const nextKept = (i) => kept.find((k) => k >= i);
  let mat = 0, missed = 0, missedFC = 0, delays = [], deferred = 0, missedList = [];
  let baseMissed = 0;
  for (let i = 1; i < ev.length; i++) for (const c of ev[i].changes) {
    if (!MAT.has(c.kind) || !(c.hToKo > 0)) continue; mat++;
    const ko = Date.parse(kick[c.id].ko); const base = T[i] + LAG; if (base >= ko) baseMissed++;
    const k = nextKept(i); const served = k == null ? Infinity : T[k] + LAG;
    if (k !== i) { deferred++; delays.push((served - base) / 6e4); }
    if (served >= ko && base < ko) { missed++; if (c.kind.startsWith("FORECAST")) missedFC++; if (missedList.length < 12) missedList.push(`${ev[i].t.slice(5, 16)} ${kick[c.id].m} ${c.kind} ${c.what ?? ""} (T-${c.hToKo}h; next publish ${k == null ? "none" : ev[k].t.slice(5, 16)})`.slice(0, 220)); }
  }
  delays.sort((a, b) => a - b);
  out[name] = { publishes: T.length, kept: kept.length, avoidedPerDay: +((T.length - kept.length) / days).toFixed(2), matChanges: mat, deferred, missedCutoff: missed, missedCutoffForecast: missedFC, baselineMissed: baseMissed,
    delayMin: delays.length ? { p50: Math.round(delays[delays.length >> 1]), p90: Math.round(delays[Math.floor(delays.length * 0.9)]), max: Math.round(delays.at(-1)) } : null, missedList };
}
console.log(JSON.stringify({ from: ev[0].t, to: ev.at(-1).t, days: +days.toFixed(2), out }, null, 1));
