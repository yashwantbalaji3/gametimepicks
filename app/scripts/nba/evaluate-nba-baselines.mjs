/**
 * NBA baseline evaluation — chronological, leakage-free, deterministic (Program 152 · Release A).
 * PRIVATE RESEARCH ARTIFACT.
 *
 * Baselines:
 *   elo       home-adjusted Elo, K=20, home advantage +70 rating points (≈2.5 net pts at NBA
 *             scoring), suppressed at neutral sites; 1/3 season regression to the 1505 mean;
 *             updates from regular + cup-final + play-in + playoffs (never preseason)
 *   homerate  running P(home win) among prior evaluated games — strength-blind reference
 *   coin      always 0.5 — arithmetic anchor (log loss must equal ln 2)
 *   pace      margin/total from expanding team net-points and combined-points means with a
 *             bounded home bump — pregame information only
 *
 * MEMBERSHIP, mechanical: preseason is NEVER fit and NEVER evaluated; the cup final and play-in
 * update ratings and are evaluated inside their own phase buckets; basketball has no ties (the
 * corpus refuses them upstream). Warm-up season 2024 (=2023-24) is fit-only.
 *
 * Run: node scripts/nba/evaluate-nba-baselines.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "nba");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const NOW = process.argv[argNow + 1];

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const games = corpus.rows.filter((r) => r.phase !== 1);
const WARMUP = 2024;

const elo = new Map(); const getElo = (t) => elo.get(t) ?? 1505;
const K = 20, HA = 70, MEAN = 1505;
let curSeason = null;
const dec = { H: 0, A: 0 };
const net = new Map(); const tn = (t) => net.get(t) ?? { pf: 0, pa: 0, g: 0 };

function boundary(season) {
  if (curSeason != null && season !== curSeason) for (const [t, r] of elo) elo.set(t, r + (MEAN - r) / 3);
  curSeason = season;
}
function predict(g) {
  const ha = g.neutralSite ? 0 : HA;
  const p = 1 / (1 + Math.pow(10, (getElo(g.away) - (getElo(g.home) + ha)) / 400));
  const n = dec.H + dec.A;
  const h = tn(g.home), a = tn(g.away);
  const margin = (h.g ? (h.pf - h.pa) / h.g : 0) - (a.g ? (a.pf - a.pa) / a.g : 0) + (g.neutralSite ? 0 : 2.5);
  const total = ((h.g ? (h.pf + h.pa) / h.g : 228) + (a.g ? (a.pf + a.pa) / a.g : 228)) / 2;
  return { elo: p, homerate: (dec.H + 1) / (n + 2), coin: 0.5, margin, total };
}
function update(g) {
  const ha = g.neutralSite ? 0 : HA;
  const exp = 1 / (1 + Math.pow(10, (getElo(g.away) - (getElo(g.home) + ha)) / 400));
  const s = g.result === "H" ? 1 : 0;
  elo.set(g.home, getElo(g.home) + K * (s - exp));
  elo.set(g.away, getElo(g.away) + K * ((1 - s) - (1 - exp)));
  dec[g.result] += 1;
  const h = tn(g.home), a = tn(g.away);
  h.pf += g.ftHome; h.pa += g.ftAway; h.g += 1;
  a.pf += g.ftAway; a.pa += g.ftHome; a.g += 1;
  net.set(g.home, h); net.set(g.away, a);
}

const MODELS = ["elo", "homerate", "coin"];
const winner = Object.fromEntries(MODELS.map((m) => [m, []]));
const scoreErr = [];
let i = 0;
while (i < games.length) {
  const day = games[i].dateUtc.slice(0, 10);
  const slate = [];
  while (i < games.length && games[i].dateUtc.slice(0, 10) === day) slate.push(games[i++]);
  for (const g of slate) {
    boundary(g.season);
    if (g.season !== WARMUP) {
      const p = predict(g);
      const y = g.result === "H" ? 1 : 0;
      for (const m of MODELS) {
        const q = p[m];
        winner[m].push({ season: g.season, phase: g.phase, p: q, y, ll: -(y ? Math.log(Math.max(1e-12, q)) : Math.log(Math.max(1e-12, 1 - q))), brier: (q - y) ** 2, hit: (q >= 0.5 ? 1 : 0) === y ? 1 : 0 });
      }
      scoreErr.push({ marginErr: p.margin - (g.ftHome - g.ftAway), totalErr: p.total - (g.ftHome + g.ftAway) });
    }
  }
  for (const g of slate) update(g);
}

const round = (x, d = 4) => Number(x.toFixed(d));
const agg = (l) => ({ n: l.length, logLoss: round(l.reduce((s, r) => s + r.ll, 0) / l.length), brier: round(l.reduce((s, r) => s + r.brier, 0) / l.length), accuracy: round(l.reduce((s, r) => s + r.hit, 0) / l.length) });
const calib = (l) => Array.from({ length: 10 }, (_, ix) => { const b = l.filter((r) => Math.floor(r.p * 10) === ix || (ix === 9 && r.p === 1)); return { bin: `${ix * 10}-${ix * 10 + 10}%`, n: b.length, predicted: b.length ? round(b.reduce((s, r) => s + r.p, 0) / b.length) : null, observed: b.length ? round(b.reduce((s, r) => s + r.y, 0) / b.length) : null }; });
const phaseAgg = (m) => Object.fromEntries([["regular", 2], ["play-in", 5], ["playoffs", 3], ["cup-final", "cup-final"]].map(([label, ph]) => {
  const l = winner[m].filter((r) => r.phase === ph);
  return [label, l.length ? agg(l) : { n: 0 }];
}));

const report = {
  schemaVersion: 1,
  artifact: "nba-baseline-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  corpus: { file: "corpus-v1.json", gamesConsidered: games.length, warmupSeason: WARMUP, evaluated: winner.elo.length, preseasonPolicy: "phase 1 never fit, never evaluated" },
  leakageRule: "state from strictly earlier dates; warm-up season fit-only; 1/3 season regression at boundaries",
  winner: Object.fromEntries(MODELS.map((m) => [m, {
    overall: agg(winner[m]),
    bySeason: Object.fromEntries([2025, 2026].map((s) => [s, agg(winner[m].filter((r) => r.season === s))])),
    byPhase: phaseAgg(m),
    calibration: calib(winner[m]),
  }])),
  score: {
    n: scoreErr.length,
    marginMAE: round(scoreErr.reduce((s, r) => s + Math.abs(r.marginErr), 0) / scoreErr.length, 2),
    marginRMSE: round(Math.sqrt(scoreErr.reduce((s, r) => s + r.marginErr ** 2, 0) / scoreErr.length), 2),
    totalMAE: round(scoreErr.reduce((s, r) => s + Math.abs(r.totalErr), 0) / scoreErr.length, 2),
    totalRMSE: round(Math.sqrt(scoreErr.reduce((s, r) => s + r.totalErr ** 2, 0) / scoreErr.length), 2),
  },
  marketComparison: "unavailable — no authorized historical NBA odds capture exists; never reconstructed from memory",
};
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.json"), JSON.stringify(report, null, 1));
console.log("evaluated:", winner.elo.length);
for (const m of MODELS) console.log(` ${m}:`, JSON.stringify(report.winner[m].overall));
console.log(" score:", JSON.stringify(report.score));
