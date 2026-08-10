/**
 * EPL deterministic scoreline simulation — validation artifact (Program 148 · Release C).
 * PRIVATE RESEARCH: shadow output, no public surface, no picks, no money linkage.
 *
 * For every fixture of the LAST completed matchday (2025-26 · Matchday 38), the independent-Poisson
 * baseline produces the full exact-score probability matrix (0..10 × 0..10) fit ONLY on matches
 * dated strictly before that matchday — the same walk-forward state the evaluation used, exercised
 * one more step. The artifact records, per fixture:
 *   lambdas, top-5 scorelines with probabilities, three-way probs, over/under 2.5 —
 *   and, because these matches are settled history, the ACTUAL result beside the prediction, with
 *   the probability the model gave it. A validation artifact that hides its misses is marketing;
 *   this one shows every miss by construction.
 *
 * Determinism: no clocks, no randomness — the "simulation" is the closed-form Poisson matrix, so a
 * re-run reproduces the artifact byte-for-byte given the same corpus and --now.
 *
 * Run: node scripts/epl/simulate-epl-scorelines.mjs --now 2026-08-09T21:45:00Z
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
const rows = corpus.rows;

const target = rows.filter((m) => m.season === "2025-26" && m.matchday === 38);
if (target.length !== 10) { console.error(`REFUSED: expected exactly 10 MD38 fixtures, found ${target.length}`); process.exit(1); }
const cutoff = target.map((m) => m.dateUtc).sort()[0].slice(0, 10);
const training = rows.filter((m) => m.dateUtc.slice(0, 10) < cutoff);

// ── the same Poisson fit the evaluator uses (tallies over training matches only) ────────────────
const stats = new Map();
const st = (c) => { if (!stats.has(c)) stats.set(c, { hf: 0, ha: 0, hg: 0, af: 0, aa: 0, ag: 0 }); return stats.get(c); };
for (const m of training) {
  const h = st(m.home), a = st(m.away);
  h.hf += m.ftHome; h.ha += m.ftAway; h.hg += 1;
  a.af += m.ftAway; a.aa += m.ftHome; a.ag += 1;
}
const agg = [...stats.values()].reduce((x, s) => ({ hf: x.hf + s.hf, hg: x.hg + s.hg, af: x.af + s.af, ag: x.ag + s.ag }), { hf: 0, hg: 0, af: 0, ag: 0 });
const muH = agg.hf / agg.hg, muA = agg.af / agg.ag;
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const pm = (lam, k) => Math.exp(-lam) * Math.pow(lam, k) / FACT[k];
const round = (x, d = 4) => Number(x.toFixed(d));

const fixtures = target.map((m) => {
  const h = st(m.home), a = st(m.away);
  const attH = h.hg ? (h.hf / h.hg) / muH : 1, defH = h.hg ? (h.ha / h.hg) / muA : 1;
  const attA = a.ag ? (a.af / a.ag) / muA : 1, defA = a.ag ? (a.aa / a.ag) / muH : 1;
  const lamH = Math.max(0.05, muH * attH * defA);
  const lamA = Math.max(0.05, muA * attA * defH);
  let pH = 0, pD = 0, pA = 0, over25 = 0;
  const cells = [];
  for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) {
    const p = pm(lamH, x) * pm(lamA, y);
    cells.push({ score: `${x}-${y}`, p });
    if (x > y) pH += p; else if (x === y) pD += p; else pA += p;
    if (x + y >= 3) over25 += p;
  }
  const z = pH + pD + pA;
  cells.sort((u, v) => v.p - u.p || u.score.localeCompare(v.score));
  const actualScore = `${m.ftHome}-${m.ftAway}`;
  return {
    fixture: `${m.home} v ${m.away}`,
    dateUtc: m.dateUtc,
    fitCutoffDate: cutoff,
    trainingMatches: training.length,
    lambdas: { home: round(lamH), away: round(lamA) },
    threeWay: { H: round(pH / z), D: round(pD / z), A: round(pA / z) },
    over25: round(over25 / z),
    topScorelines: cells.slice(0, 5).map((c) => ({ score: c.score, p: round(c.p / z) })),
    actual: {
      score: actualScore,
      result: m.result,
      modelProbOfActualResult: round({ H: pH / z, D: pD / z, A: pA / z }[m.result]),
      modelProbOfActualScore: round((cells.find((c) => c.score === actualScore)?.p ?? 0) / z),
    },
  };
});

const artifact = {
  schemaVersion: 1,
  artifact: "epl-scoreline-simulation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  method: "independent Poisson, closed-form score matrix 0..10, fit on matches strictly before the matchday (walk-forward state; no randomness, no clocks)",
  slate: "2025-26 · Matchday 38 (last completed matchday in the corpus — settled history used as validation, never presented as a forward pick)",
  fixtures,
};

fs.mkdirSync(path.join(ROOT, "simulations"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "simulations", "scoreline-sim-2025-26-md38.json"), JSON.stringify(artifact, null, 1));
const hits = fixtures.filter((f) => ["H", "D", "A"].sort((a, b) => f.threeWay[b] - f.threeWay[a])[0] === f.actual.result).length;
console.log(`scoreline-sim written: 10 fixtures, top-class hits ${hits}/10`);
for (const f of fixtures.slice(0, 3)) console.log(` ${f.fixture}: 1X2 ${JSON.stringify(f.threeWay)} actual ${f.actual.score} (p_result ${f.actual.modelProbOfActualResult})`);
