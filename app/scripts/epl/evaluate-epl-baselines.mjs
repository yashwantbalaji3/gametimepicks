/**
 * EPL baseline evaluation — chronological, leakage-free, deterministic (Program 148 · Release C).
 * PRIVATE RESEARCH ARTIFACT: nothing here is a pick or a public surface.
 *
 * Three baselines, exactly as the release specifies, each predicting P(HOME/DRAW/AWAY):
 *   empirical  running league H/D/A frequencies (Laplace +1) over prior matches
 *   elo        classic Elo (K=20, home advantage +60, draw=half win) with the running empirical
 *              draw rate as P(D) and the Elo expectation splitting the rest — "Elo-with-empirical-draw"
 *   poisson    per-club attack/defence multipliers with home adjustment, fit on prior matches by
 *              damped iteration; three-way probs from the independent-Poisson score matrix (0..10)
 *
 * THE LEAKAGE RULE, mechanical: a prediction for a match dated D uses parameters fit on matches
 * with date strictly earlier than D. Matches share a date only within one matchday slate; no model
 * updates intra-day. The first season (2022-23) is warm-up — fit only, never scored.
 *
 * Cold starts are the honest kind: an unseen (promoted) club enters at Elo 1500 and Poisson
 * multipliers 1.0 — league average, never a guess dressed as knowledge.
 *
 * Metrics: multiclass log loss (natural log), multiclass Brier, top-class accuracy, and a 10-bin
 * calibration table over every emitted outcome probability. References: uniform (1/3 each) and
 * home-rate (the empirical model itself is the "market-free" reference).
 *
 * Run: node scripts/epl/evaluate-epl-baselines.mjs --now 2026-08-09T21:40:00Z
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..", "data", "internal", "research", "epl");

const argNow = process.argv.indexOf("--now");
if (argNow === -1 || !Number.isFinite(Date.parse(process.argv[argNow + 1] ?? ""))) {
  console.error("REFUSED: --now <ISO> required"); process.exit(1);
}
const NOW = process.argv[argNow + 1];

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "corpus-v1.json"), "utf8"));
const matches = corpus.rows; // already chronologically sorted (dateUtc, home)
const WARMUP_SEASON = "2022-23";

// ── model state ─────────────────────────────────────────────────────────────────────────────────
const outcomes = { H: 0, D: 0, A: 0 };                       // running league tallies
const elo = new Map();                                        // club → rating
const getElo = (c) => elo.get(c) ?? 1500;
const K = 20, HOME_ADV = 60;

// Poisson state: goals for/against tallies per club (home/away split), league means.
const stats = new Map();                                      // club → {hf,ha,hg, af,aa,ag} (for, against, games)
const st = (c) => { if (!stats.has(c)) stats.set(c, { hf: 0, ha: 0, hg: 0, af: 0, aa: 0, ag: 0 }); return stats.get(c); };

function poissonProbs(home, away) {
  // League means from all prior matches (home-goals mean, away-goals mean).
  const agg = [...stats.values()].reduce((a, s) => ({ hf: a.hf + s.hf, hg: a.hg + s.hg, af: a.af + s.af, ag: a.ag + s.ag }), { hf: 0, hg: 0, af: 0, ag: 0 });
  const muH = agg.hg ? agg.hf / agg.hg : 1.5;                 // mean home goals
  const muA = agg.ag ? agg.af / agg.ag : 1.2;                 // mean away goals
  const h = st(home), a = st(away);
  // Attack/defence multipliers relative to league means; unseen clubs = 1.0 (league average).
  const attH = h.hg ? (h.hf / h.hg) / muH : 1, defH = h.hg ? (h.ha / h.hg) / muA : 1;
  const attA = a.ag ? (a.af / a.ag) / muA : 1, defA = a.ag ? (a.aa / a.ag) / muH : 1;
  const lamH = Math.max(0.05, muH * attH * defA);
  const lamA = Math.max(0.05, muA * attA * defH);
  // Independent Poisson score matrix 0..10.
  const pm = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800][k];
  let pH = 0, pD = 0, pA = 0;
  const grid = [];
  for (let x = 0; x <= 10; x++) { grid.push([]); for (let y = 0; y <= 10; y++) {
    const p = pm(lamH, x) * pm(lamA, y);
    grid[x].push(p);
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
  } }
  const z = pH + pD + pA;                                     // tail mass renormalized
  return { probs: { H: pH / z, D: pD / z, A: pA / z }, lamH, lamA, grid, z };
}

function predict(home, away) {
  const n = outcomes.H + outcomes.D + outcomes.A;
  const empirical = {
    H: (outcomes.H + 1) / (n + 3), D: (outcomes.D + 1) / (n + 3), A: (outcomes.A + 1) / (n + 3),
  };
  const exp = 1 / (1 + Math.pow(10, (getElo(away) - (getElo(home) + HOME_ADV)) / 400));
  const pDraw = empirical.D;
  const eloProbs = { H: (1 - pDraw) * exp, D: pDraw, A: (1 - pDraw) * (1 - exp) };
  return { empirical, elo: eloProbs, poisson: poissonProbs(home, away).probs };
}

function update(m) {
  outcomes[m.result] += 1;
  const expH = 1 / (1 + Math.pow(10, (getElo(m.away) - (getElo(m.home) + HOME_ADV)) / 400));
  const score = m.result === "H" ? 1 : m.result === "D" ? 0.5 : 0;
  const eH = getElo(m.home), eA = getElo(m.away);
  elo.set(m.home, eH + K * (score - expH));
  elo.set(m.away, eA + K * ((1 - score) - (1 - expH)));
  const h = st(m.home), a = st(m.away);
  h.hf += m.ftHome; h.ha += m.ftAway; h.hg += 1;
  a.af += m.ftAway; a.aa += m.ftHome; a.ag += 1;
}

// ── walk forward ────────────────────────────────────────────────────────────────────────────────
const MODELS = ["empirical", "elo", "poisson", "uniform"];
const per = Object.fromEntries(MODELS.map((k) => [k, []]));   // {season, ll, brier, hit, probs, result}

let i = 0;
while (i < matches.length) {
  // One dated slate at a time: predict ALL of today's matches from yesterday's state, then update.
  const day = matches[i].dateUtc.slice(0, 10);
  const slate = [];
  while (i < matches.length && matches[i].dateUtc.slice(0, 10) === day) slate.push(matches[i++]);
  for (const m of slate) {
    if (m.season !== WARMUP_SEASON) {
      const p = { ...predict(m.home, m.away), uniform: { H: 1 / 3, D: 1 / 3, A: 1 / 3 } };
      for (const k of MODELS) {
        const q = p[k];
        const ll = -Math.log(Math.max(1e-12, q[m.result]));
        const brier = ["H", "D", "A"].reduce((s, o) => s + Math.pow(q[o] - (m.result === o ? 1 : 0), 2), 0);
        const top = ["H", "D", "A"].sort((x, y) => q[y] - q[x])[0];
        per[k].push({ season: m.season, ll, brier, hit: top === m.result ? 1 : 0, probs: q, result: m.result });
      }
    }
  }
  for (const m of slate) update(m);
}

// ── aggregate ───────────────────────────────────────────────────────────────────────────────────
const seasons = [...new Set(matches.filter((m) => m.season !== WARMUP_SEASON).map((m) => m.season))].sort();
const round = (x, d = 4) => Number(x.toFixed(d));
const agg = (list) => ({
  n: list.length,
  logLoss: round(list.reduce((s, r) => s + r.ll, 0) / list.length),
  brier: round(list.reduce((s, r) => s + r.brier, 0) / list.length),
  accuracy: round(list.reduce((s, r) => s + r.hit, 0) / list.length),
});

function calibration(list) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, pSum: 0, hits: 0 }));
  for (const r of list) for (const o of ["H", "D", "A"]) {
    const p = r.probs[o];
    const b = bins[Math.min(9, Math.floor(p * 10))];
    b.n += 1; b.pSum += p; b.hits += r.result === o ? 1 : 0;
  }
  return bins.map((b, ix) => ({
    bin: `${ix * 10}-${ix * 10 + 10}%`, n: b.n,
    predicted: b.n ? round(b.pSum / b.n) : null,
    observed: b.n ? round(b.hits / b.n) : null,
  }));
}

const report = {
  schemaVersion: 1,
  artifact: "epl-baseline-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  corpus: { file: "corpus-v1.json", totalMatches: matches.length, warmupSeason: WARMUP_SEASON, evaluated: per.empirical.length },
  leakageRule: "parameters fit on strictly earlier-dated matches only; intra-day slates share one pregame state; warm-up season never scored",
  coldStartRule: "unseen clubs enter at Elo 1500 and Poisson multipliers 1.0 (league average)",
  models: Object.fromEntries(MODELS.map((k) => [k, {
    overall: agg(per[k]),
    bySeason: Object.fromEntries(seasons.map((s) => [s, agg(per[k].filter((r) => r.season === s))])),
    calibration: calibration(per[k]),
  }])),
};

fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.json"), JSON.stringify(report, null, 1));

const lines = [
  `# EPL baseline evaluation v1 — PRIVATE RESEARCH (generated ${NOW})`,
  "",
  `Corpus: ${matches.length} matches, warm-up ${WARMUP_SEASON}, evaluated ${per.empirical.length} predictions across ${seasons.join(", ")}.`,
  "Leakage rule: fit strictly on earlier-dated matches; intra-day slates share one pregame state.",
  "",
  "| model | n | log loss | Brier | accuracy |",
  "|---|---|---|---|---|",
  ...MODELS.map((k) => {
    const o = report.models[k].overall;
    return `| ${k} | ${o.n} | ${o.logLoss} | ${o.brier} | ${o.accuracy} |`;
  }),
  "",
  "Per-season log loss:",
  "",
  `| model | ${seasons.join(" | ")} |`,
  `|---|${seasons.map(() => "---").join("|")}|`,
  ...MODELS.map((k) => `| ${k} | ${seasons.map((s) => report.models[k].bySeason[s].logLoss).join(" | ")} |`),
  "",
  "No market/no-vig comparison ships in v1: no authorized EPL odds capture exists for these seasons",
  "(api-football free tier serves 2022-2024 fixtures but its odds endpoints were not exercised, and",
  "the Odds API key is CI-only). The comparison lands when a real odds capture exists — never from",
  "remembered or reconstructed prices.",
];
fs.writeFileSync(path.join(ROOT, "reports", "baseline-evaluation-v1.md"), lines.join("\n") + "\n");
console.log("reports written:");
for (const k of MODELS) console.log(` ${k}:`, JSON.stringify(report.models[k].overall));
