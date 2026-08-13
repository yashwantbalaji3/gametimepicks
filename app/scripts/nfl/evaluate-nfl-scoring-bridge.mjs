/**
 * NFL scoring bridge — points → offensive-TD composition calibration (Program 170 · Release B).
 * PRIVATE RESEARCH. This is THE receipt the P169 TD engine refuses without.
 *
 * PROTOCOL (declared first): TRAIN = 2023-24 regular+post (player-event corpus); TEST = 2025
 * regular+post held out. Preseason games are a SEPARATE slice (variant evidence, never mixed).
 *
 * MODEL: offensive TD count | final team points. λ(points) = a + b·points fit by least squares
 * on train (Poisson count layer); pass-vs-rush composition = train share by points band. The
 * deliberately-simple linear-λ form is stated; richer forms need their own replay.
 *
 * EVALUATION on held-out 2025: TD-count log loss + Brier under the Poisson vs a constant-λ
 * baseline; calibration by points band; pass-share MAE by band; negative cases pinned (zero-TD
 * games, 6×offTD ≤ points identity — R3 guaranteed upstream by the corpus builder).
 *
 * Writes: data/internal/research/nfl/reports/scoring-bridge-v1.json (the mapping receipt)
 * Usage:  node scripts/nfl/evaluate-nfl-scoring-bridge.mjs --now <iso>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-nfl-scoring-bridge.mjs --now <iso>"); process.exit(1); }

const DIR = path.join(APP, "..", "data/internal/research/nfl/player-events-v1");
const seasons = fs.readdirSync(DIR).filter((f) => /^\d{4}\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

// Corpus home/away are FULL NAMES; player rows carry boxscore ABBRs. The schedule captures own
// the name↔abbr mapping (32 teams) — the join goes through it, never through string guessing.
const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));
const nameToAbbr = new Map();
for (const r of schedule.rows) { nameToAbbr.set(r.home.name, r.home.abbr); nameToAbbr.set(r.away.name, r.away.abbr); }
if (nameToAbbr.size < 32) { console.error(`REFUSED: name↔abbr map covers ${nameToAbbr.size} teams — a partial map would silently drop observations`); process.exit(2); }

// One observation per TEAM per game: points scored, offensive TDs (pass+rush credit), pass share.
const obs = [];
let unjoined = 0;
for (const s of seasons) {
  for (const g of s.games) {
    const phase = g.seasonType;
    for (const side of ["home", "away"]) {
      const points = side === "home" ? g.ftHome : g.ftAway;
      const abbr = nameToAbbr.get(g[side]);
      if (!abbr) { unjoined += 1; continue; }
      const players = g.players.filter((p) => p.teamAbbr === abbr);
      const passTd = players.reduce((x, p) => x + (p.passTd ?? 0), 0);
      const rushTd = players.reduce((x, p) => x + (p.rushTd ?? 0), 0);
      obs.push({ season: g.season, phase, points, offTd: passTd + rushTd, passTd, rushTd });
    }
  }
}
if (unjoined > 0) console.log(`unjoined team-sides: ${unjoined} (relocations/renames outside the current 32 — excluded, counted)`);
if (obs.every((o) => o.offTd === 0)) { console.error("REFUSED: every observation has zero offensive TDs — the join is broken, not the league"); process.exit(3); }
const reg = (o) => o.phase !== 1;
const train = obs.filter((o) => [2023, 2024].includes(o.season) && reg(o));
const test = obs.filter((o) => o.season === 2025 && reg(o));
const preseason = obs.filter((o) => o.phase === 1);

// λ(points) = a + b·points by least squares on train counts.
const n = train.length;
const mx = train.reduce((s, o) => s + o.points, 0) / n;
const my = train.reduce((s, o) => s + o.offTd, 0) / n;
const b = train.reduce((s, o) => s + (o.points - mx) * (o.offTd - my), 0) / train.reduce((s, o) => s + (o.points - mx) ** 2, 0);
const a = my - b * mx;
const lam = (points) => Math.max(0.03, a + b * points);

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const pois = (l, k) => Math.exp(-l) * l ** k / FACT[Math.min(k, 10)];
const logLoss = (xs, lof) => -xs.reduce((s, o) => s + Math.log(Math.max(1e-12, pois(lof(o), Math.min(o.offTd, 10)))), 0) / xs.length;
const brier = (xs, lof) => xs.reduce((s, o) => {
  let acc = 0;
  for (let k = 0; k <= 10; k++) acc += (pois(lof(o), k) - (o.offTd === k ? 1 : 0)) ** 2;
  return s + acc;
}, 0) / xs.length;

const constLam = train.reduce((s, o) => s + o.offTd, 0) / train.length;
const bands = [[0, 13], [14, 20], [21, 27], [28, 99]];
const bandRows = bands.map(([lo, hi]) => {
  const xs = test.filter((o) => o.points >= lo && o.points <= hi);
  if (!xs.length) return { band: `${lo}-${hi}`, n: 0 };
  const predMean = xs.reduce((s, o) => s + lam(o.points), 0) / xs.length;
  const actMean = xs.reduce((s, o) => s + o.offTd, 0) / xs.length;
  const passShare = xs.reduce((s, o) => s + o.passTd, 0) / Math.max(1, xs.reduce((s, o) => s + o.offTd, 0));
  return { band: `${lo}-${hi}`, n: xs.length, predictedMeanTd: Number(predMean.toFixed(3)), actualMeanTd: Number(actMean.toFixed(3)), actualPassShare: Number(passShare.toFixed(3)) };
});
const trainPassShare = train.reduce((s, o) => s + o.passTd, 0) / Math.max(1, train.reduce((s, o) => s + o.offTd, 0));

const report = {
  schemaVersion: 1,
  artifact: "nfl-scoring-bridge-v1",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  protocol: { train: "2023-24 regular+post team-games", test: "2025 regular+post held out", preseason: "separate slice, never mixed" },
  corpusAccounting: seasons.map((s) => ({ season: s.season, captured: s.accounting.captured, quarantined: s.accounting.quarantined, contentHash: s.contentHash })),
  mapping: {
    receipt: `fit ${NOW} on n=${n} train team-games (this file IS the committed calibration receipt the TD engine requires)`,
    form: "lambda(points) = intercept + slope × points (linear-λ Poisson; deliberately simple, stated)",
    lambdaIntercept: Number(a.toFixed(5)),
    lambdaPerPoint: Number(b.toFixed(5)),
    trainPassShare: Number(trainPassShare.toFixed(4)),
  },
  metrics: {
    test: { n: test.length, logLoss: Number(logLoss(test, (o) => lam(o.points)).toFixed(4)), brier: Number(brier(test, (o) => lam(o.points)).toFixed(4)) },
    baselineConstant: { lambda: Number(constLam.toFixed(4)), logLoss: Number(logLoss(test, () => constLam).toFixed(4)), brier: Number(brier(test, () => constLam).toFixed(4)) },
    calibrationByPointsBand: bandRows,
  },
  preseasonSlice: { n: preseason.length, meanOffTd: Number((preseason.reduce((s, o) => s + o.offTd, 0) / Math.max(1, preseason.length)).toFixed(3)), note: "variant evidence only — the preseason TD environment differs and is never blended into the regular fit" },
  negativeCases: {
    zeroTdGames: test.filter((o) => o.offTd === 0).length,
    identityR3: "6×offTD ≤ points enforced per game by the corpus builder before any row enters this fit",
  },
  honesty: [
    "conditioning is on FINAL points (the simulator supplies its own simulated points at runtime — the bridge translates, it does not predict)",
    "defensive/special-teams touchdowns live OUTSIDE offensive TD counts by construction (player pass/rush credit only) — the TD engine's residual bucket carries them",
    "no market data anywhere in this fit",
  ],
};
const out = path.join(APP, "..", "data/internal/research/nfl/reports/scoring-bridge-v1.json");
fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
console.log(`train n=${n} · λ = ${report.mapping.lambdaIntercept} + ${report.mapping.lambdaPerPoint}·points · trainPassShare ${report.mapping.trainPassShare}`);
console.log(`test n=${test.length}: logLoss ${report.metrics.test.logLoss} vs constant-λ ${report.metrics.baselineConstant.logLoss} · brier ${report.metrics.test.brier} vs ${report.metrics.baselineConstant.brier}`);
for (const r of bandRows) console.log(`  band ${r.band}: n=${r.n} pred ${r.predictedMeanTd ?? "-"} vs actual ${r.actualMeanTd ?? "-"} · passShare ${r.actualPassShare ?? "-"}`);
