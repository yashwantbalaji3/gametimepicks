import fs from "node:fs";
const S = process.argv[2]; const R = JSON.parse(fs.readFileSync(`${S}/push-replay.json`, "utf8"));
const days = (Date.parse(R.at(-1).t) - Date.parse(R[0].t)) / 864e5;
console.log("window", R[0].t, "→", R.at(-1).t, "days", days.toFixed(2), "deployments", R.length);
const cnt = (a, f) => a.reduce((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
console.log("outcome", cnt(R, (r) => r.outcome));
const C = R.filter((r) => r.outcome === "completed");
console.log("completed by cls", cnt(C, (r) => r.cls));
console.log("completed by cls & prevOutcome", cnt(C, (r) => r.cls + "|" + r.prevOutcome));
const sumMin = (a) => a.reduce((s, r) => s + (r.min ?? 0), 0).toFixed(0);
// per-day table
const byDay = {};
for (const r of R) { const d = r.t.slice(0, 10); const b = (byDay[d] ??= { dep: 0, comp: 0, canc: 0, fail: 0, noin: 0, stampN: 0, stampB: 0, mean: 0, compMin: 0 }); b.dep++; if (r.outcome === "completed") { b.comp++; b.compMin += r.min; b[{ NO_INPUT: "noin", STAMP_ONLY_NARROW: "stampN", STAMP_ONLY_BROAD: "stampB", MEANINGFUL: "mean" }[r.cls]]++; } else if (r.outcome === "canceled") b.canc++; else if (r.outcome === "failed") b.fail++; }
console.log("day dep comp canc fail | completed: noInput stampNarrow stampBroadOnly meaningful | compMin");
for (const [d, b] of Object.entries(byDay)) console.log(d, b.dep, b.comp, b.canc, b.fail, "|", b.noin, b.stampN, b.stampB, b.mean, "|", b.compMin.toFixed(0));
// bucket attribution
const key = (r) => r.buckets.length === 1 ? r.buckets[0] : r.buckets.slice().sort().join(" + ");
console.log("\n== completed NO_INPUT (prev completed → redundant) by push buckets");
console.log(cnt(C.filter((r) => r.cls === "NO_INPUT"), (r) => key(r) + (r.prevOutcome === "completed" ? "" : " [prev " + r.prevOutcome + "]")));
console.log("\n== completed STAMP_ONLY by push buckets (N=narrow, B=broad-only) + keys");
for (const r of C.filter((r) => r.cls.startsWith("STAMP"))) console.log(r.t.slice(5, 16), r.cls.at(-6) === "NARROW" ? "N" : "B", key(r), r.stampKeys.join(","), r.prevOutcome);
console.log("\n== completed MEANINGFUL: which buckets made it necessary (sole-cause counts)");
const M = C.filter((r) => r.cls === "MEANINGFUL");
console.log(cnt(M, (r) => r.meaningfulBy.length === 1 ? "SOLE " + r.meaningfulBy[0] : "MULTI " + r.meaningfulBy.slice().sort().join("+")));
console.log("\n== per bucket: completed pushes containing it");
const inv = {}; for (const r of C) for (const b of r.buckets) inv[b] = (inv[b] ?? 0) + 1; console.log(inv);
console.log("\nsum completed min", sumMin(C), "median", C.map((r) => r.min).sort((a, b) => a - b)[C.length >> 1]);
