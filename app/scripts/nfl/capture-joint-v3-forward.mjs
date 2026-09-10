#!/usr/bin/env node
/** Private, pre-kickoff, replay-safe shadow captures. Never writes public forecasts or money. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { simulateJointMatchup } from "../../src/lib/sports/nfl/joint-matchup-v3.mjs";
import { reconcileJointRoster, conditionQuarterbackShares } from "../../src/lib/sports/nfl/joint-roster-reconciliation.mjs";
import { applyJointParticipation, participationAwareQuarterback } from "../../src/lib/sports/nfl/joint-participation-evidence.mjs";
import { buildActivePool } from "../../src/lib/sports/nfl/participation.mjs";
import { buildPlayerRegistry } from "../../src/lib/sports/nfl/player-identity.mjs";
import { projectedQuarterbackAt } from "../../src/lib/sports/nfl/depth-chart-snapshots.mjs";
import { loadPlayerPropsFit } from "../../src/lib/sports/nfl/player-props-v1.mjs";
import { strengthStateAt } from "../../src/lib/sports/nfl/model-v1.mjs";
import { totalsStateAt } from "../../src/lib/sports/nfl/totals-rating.mjs";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const NOW = new Date().toISOString(); // Real wall clock; no backdated receipts.
const RUNS = Number(arg("--runs") ?? 1000);
if (!Number.isInteger(RUNS) || RUNS < 1000) throw new Error("at least 1000 integer draws required");
const hashes = {};
const read = file => { const bytes = fs.readFileSync(file); hashes[path.relative(ROOT, file)] = createHash("sha256").update(bytes).digest("hex"); return JSON.parse(bytes); };
const depth = read(path.resolve(arg("--depth-charts") ?? "MISSING_DEPTH_FILE"));
if (depth.artifact !== "nfl-depth-chart-qb-snapshots" || depth.season !== new Date(NOW).getUTCFullYear() || depth.invalidRows) throw new Error("current-season valid depth receipt required");
const roster = read(path.join(APP, "public/data/nfl/rosters/latest.json"));
const injuries = read(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json"));
for (const [name, doc] of [["roster", roster], ["injuries", injuries]]) {
  const generated = Date.parse(doc.generatedAt), source = Date.parse(doc.sourceAsOf);
  if (!Number.isFinite(generated) || !Number.isFinite(source) || source > generated || generated > Date.parse(NOW) || Date.parse(NOW) - source > 24 * 3600000) throw new Error(`invalid/stale ${name} capture`);
}
const registry = buildPlayerRegistry([roster]);
const roles = read(path.join(ROOT, "data/internal/research/nfl/role-shares-v1/current.json"));
if (!Number.isFinite(Date.parse(roles.generatedAt)) || Date.parse(roles.generatedAt) > Date.parse(NOW)) throw new Error("invalid/future role source");
const finals = read(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json")).rows;
const forecasts = read(path.join(APP, "public/data/nfl/forecasts/latest.json"));
const totalsReceipt = read(path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-evaluation.json"));
const bridgeDoc = JSON.stringify(read(path.join(ROOT, "data/internal/research/nfl/reports/scoring-bridge-v1.json")));
const bridge = { lambdaIntercept: Number(bridgeDoc.match(/"lambdaIntercept":\s*(-?[0-9.]+)/)?.[1]), lambdaPerPoint: Number(bridgeDoc.match(/"lambdaPerPoint":\s*([0-9.]+)/)?.[1]) };
const baseFit = loadPlayerPropsFit({ fs, path, cwd: APP });
const tdMix = new Map();
for (const season of [2023, 2024, 2025]) {
  const corpus = read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`));
  for (const game of corpus.games) {
    if (!(Date.parse(game.dateUtc) < Date.parse(NOW))) continue;
    for (const p of game.players ?? []) {
      const mix = tdMix.get(p.playerId) ?? { rush: 0, rec: 0 };
      mix.rush += p.rushTd ?? 0; mix.rec += p.recTd ?? 0; tdMix.set(p.playerId, mix);
    }
  }
}
const events = forecasts.forecasts.filter(f => Date.parse(f.kickoffUtc) > Date.parse(NOW));
const outDir = path.join(ROOT, "data/internal/research/nfl/joint-v3-forward");
fs.mkdirSync(outDir, { recursive: true });
const results = [];
for (const fc of events) {
  const playersByTeam = {}, inputNotes = {};
  const active = buildActivePool({ event: fc, registry, injuriesArtifact: injuries, nowIso: NOW });
  let reason = null;
  for (const abbr of [fc.home.abbr, fc.away.abbr]) {
    const team = roles.teams[abbr];
    if (!team?.rates?.players?.length) { reason = `missing historical role evidence: ${abbr}`; break; }
    const share = (family, id) => team[family]?.players?.find(p => p.playerId === id)?.share ?? 0;
    const players = team.rates.players.map(r => {
      const mix = tdMix.get(r.playerId);
      const name = ["passAttempts", "rushAttempts", "targets", "scorerTd"].flatMap(k => team[k]?.players ?? []).find(p => p.playerId === r.playerId)?.name ?? null;
      return { ...r, name, qbShare: share("passAttempts", r.playerId), carryShare: share("rushAttempts", r.playerId), targetShare: share("targets", r.playerId), tdShare: share("scorerTd", r.playerId), tdRushFrac: mix && mix.rush + mix.rec ? mix.rush / (mix.rush + mix.rec) : 0.4 };
    }).filter(p => p.qbShare || p.carryShare || p.targetShare || p.tdShare);
    const sourceDepth = projectedQuarterbackAt(depth.snapshots, { team: abbr, cutoffIso: NOW });
    const snapshot = sourceDepth.timestamp ? depth.snapshots.find(s => s.team === abbr && s.timestamp === sourceDepth.timestamp) : null;
    const chart = sourceDepth.state === "PROJECTED_DEPTH_STARTER"
      ? participationAwareQuarterback(snapshot, active.pools[abbr]) : sourceDepth;
    const filtered = applyJointParticipation(players, active.pools[abbr]);
    const conditioned = conditionQuarterbackShares(filtered.players, chart, 0.9577);
    const reconciled = reconcileJointRoster(conditioned.players);
    playersByTeam[abbr] = reconciled.players;
    inputNotes[abbr] = { participation: { decisions: filtered.decisions, removedMass: filtered.removedMass, uncertaintyResolved: filtered.uncertaintyResolved }, chart, conditioningApplied: conditioned.applied, conditioningReason: conditioned.reason, adjustments: reconciled.adjustments };
  }
  if (reason) { results.push({ eventId: fc.providerEventId, state: "REFUSED", reason }); continue; }
  const ts = totalsStateAt({ rows: finals, cutoffIso: NOW, receipt: totalsReceipt });
  if (ts.state !== "READY") { results.push({ eventId: fc.providerEventId, state: "REFUSED", reason: ts.reason }); continue; }
  const fit = { ...baseFit, gamesim: { ...baseFit.gamesim, muTotal: ts.muFor(fc.home.name, fc.away.name), sigmaTotal: ts.sigma } };
  const strength = strengthStateAt({ rows: finals.filter(r => Date.parse(r.dateUtc) < Date.parse(NOW)), cutoffIso: NOW, regressToSeason: fc.season ?? new Date(NOW).getUTCFullYear() });
  const names = new Map([[fc.home.abbr, fc.home.name], [fc.away.abbr, fc.away.name]]);
  const event = { providerEventId: fc.providerEventId, home: fc.home, away: fc.away, seasonType: fc.seasonType };
  const sim = simulateJointMatchup({ event, playersByTeam, fit, bridge, strengthState: { ratingFor: team => strength.ratingFor(names.get(team) ?? team) }, artifactDate: NOW.slice(0, 10), runs: RUNS });
  if (sim.state !== "SIMULATED") { results.push({ eventId: fc.providerEventId, state: sim.state, reason: sim.reason }); continue; }
  const inputs = { event, playersByTeam, fit, bridge, ratings: Object.fromEntries([...names].map(([abbr, name]) => [abbr, strength.ratingFor(name)])), artifactDate: NOW.slice(0, 10), runs: RUNS };
  const inputHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  // Evidence-only changes (e.g. questionable -> unknown) deserve a new revision even
  // when their conditional numerical inputs happen to coincide. Keep replay inputHash separate.
  const evidenceHash = createHash("sha256").update(JSON.stringify({ inputHash, inputNotes, sourceHashes: hashes })).digest("hex");
  const output = path.join(outDir, `${fc.providerEventId}-${evidenceHash.slice(0, 20)}.json`);
  const doc = { artifact: "nfl-joint-v3-forward-shadow", dataClass: "PRIVATE_RESEARCH", generatedAt: NOW, kickoffUtc: fc.kickoffUtc,
    sourceHashes: hashes, inputHash, evidenceHash, inputs, inputNotes, roleEvidenceGeneratedAt: roles.generatedAt,
    limitations: ["Not public eligible; no markets or recommendations", "Current roster/injury filter applied; historical role estimates remain conditional on uncertain participation", "Depth chart is not guaranteed participation", "Partial offensive model; other scoring remains unspecified"], simulation: sim };
  if (!(Date.now() < Date.parse(fc.kickoffUtc))) { results.push({ eventId: fc.providerEventId, state: "REFUSED", reason: "kickoff passed during generation" }); continue; }
  const alreadyExists = fs.existsSync(output);
  if (!alreadyExists) fs.writeFileSync(output, JSON.stringify(doc, null, 1), { flag: "wx" });
  results.push({ eventId: fc.providerEventId, state: alreadyExists ? "EXISTING" : "CAPTURED", output, home: fc.home.abbr, away: fc.away.abbr });
}
console.log(JSON.stringify({ generatedAt: NOW, expectedUpcoming: events.length, results }, null, 2));
