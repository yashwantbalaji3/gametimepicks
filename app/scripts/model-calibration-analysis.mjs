/**
 * Model calibration analysis — offline, read-only, no live wiring.
 *
 * Answers: do the model's claimed quality signals (confidence / edgePct /
 * legScore) actually predict leg + slip outcomes, using ONLY settled
 * public-era slates? Reads optimizer-graded JSON; never uses same-day
 * results to judge same-day generation (it judges each already-graded leg
 * against its own final result, which is post-hoc — there is no forward
 * leakage). May 25/26 excluded. Pending/unresolved legs excluded.
 *
 * Leg rows are DEDUPED by (date, leanId): a leg reused across many public
 * slips counts once, so calibration isn't biased by exposure.
 *
 * Run: cd app && npx tsx scripts/model-calibration-analysis.mjs
 */
import { readFileSync } from "node:fs";

const DATES = ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-06-01"];
const impliedProb = (o) => (o >= 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
const amerToDec = (o) => (o >= 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o));
const confRank = (c) => ({ High: 3, Medium: 2, Low: 1 }[c] ?? 0);

function load(date) {
  try { return JSON.parse(readFileSync(`public/data/parlays/optimizer-graded/${date}.json`, "utf8")); }
  catch { return null; }
}
function sectionOf(legs) {
  let d = 1;
  for (const l of legs) { if (l.oddsForSide == null) return null; d *= amerToDec(l.oddsForSide); }
  const c = d >= 2 ? (d - 1) * 100 : -100 / (d - 1);
  return c < 300 ? "low" : c < 600 ? "medium" : c < 1000 ? "high" : "longshot";
}
function rate(rows) {
  const n = rows.length, w = rows.filter((x) => x.win).length;
  return n ? `${w}/${n}=${Math.round((w / n) * 100)}%` : "—";
}

// ── Build deduped unique-leg dataset + slip dataset ───────────────────
const legs = [];
const slips = [];
const seen = new Set();
for (const date of DATES) {
  const g = load(date);
  if (!g) continue;
  for (const s of g.uniqueSlips ?? []) {
    const sec = sectionOf(s.legs);
    const confs = s.legs.map((l) => confRank(l.confidence));
    const markets = new Map();
    for (const l of s.legs) markets.set(l.market, (markets.get(l.market) ?? 0) + 1);
    slips.push({
      date, section: sec, size: s.legs.length, win: s.status === "win",
      sameGame: !!(s.sameGame || s.singleGame),
      maxSameMarket: Math.max(...markets.values()),
      avgConf: confs.reduce((a, b) => a + b, 0) / confs.length,
    });
    for (const l of s.legs) {
      const r = l.result;
      if (r !== "win" && r !== "loss") continue;
      const key = `${date}|${l.leanId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      legs.push({
        date, sport: l.sport, market: l.market, conf: l.confidence,
        edge: l.edgePct, legScore: l.legScore,
        odds: l.oddsForSide, imp: l.oddsForSide == null ? null : impliedProb(l.oddsForSide),
        recent10: l.recent10Count ?? 0, win: r === "win" ? 1 : 0,
      });
    }
  }
}
const N = legs.length, W = legs.reduce((a, x) => a + x.win, 0);
console.log(`Calibration dataset: ${N} unique legs, ${W} wins = ${(W / N * 100).toFixed(1)}% (public era May27-Jun1; deduped; pending excluded)\n`);

// ── Leg: confidence tier ──
console.log("LEG win rate by CONFIDENCE tier (is 'High' actually better?):");
for (const c of ["High", "Medium", "Low"]) {
  const rows = legs.filter((x) => x.conf === c);
  if (rows.length) console.log(`  ${c.padEnd(7)} ${rate(rows)}`);
}

// ── Leg: edge quartile ──
const es = legs.map((x) => x.edge).filter((e) => e != null).sort((a, b) => a - b);
const q = (p) => es[Math.floor(es.length * p)];
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
const ebkt = (e) => (e == null ? "?" : e < q1 ? "Q1 low" : e < q2 ? "Q2" : e < q3 ? "Q3" : "Q4 high");
console.log("\nLEG win rate by EDGE quartile (does higher claimed edge predict wins?):");
for (const b of ["Q1 low", "Q2", "Q3", "Q4 high"]) console.log(`  ${b.padEnd(8)} ${rate(legs.filter((x) => ebkt(x.edge) === b))}`);

// ── Leg: implied-prob calibration + Brier ──
console.log("\nIMPLIED-PROB calibration (market-implied vs ACTUAL):");
const bands = [[0, 0.4], [0.4, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 0.7], [0.7, 1.01]];
for (const [lo, hi] of bands) {
  const rows = legs.filter((x) => x.imp != null && x.imp >= lo && x.imp < hi);
  if (!rows.length) continue;
  const ai = rows.reduce((a, x) => a + x.imp, 0) / rows.length;
  const act = rows.reduce((a, x) => a + x.win, 0) / rows.length;
  console.log(`  implied ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%  n=${String(rows.length).padStart(3)}  implied=${(ai * 100).toFixed(0)}%  ACTUAL=${(act * 100).toFixed(0)}%  gap=${(act * 100 - ai * 100 >= 0 ? "+" : "")}${(act * 100 - ai * 100).toFixed(0)}pp`);
}
const impLegs = legs.filter((x) => x.imp != null);
const brier = impLegs.reduce((a, x) => a + (x.imp - x.win) ** 2, 0) / impLegs.length;
console.log(`  Brier (implied as predictor): ${brier.toFixed(4)}  (0.25 = coin-flip baseline)`);

// ── Does the model's own ranking separate winners? ──
const split = (field) => {
  const v = [...legs].sort((a, b) => (a[field] ?? -1e9) - (b[field] ?? -1e9));
  const h = Math.floor(v.length / 2);
  return `bottom ${rate(v.slice(0, h))}  vs  top ${rate(v.slice(h))}`;
};
console.log("\nDoes the ranking separate winners? (top vs bottom half):");
console.log(`  edgePct:  ${split("edge")}`);
console.log(`  legScore: ${split("legScore")}`);
console.log(`  implied:  ${split("imp")}   <- market`);

// ── Strategy comparison ──
console.log("\nSTRATEGY (leg hit rate by day): all  |  implied>=58% (lean market)  |  drop edge>=20pp");
for (const date of DATES) {
  const day = legs.filter((x) => x.date === date);
  console.log(`  ${date}  ${rate(day).padEnd(11)}  ${rate(day.filter((x) => x.imp != null && x.imp >= 0.58)).padEnd(11)}  ${rate(day.filter((x) => (x.edge ?? 0) < 20))}`);
}

// ── Slip-level ──
const slipBy = (label, keyFn, keys) => {
  console.log(`\nSLIP hit rate by ${label}:`);
  for (const k of keys) {
    const rows = slips.filter((s) => keyFn(s) === k).map((s) => ({ win: s.win }));
    if (rows.length) console.log(`  ${String(k).padEnd(22)} ${rate(rows)}`);
  }
};
slipBy("risk section", (s) => s.section, ["low", "medium", "high", "longshot"]);
slipBy("size", (s) => (s.size < 5 ? `${s.size}-leg` : "5+"), ["2-leg", "3-leg", "4-leg", "5+"]);
slipBy("same-market stack", (s) => (s.maxSameMarket >= 2 ? "2x+ same market" : "distinct markets"), ["2x+ same market", "distinct markets"]);
slipBy("avg confidence", (s) => (s.avgConf >= 2.5 ? "avgConf>=2.5 (High-ish)" : "avgConf<2.5"), ["avgConf>=2.5 (High-ish)", "avgConf<2.5"]);

console.log("\nNo live wiring. No same-slate leakage. Small per-day samples — read aggregates, not single cells.");
