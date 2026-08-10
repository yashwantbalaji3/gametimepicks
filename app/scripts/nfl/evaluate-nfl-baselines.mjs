/**
 * NFL baseline evaluation — chronological, leakage-free, deterministic (Program 151 · Release A).
 * PRIVATE RESEARCH ARTIFACT — nothing here is a pick or a public surface.
 *
 * Baselines (few parameters, every one documented):
 *   elo        home-adjusted Elo, K=20, home advantage +48 rating points (≈2.5 net points),
 *              HA suppressed at neutral sites; ties update as half-wins; season boundary
 *              regresses every rating 1/3 toward the 1505 mean (the standard carryover discipline)
 *   homerate   running P(home win) among prior decisive games — the strength-blind reference
 *   coin       always 0.5 — the arithmetic sanity anchor (log loss must equal ln 2)
 *   margin     rolling team net-points (expanding mean, home advantage from prior home-margin
 *              mean) → predicted margin; total from rolling combined-points means
 *
 * THE TIE POLICY, explicit: ties are REAL outcomes and are never flattened. Winner metrics are
 * computed over DECISIVE games only; every evaluated slate reports how many ties were excluded,
 * so the denominator is visible. Margin/total metrics include ties (a 20-20 margin of 0 is data).
 *
 * THE LEAKAGE RULE: predictions for a date use state built strictly from earlier dates; the
 * warm-up season (2023) is fit-only. Preseason games UPDATE nothing and are NEVER evaluated —
 * exhibition dynamics would poison both sides (policy: phase 1 skipped entirely).
 *
 * Run: node scripts/nfl/evaluate-nfl-baselines.mjs --now 2026-08-10T03:05:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nfl");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) {
  console.error("REFUSED: --now <ISO> required"); process.exit(1);
}
const NOW = process.argv[argNow + 1];

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const games = corpus.rows.filter((r) => r.phase !== 1); // preseason: never fit, never evaluated
const WARMUP = 2023;

// ── state ───────────────────────────────────────────────────────────────────────────────────────
const elo = new Map(); const getElo = (t) => elo.get(t) ?? 1505;
const K = 20, HA = 48, MEAN = 1505;
let curSeason = null;
const dec = { H: 0, A: 0 };
const net = new Map(); const teamNet = (t) => net.get(t) ?? { pf: 0, pa: 0, g: 0, homeMarginSum: 0, homeG: 0 };

function seasonBoundary(season) {
  if (curSeason != null && season !== curSeason) {
    for (const [t, r] of elo) elo.set(t, r + (MEAN - r) / 3);
  }
  curSeason = season;
}

function predict(g) {
  const ha = g.neutralSite ? 0 : HA;
  const exp = 1 / (1 + Math.pow(10, (getElo(g.away) - (getElo(g.home) + ha)) / 400));
  const n = dec.H + dec.A;
  const homerate = (dec.H + 1) / (n + 2);
  const h = teamNet(g.home), a = teamNet(g.away);
  const hNet = h.g ? (h.pf - h.pa) / h.g : 0, aNet = a.g ? (a.pf - a.pa) / a.g : 0;
  const homeAdvPts = h.homeG ? h.homeMarginSum / h.homeG : 2;
  const margin = hNet - aNet + (g.neutralSite ? 0 : Math.max(0, Math.min(4, homeAdvPts)));
  const hPts = h.g ? (h.pf + h.pa) / h.g : 43, aPts = a.g ? (a.pf + a.pa) / a.g : 43;
  const total = (hPts + aPts) / 2;
  return { elo: exp, homerate, coin: 0.5, margin, total };
}

function update(g) {
  const ha = g.neutralSite ? 0 : HA;
  const exp = 1 / (1 + Math.pow(10, (getElo(g.away) - (getElo(g.home) + ha)) / 400));
  const score = g.result === "H" ? 1 : g.result === "T" ? 0.5 : 0;
  elo.set(g.home, getElo(g.home) + K * (score - exp));
  elo.set(g.away, getElo(g.away) + K * ((1 - score) - (1 - exp)));
  if (g.result !== "T") dec[g.result] += 1;
  const h = teamNet(g.home), a = teamNet(g.away);
  h.pf += g.ftHome; h.pa += g.ftAway; h.g += 1; h.homeMarginSum += g.neutralSite ? 0 : g.ftHome - g.ftAway; h.homeG += g.neutralSite ? 0 : 1;
  a.pf += g.ftAway; a.pa += g.ftHome; a.g += 1;
  net.set(g.home, h); net.set(g.away, a);
}

// ── walk forward, one dated slate at a time ─────────────────────────────────────────────────────
const MODELS = ["elo", "homerate", "coin"];
const winner = Object.fromEntries(MODELS.map((m) => [m, []]));
const scoreErr = [];
let tiesExcluded = 0, i = 0;

while (i < games.length) {
  const day = games[i].dateUtc.slice(0, 10);
  const slate = [];
  while (i < games.length && games[i].dateUtc.slice(0, 10) === day) slate.push(games[i++]);
  for (const g of slate) {
    seasonBoundary(g.season);
    if (g.season !== WARMUP) {
      const p = predict(g);
      if (g.result === "T") tiesExcluded += 1;
      else for (const m of MODELS) {
        const q = p[m];
        const y = g.result === "H" ? 1 : 0;
        winner[m].push({
          season: g.season, phase: g.phase, p: q, y,
          ll: -(y ? Math.log(Math.max(1e-12, q)) : Math.log(Math.max(1e-12, 1 - q))),
          brier: (q - y) ** 2,
          hit: (q >= 0.5 ? 1 : 0) === y ? 1 : 0,
        });
      }
      scoreErr.push({ season: g.season, marginErr: p.margin - (g.ftHome - g.ftAway), totalErr: p.total - (g.ftHome + g.ftAway) });
    }
  }
  for (const g of slate) update(g);
}

const round = (x, d = 4) => Number(x.toFixed(d));
const agg = (list) => ({
  n: list.length,
  logLoss: round(list.reduce((s, r) => s + r.ll, 0) / list.length),
  brier: round(list.reduce((s, r) => s + r.brier, 0) / list.length),
  accuracy: round(list.reduce((s, r) => s + r.hit, 0) / list.length),
});
const calib = (list) => Array.from({ length: 10 }, (_, ix) => {
  const bin = list.filter((r) => Math.floor(r.p * 10) === ix || (ix === 9 && r.p === 1));
  return { bin: `${ix * 10}-${ix * 10 + 10}%`, n: bin.length, predicted: bin.length ? round(bin.reduce((s, r) => s + r.p, 0) / bin.length) : null, observed: bin.length ? round(bin.reduce((s, r) => s + r.y, 0) / bin.length) : null };
});
const mae = (k) => round(scoreErr.reduce((s, r) => s + Math.abs(r[k]), 0) / scoreErr.length, 2);
const rmse = (k) => round(Math.sqrt(scoreErr.reduce((s, r) => s + r[k] ** 2, 0) / scoreErr.length), 2);
const seasons = [2024, 2025];

const report = {
  schemaVersion: 1,
  artifact: "nfl-baseline-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  corpus: { file: "corpus-v1.json", gamesConsidered: games.length, warmupSeason: WARMUP, evaluatedDecisive: winner.elo.length, tiesExcludedFromWinnerMetrics: tiesExcluded, preseasonPolicy: "phase 1 never fit, never evaluated" },
  leakageRule: "state from strictly earlier dates; warm-up season fit-only; season boundary regresses Elo 1/3 to mean",
  tiePolicy: "ties excluded from winner metrics (counted above), included in margin/total errors, half-credit in Elo updates",
  winner: Object.fromEntries(MODELS.map((m) => [m, {
    overall: agg(winner[m]),
    bySeason: Object.fromEntries(seasons.map((s) => [s, agg(winner[m].filter((r) => r.season === s))])),
    byPhase: { regular: agg(winner[m].filter((r) => r.phase === 2)), postseason: agg(winner[m].filter((r) => r.phase === 3)) },
    calibration: calib(winner[m]),
  }])),
  score: { n: scoreErr.length, marginMAE: mae("marginErr"), marginRMSE: rmse("marginErr"), totalMAE: mae("totalErr"), totalRMSE: rmse("totalErr") },
  marketComparison: "unavailable — no authorized historical NFL odds capture exists; never reconstructed from memory",
};
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.json"), JSON.stringify(report, null, 1));
console.log("evaluated decisive:", winner.elo.length, "| ties excluded:", tiesExcluded);
for (const m of MODELS) console.log(` ${m}:`, JSON.stringify(report.winner[m].overall));
console.log(" score:", JSON.stringify(report.score));
