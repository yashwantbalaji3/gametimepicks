/**
 * NBA WINNER HEAD — PAIRED DEVELOPMENT-SEASON EVALUATION (Elo vs v1 nba-sim-v1-coherent). RESEARCH ONLY.
 * dataClass PRIVATE_RESEARCH · productEligible: false · promotes nothing · validates nothing.
 *
 * Why. The official NBA winner is the Elo side (founder N2; nba-official-composition@1). On opening night 2026-10-20 the
 * coherent v1 engine's pHome sat 0.037–0.047 BELOW Elo in all three games, which keeps v1 unanchored (Theater gated)
 * and official team scores withheld. sim-v1-dev-evaluation.json reports only aggregates (v1 Brier 0.2122 / log loss
 * 0.6117 vs Elo 0.2147 / 0.6175 on 1,005 games) — no interval, so no claim either way. This harness stores the per-game
 * pairs and puts paired bootstrap intervals on the differences, plus the systematic v1 − Elo gap and who it favours.
 *
 * Sample, inputs, parameters: IDENTICAL to scripts/nba/evaluate-sim-v1.mjs (2024-25 regular season, ≥ 30 days in, box
 * score present; Elo through tip; box scores strictly before tip; historical roster proxy; v1 params fitted on
 * 2023-24 only and frozen). v0 is not run. Same seeds as that harness (simulateGameV1's per-game default).
 *
 * Run (from app/):  nice -n 19 node scripts/nba/research/winner-head-paired-eval.mjs [--games N] [--sims 4000] [--boot 2000] [--write]
 * Writes (only with --write): data/internal/research/nba/reports/winner-head-paired-2025.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTeamRatings, ratingFor, winProbability } from "../../../src/lib/sports/nba/team-rating.mjs";
import { simulateGameV1, NBA_SIM_V1_MODEL_VERSION, V1_PARAMS } from "../../../src/lib/sports/nba/game-sim-v1.mjs";
import { indexBoxscores, leagueMeans, buildSideProfile, historicalRosterProxy } from "../../../src/lib/sports/nba/sim-v1-profile.mjs";
import { pairedBootstrap, winnerScores } from "./paired-metrics.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const SEASON = 2025;
const MIN_DAYS = 30;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : Number(argv[i + 1]); };
const GAMES = opt("--games", 100000);
const SIMS = opt("--sims", 4000);
const BOOT = opt("--boot", 2000);
const WRITE = argv.includes("--write");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(path.join(NBA, "corpus-v1.json"));
const corpusRows = (corpus.rows ?? []).filter((r) => r.season <= SEASON);
const box = fs.readdirSync(path.join(NBA, "boxscores")).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(NBA, "boxscores", f))).filter((d) => d.season <= SEASON);
const boxById = new Map(box.map((d) => [String(d.providerEventId), d]));
const index = indexBoxscores(box);
const rows = corpusRows.filter((r) => r.season === SEASON && r.phase === 2).sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
const start = Date.parse(rows[0].dateUtc);
const eligible = rows.filter((r) => Date.parse(r.dateUtc) >= start + MIN_DAYS * 86400_000 && boxById.get(String(r.providerEventId))?.boxscoreAvailable);
const step = Math.max(1, Math.floor(eligible.length / GAMES));
const sample = eligible.filter((_, i) => i % step === 0).slice(0, GAMES);

const pairs = [];
const t0 = Date.now();
for (const g of sample) {
  const doc = boxById.get(String(g.providerEventId));
  const homeId = doc.teams.find((t) => t.homeAway === "home")?.providerTeamId, awayId = doc.teams.find((t) => t.homeAway === "away")?.providerTeamId;
  const now = g.dateUtc;
  const ratings = buildTeamRatings(corpusRows, { throughDateUtc: now, targetSeason: SEASON });
  const hr = ratingFor(ratings, g.home), ar = ratingFor(ratings, g.away);
  const eloP = winProbability(hr.rating, ar.rating, { neutralSite: g.neutralSite === true });
  const league = leagueMeans(index, { asOf: now });
  const prof = (tid) => buildSideProfile(index, { teamId: tid, rosterRows: historicalRosterProxy(index, tid, { asOf: now }).map((id) => ({ providerAthleteId: id, availability: "unknown" })), asOf: now, league });
  const v1 = simulateGameV1({ providerEventId: g.providerEventId, inputAsOf: now, neutralSite: g.neutralSite === true, home: { name: g.home, providerTeamId: homeId, rating: hr, profile: prof(homeId) }, away: { name: g.away, providerTeamId: awayId, rating: ar, profile: prof(awayId) }, league, eloWinProbability: eloP, simulations: SIMS });
  pairs.push({ providerEventId: String(g.providerEventId), dateUtc: g.dateUtc, y: g.ftHome > g.ftAway ? 1 : 0, elo: eloP, v1: v1.sim.pHome, margin: g.ftHome - g.ftAway, v1MarginMean: v1.sim.margin.mean });
  if (pairs.length % 100 === 0) console.log(`  ${pairs.length}/${sample.length} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const y = pairs.map((p) => p.y);
const elo = winnerScores(pairs.map((p) => p.elo), y);
const v1 = winnerScores(pairs.map((p) => p.v1), y);
const diff = pairedBootstrap(pairs, { iterations: BOOT, seed: "nba-winner-head-2025" });
const gap = pairs.map((p) => p.v1 - p.elo);
const homeWinRate = y.reduce((s, v) => s + v, 0) / y.length;
const meanOf = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const report = {
  schemaVersion: 1,
  artifact: "nba-winner-head-paired-eval",
  dataClass: "PRIVATE_RESEARCH",
  productEligible: false,
  generatedAt: new Date().toISOString(),
  devSeason: SEASON,
  sampleRule: "evaluate-sim-v1.mjs: 2024-25 regular season, ≥ 30 days in, box score present",
  models: { elo: "team-rating.mjs winProbability (HOME_ADVANTAGE 70)", v1: `${NBA_SIM_V1_MODEL_VERSION} (ELO_TO_MARGIN ${V1_PARAMS.ELO_TO_MARGIN}, ${SIMS} sims)` },
  n: pairs.length,
  realizedHomeWinRate: Number(homeWinRate.toFixed(4)),
  meanPHome: { elo: Number(meanOf(pairs.map((p) => p.elo)).toFixed(4)), v1: Number(meanOf(pairs.map((p) => p.v1)).toFixed(4)) },
  gapV1MinusElo: { mean: Number(meanOf(gap).toFixed(4)), shareNegative: Number((gap.filter((d) => d < 0).length / gap.length).toFixed(4)) },
  sideDisagreements: pairs.filter((p) => (p.elo > 0.5) !== (p.v1 > 0.5)).length,
  scores: { elo, v1 },
  pairedDifferenceV1MinusElo: diff,
  reading: "Negative logLoss / brier difference favours v1. A claim needs the whole 95% interval on one side of 0. Development-season numbers never validate or promote anything (preregistration §8).",
  caveats: [
    "historical development season 2024-25; NOT the assessment season, NOT forward shadow",
    "v1 takes Elo's win probability as an input (ELO_TO_MARGIN): the two heads are not independent",
    "no injury feed existed for 2024-25: availability unknown is simulated, as in look 2",
  ],
  pairs,
};
console.log(JSON.stringify({ n: report.n, realizedHomeWinRate: report.realizedHomeWinRate, meanPHome: report.meanPHome, gap: report.gapV1MinusElo, sideDisagreements: report.sideDisagreements, elo, v1: { brier: v1.brier, logLoss: v1.logLoss, ece: v1.ece }, diff }, null, 1));
if (WRITE) {
  const out = path.join(NBA, "reports", "winner-head-paired-2025.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
}
