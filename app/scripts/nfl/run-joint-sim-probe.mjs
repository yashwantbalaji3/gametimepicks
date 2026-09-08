#!/usr/bin/env node
/**
 * P249 milestone 4 — ONE REAL GAME through the joint simulation, privately. Assembles the
 * production inputs (current role shares + rates, scorerTd shares, per-player TD-type mix from
 * the corpus, integrated matchup totals, walk-forward Elo) and writes a PRIVATE artifact with
 * both teams' joint output. Nothing here publishes; the evaluation decides that.
 *
 * Usage: node scripts/nfl/run-joint-sim-probe.mjs --event <providerEventId> --now <iso>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateJointGame, NFL_JOINT_SIM_ID } from "../../src/lib/sports/nfl/joint-game-sim.mjs";
import { loadPlayerPropsFit } from "../../src/lib/sports/nfl/player-props-v1.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";
import { totalsStateAt } from "../../src/lib/sports/nfl/totals-rating.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
const EVENT = arg("--event");
if (!NOW || !EVENT) { console.error("REFUSED: --event and --now required"); process.exit(1); }

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const fitBase = loadPlayerPropsFit({ fs, path, cwd: APP });
const bridgeDoc = JSON.stringify(read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json")));
const bridge = {
  lambdaIntercept: Number(bridgeDoc.match(/"lambdaIntercept":\s*(-?[0-9.]+)/)[1]),
  lambdaPerPoint: Number(bridgeDoc.match(/"lambdaPerPoint":\s*([0-9.]+)/)[1]),
};
const shares = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const fc = forecasts.forecasts.find((f) => String(f.providerEventId) === String(EVENT));
if (!fc) { console.error(`REFUSED: no committed forecast for event ${EVENT}`); process.exit(1); }

// per-player TD-type mix from the corpus (walk-forward-safe here: all history predates the game)
const tdTypeMix = new Map();
for (const y of [2023, 2024, 2025]) {
  const c = read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${y}.json`));
  for (const g of c.games) for (const p of g.players ?? []) {
    const m = tdTypeMix.get(p.playerId) ?? { rush: 0, rec: 0 };
    m.rush += p.rushTd ?? 0; m.rec += p.recTd ?? 0;
    tdTypeMix.set(p.playerId, m);
  }
}

// integrated matchup totals (the adopted configuration) + Elo, cut before kickoff
const totalsReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-evaluation.json"));
const ts = totalsStateAt({ rows: finals, cutoffIso: fc.kickoffUtc, receipt: totalsReceipt });
const strength = strengthStateAt({ rows: finals.filter((r) => r.dateUtc < fc.kickoffUtc), cutoffIso: NOW, regressToSeason: 2026 });
const nameOf = new Map([[fc.home.abbr, fc.home.name], [fc.away.abbr, fc.away.name]]);
const wrapped = { ...strength, ratingFor: (t) => strength.ratingFor(nameOf.get(t) ?? t) };
const fit = ts.state === "READY"
  ? { ...fitBase, gamesim: { ...fitBase.gamesim, muTotal: ts.muFor(fc.home.name, fc.away.name), sigmaTotal: ts.sigma } }
  : fitBase;

function composePlayers(teamAbbr) {
  const fam = shares.teams[teamAbbr];
  if (!fam?.rates?.players?.length) return null;
  const ratesById = new Map(fam.rates.players.map((r) => [r.playerId, r]));
  const share = (family, id) => fam[family]?.players?.find((p) => p.playerId === id)?.share ?? 0;
  const ids = new Set();
  for (const f of ["passAttempts", "rushAttempts", "targets", "scorerTd"]) for (const p of fam[f]?.players ?? []) ids.add(p.playerId);
  const out = [];
  for (const id of ids) {
    const r = ratesById.get(id);
    if (!r) continue;
    const nameRec = ["passAttempts", "rushAttempts", "targets", "scorerTd"].map((f) => fam[f]?.players?.find((p) => p.playerId === id)).find(Boolean);
    const mix = tdTypeMix.get(id);
    const tdRushFrac = mix && mix.rush + mix.rec > 0 ? mix.rush / (mix.rush + mix.rec) : 0.4;
    out.push({
      playerId: id, name: nameRec?.name ?? null,
      qbShare: share("passAttempts", id), carryShare: share("rushAttempts", id), targetShare: share("targets", id),
      tdShare: share("scorerTd", id), tdRushFrac,
      compRate: r.compRate, ypcmp: r.ypcmp, catchRate: r.catchRate, ypr: r.ypr, ypc: r.ypc,
    });
  }
  return out;
}

const event = { providerEventId: fc.providerEventId, home: { abbr: fc.home.abbr }, away: { abbr: fc.away.abbr }, seasonType: fc.seasonType };
const sides = {};
for (const side of ["home", "away"]) {
  const abbr = fc[side].abbr;
  const players = composePlayers(abbr);
  if (!players) { sides[abbr] = { state: "ABSTAIN", reason: "no role evidence" }; continue; }
  const sim = simulateJointGame({ event, teamAbbr: abbr, fit, bridge, strengthState: wrapped, players, artifactDate: NOW.slice(0, 10), runs: 8000 });
  sides[abbr] = sim;
}

const out = {
  schemaVersion: 1,
  artifact: "nfl-joint-sim-probe",
  dataClass: "PRIVATE_RESEARCH",
  engineId: NFL_JOINT_SIM_ID,
  generatedAt: NOW,
  providerEventId: fc.providerEventId,
  matchup: fc.matchup,
  kickoffUtc: fc.kickoffUtc,
  totalsHead: ts.state === "READY" ? "matchup (integrated)" : "constant",
  publishedForecastComparison: {
    published: fc.forecastSummary.projectedScore,
    publishedTotalMedian: fc.forecastSummary.total.median,
  },
  sides,
};
const outPath = path.join(ROOT, `data/internal/research/nfl/reports/joint-sim-probe-${fc.providerEventId}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const [abbr, s] of Object.entries(sides)) {
  if (s.state !== "SIMULATED") { console.log(`${abbr}: ${s.state} — ${s.reason}`); continue; }
  const qb = s.players.filter((p) => p.markets.player_pass_yds).sort((a, b) => (b.markets.player_pass_yds.mean ?? 0) - (a.markets.player_pass_yds.mean ?? 0))[0];
  console.log(`${abbr}: score p50 ${s.team.score.median} · offTD mean ${s.team.offensiveTd.mean} · otherPts ${s.team.otherScoringPoints.mean.toFixed(1)} · QB ${qb?.name} gross ${qb?.markets.player_pass_yds.median?.toFixed(0)} yds, passTD mean ${qb?.markets.player_pass_tds.mean}`);
}
console.log(`written ${outPath}`);
