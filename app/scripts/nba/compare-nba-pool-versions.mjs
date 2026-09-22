/**
 * v0 vs v0.1 population diff (v1.8 Track A · A1 receipt) — PRIVATE RESEARCH, read-only over two artifacts.
 *
 * Answers, per game and per side, exactly what the roster gate changed: who v0 simulated that v0.1
 * excluded (departures), who v0.1 lists that v0 could not see (rookies / arrivals — split into modelled
 * from other-team history vs INSUFFICIENT_HISTORY), and how the two forecasts differ. Writes
 *   data/internal/research/nba/reports/pool-v0-vs-v0.1-<date>.json
 *
 * Run (from app/):
 *   npx tsx scripts/nba/compare-nba-pool-versions.mjs --date 2026-10-03 [--v0 <file>] [--v01 <file>] [--write]
 * Defaults: experimental/forecasts/<date>.json and experimental-v0.1/forecasts/<date>.json. Both artifacts
 * should share inputAsOf; the report refuses to compare artifacts built at different instants unless
 * --allow-asof-mismatch is passed (and then records it).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NBA = path.resolve(APP, "..", "data", "internal", "research", "nba");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }
const V0 = opt("--v0") ?? path.join(NBA, "experimental", "forecasts", `${DATE}.json`);
const V01 = opt("--v01") ?? path.join(NBA, "experimental-v0.1", "forecasts", `${DATE}.json`);
const WRITE = argv.includes("--write");
for (const f of [V0, V01]) if (!fs.existsSync(f)) { console.error(`REFUSED: missing ${f}`); process.exit(1); }
const v0 = JSON.parse(fs.readFileSync(V0, "utf8"));
const v01 = JSON.parse(fs.readFileSync(V01, "utf8"));
if (v0.modelVersion !== "nba-preseason-experimental-v0" || v01.modelVersion !== "nba-preseason-experimental-v0.1") { console.error(`REFUSED: expected v0 + v0.1 artifacts, got ${v0.modelVersion} + ${v01.modelVersion}`); process.exit(1); }
if (v0.inputAsOf !== v01.inputAsOf && !argv.includes("--allow-asof-mismatch")) { console.error(`REFUSED: inputAsOf differs (${v0.inputAsOf} vs ${v01.inputAsOf}) — rebuild both at one instant or pass --allow-asof-mismatch`); process.exit(1); }

const r4 = (x) => (x == null ? null : Number(Number(x).toFixed(4)));
const byId = (list) => new Map((list ?? []).map((p) => [String(p.providerAthleteId), p]));
const games = [];
const totals = { games: 0, sides: 0, v0Simulated: 0, v01Simulated: 0, departuresExcluded: 0, departureMinutesExcluded: 0, arrivalsModelledOtherTeam: 0, arrivalMinutesAdded: 0, insufficientHistory: 0, retained: 0, refusedByGate: 0 };
const g01ById = new Map((v01.games ?? []).map((g) => [String(g.providerEventId), g]));
for (const g0 of v0.games ?? []) {
  const id = String(g0.providerEventId);
  const g1 = g01ById.get(id) ?? null;
  totals.games += 1;
  if (!g1) { totals.refusedByGate += 1; games.push({ providerEventId: id, matchup: `${g0.away.abbr} @ ${g0.home.abbr}`, v01: "REFUSED", refusal: (v01.manifest?.refused ?? []).filter((r) => String(r.providerEventId) === id) }); continue; }
  const sides = {};
  for (const sideKey of ["home", "away"]) {
    totals.sides += 1;
    const p0 = byId(g0.forecast.players[sideKey]);
    const p1 = byId(g1.forecast.players[sideKey]);
    const pool = g1[sideKey].pool;
    const departures = [...p0.values()].filter((p) => !p1.has(String(p.providerAthleteId))).map((p) => ({ providerAthleteId: p.providerAthleteId, name: p.name, v0ExpectedMinutes: p.expectedMinutes, v0PtsMean: p.pts?.mean ?? null }));
    const arrivals = [...p1.values()].filter((p) => !p0.has(String(p.providerAthleteId))).map((p) => ({ providerAthleteId: p.providerAthleteId, name: p.name, v01ExpectedMinutes: p.expectedMinutes, historyTeam: pool.otherTeamHistory.find((o) => o.providerAthleteId === String(p.providerAthleteId))?.historyTeam ?? null }));
    const retained = [...p1.keys()].filter((k) => p0.has(k)).length;
    totals.v0Simulated += p0.size; totals.v01Simulated += p1.size; totals.retained += retained;
    totals.departuresExcluded += departures.length; totals.departureMinutesExcluded += departures.reduce((s, p) => s + (p.v0ExpectedMinutes ?? 0), 0);
    totals.arrivalsModelledOtherTeam += arrivals.length; totals.arrivalMinutesAdded += arrivals.reduce((s, p) => s + (p.v01ExpectedMinutes ?? 0), 0);
    totals.insufficientHistory += pool.insufficientHistory.length;
    sides[sideKey] = {
      team: `${g0[sideKey].abbr} (${g0[sideKey].providerTeamId})`,
      rosterSize: pool.rosterSize, rosterAsOf: pool.rosterAsOf,
      v0Simulated: p0.size, v01Simulated: p1.size, retained,
      departuresExcluded: departures, arrivalsModelledFromOtherTeam: arrivals,
      insufficientHistory: pool.insufficientHistory, out: pool.out,
      v0RawPoolMinutes: g0.forecast.assumptions.minutes[sideKey].rawPoolMinutes, v01RawPoolMinutes: g1.forecast.assumptions.minutes[sideKey].rawPoolMinutes,
      v0Rescale: g0.forecast.assumptions.minutes[sideKey].rescaleFactor, v01Rescale: g1.forecast.assumptions.minutes[sideKey].rescaleFactor,
      v0PoolRateSubstitutions: g0.forecast.assumptions.minutes[sideKey].poolRateSubstitutions, v01PoolRateSubstitutions: g1.forecast.assumptions.minutes[sideKey].poolRateSubstitutions,
      scoreMean: { v0: g0.forecast.sim[sideKey].mean, v01: g1.forecast.sim[sideKey].mean },
    };
  }
  games.push({
    providerEventId: id, matchup: `${g0.away.abbr} @ ${g0.home.abbr}`, label: g0.label, dateUtc: g0.dateUtc,
    elo: { pHome: g0.forecast.elo.pHome, note: "identical by construction — the Elo does not read the pool" },
    sim: { v0: { pHome: g0.forecast.sim.pHome, marginMean: g0.forecast.sim.margin.mean, marginSd: g0.forecast.sim.margin.sd, totalMean: g0.forecast.sim.total.mean, totalSd: g0.forecast.sim.total.sd }, v01: { pHome: g1.forecast.sim.pHome, marginMean: g1.forecast.sim.margin.mean, marginSd: g1.forecast.sim.margin.sd, totalMean: g1.forecast.sim.total.mean, totalSd: g1.forecast.sim.total.sd }, pHomeDelta: r4(g1.forecast.sim.pHome - g0.forecast.sim.pHome), eloVsSimGap: { v0: g0.forecast.eloVsSimGap, v01: g1.forecast.eloVsSimGap } },
    sides,
  });
}
const report = {
  schemaVersion: 1, artifact: "nba-pool-version-comparison", dataClass: "PRIVATE_RESEARCH", productEligible: false,
  date: DATE, generatedAt: new Date().toISOString(),
  inputs: { v0: { file: path.relative(path.resolve(APP, ".."), V0), modelVersion: v0.modelVersion, inputAsOf: v0.inputAsOf, rosterAsOf: v0.roster?.asOf ?? null }, v01: { file: path.relative(path.resolve(APP, ".."), V01), modelVersion: v01.modelVersion, poolVersion: v01.poolVersion ?? null, inputAsOf: v01.inputAsOf, rosterAsOf: v01.roster?.asOf ?? null } },
  asOfMismatch: v0.inputAsOf !== v01.inputAsOf,
  totals: { ...totals, departureMinutesExcluded: r4(totals.departureMinutesExcluded), arrivalMinutesAdded: r4(totals.arrivalMinutesAdded), rosterCoverage: totals.sides ? r4((totals.v01Simulated + totals.insufficientHistory) / (v01.manifest?.pool?.rosterPlayers || 1)) : null, refusalRate: totals.games ? r4(totals.refusedByGate / totals.games) : null },
  reading: "v0 simulated departed players and could not see arrivals; v0.1 excludes the former (listed), admits the latter with other-team history where it exists, and lists rostered players with no history as INSUFFICIENT_HISTORY (null, never zero). Forecast deltas are reported, not judged — grading decides from Oct 3, in separate ledgers.",
  games,
};
console.log(`pool comparison ${DATE}: games ${totals.games} (v0.1 refused ${totals.refusedByGate}) · sides ${totals.sides}`);
console.log(` simulated v0 ${totals.v0Simulated} → v0.1 ${totals.v01Simulated} · retained ${totals.retained} · departures excluded ${totals.departuresExcluded} (${report.totals.departureMinutesExcluded} v0 minutes) · arrivals modelled from other-team history ${totals.arrivalsModelledOtherTeam} (${report.totals.arrivalMinutesAdded} minutes) · INSUFFICIENT_HISTORY ${totals.insufficientHistory}`);
for (const g of games) if (g.sim) console.log(` ${g.matchup}: sim pHome ${g.sim.v0.pHome} → ${g.sim.v01.pHome} (Δ ${g.sim.pHomeDelta}) · margin ${g.sim.v0.marginMean}±${g.sim.v0.marginSd} → ${g.sim.v01.marginMean}±${g.sim.v01.marginSd} · total ${g.sim.v0.totalMean} → ${g.sim.v01.totalMean} · elo ${g.elo.pHome}`);
if (WRITE) {
  const out = path.join(NBA, "reports", `pool-v0-vs-v0.1-${DATE}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
} else console.log("dry run — pass --write to persist");
