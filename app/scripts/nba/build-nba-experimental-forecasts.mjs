/**
 * NBA experimental forecast builder (NBA readiness tracks N2/N3) — PRIVATE RESEARCH ARTIFACT.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * For every schedule row on one ET date: Elo through --now (team-rating.mjs, preseason and regular
 * streams folded separately), expected minutes per team (minutes-model.mjs, population matched to
 * the game's seasonType), a seeded 10,000-run simulation (game-sim.mjs), and a manifest of what
 * was MISSING (teams with no history, injured athletes unknown to the box-score corpus, players
 * without enough appearances). Writes
 *   data/internal/research/nba/experimental/forecasts/<date>.json
 * which NO public code reads (app/src/app/** never imports from data/internal/**).
 *
 * No network. Inputs: corpus-v1.json · boxscores/*.json · app/public/data/nba/schedule/latest.json
 * (read only) · data/internal/research/injuries/nba/latest.json.
 *
 * Run (from app/):
 *   npx tsx scripts/nba/build-nba-experimental-forecasts.mjs --date 2026-10-03 --now 2026-09-22T12:00:00Z [--write] [--simulations N] [--family v0|v0.1] [--out <file>]
 *
 * FAMILIES (v1.8 A1): --family v0 (default) is the frozen preregistered pool (box-score history) and writes
 * experimental/forecasts/; --family v0.1 is the ROSTER-GATED pool and writes experimental-v0.1/forecasts/.
 * v0.1 REFUSES (exit 1) when rosters/latest.json is absent — it never falls back to history. --out <file>
 * overrides the output path for a research comparison (never used by the workflow).
 * Exit: 0 ok · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact, familySpec } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { DEFAULT_SIMULATIONS } from "../../src/lib/sports/nba/game-sim.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESEARCH = path.resolve(APP, "..", "data", "internal", "research");
const NBA = path.join(RESEARCH, "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");
const INJURIES = path.join(RESEARCH, "injuries", "nba", "latest.json");
const ROSTERS = path.join(NBA, "rosters", "latest.json");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
const NOW = opt("--now");
const WRITE = flag("--write");
const SIMS = opt("--simulations") != null ? Number(opt("--simulations")) : DEFAULT_SIMULATIONS;
let FAMILY;
try { FAMILY = familySpec(opt("--family") ?? "v0"); } catch (e) { console.error(e.message); process.exit(1); }
const OUT_DIR = path.join(NBA, FAMILY.dir, "forecasts");
const OUT_FILE = opt("--out");
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
if (!Number.isInteger(SIMS) || SIMS < 1) { console.error("REFUSED: --simulations must be a positive integer"); process.exit(1); }
for (const f of [CORPUS, SCHEDULE, BOXSCORES]) if (!fs.existsSync(f)) { console.error(`REFUSED: missing input ${f}`); process.exit(1); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(CORPUS);
const schedule = readJson(SCHEDULE);
const injuries = fs.existsSync(INJURIES) ? readJson(INJURIES) : null;
const rosters = fs.existsSync(ROSTERS) ? readJson(ROSTERS) : null;
if (FAMILY.poolRule === "roster-gated" && !rosters) { console.error(`REFUSED: family ${FAMILY.family} requires ${path.relative(path.resolve(APP, ".."), ROSTERS)} — no roster capture, no forecast (never box-score membership)`); process.exit(1); }
const boxscores = fs.readdirSync(BOXSCORES)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => readJson(path.join(BOXSCORES, f)));

const { artifact, manifest } = buildForecastArtifact({
  date: DATE, now: NOW,
  scheduleRows: schedule.rows ?? [], corpusRows: corpus.rows ?? [], boxscores,
  injuries: injuries?.entries ?? null, rosters, simulations: SIMS, family: FAMILY.family,
});
artifact.inputs = {
  corpus: { file: "corpus-v1.json", generatedAt: corpus.generatedAt ?? null, rows: (corpus.rows ?? []).length },
  boxscores: { dir: "boxscores/", docs: boxscores.length },
  schedule: { file: "app/public/data/nba/schedule/latest.json", generatedAt: schedule.generatedAt ?? null, rows: (schedule.rows ?? []).length },
  injuries: injuries ? { file: "injuries/nba/latest.json", generatedAt: injuries.generatedAt ?? null, sourceAsOf: injuries.sourceAsOf ?? null, entries: (injuries.entries ?? []).length } : null,
  rosters: rosters ? { file: "rosters/latest.json", asOf: rosters.asOf ?? null, contractVersion: rosters.contractVersion ?? null, teamsCaptured: rosters.manifest?.teamsCaptured ?? null, players: rosters.manifest?.players ?? null } : null,
};

console.log(`NBA experimental forecasts · family ${FAMILY.family} (${FAMILY.poolRule}) · ${DATE} · now ${NOW} · sims ${SIMS}`);
console.log(` schedule rows on date: ${manifest.gamesOnSchedule} · forecast ${manifest.gamesForecast} · refused ${manifest.refused.length}`);
console.log(` labels: ${JSON.stringify(manifest.byLabel)}`);
for (const g of artifact.games) {
  const f = g.forecast;
  console.log(`  ${g.providerEventId} ${g.away.abbr} @ ${g.home.abbr} [${g.label}] elo pHome ${f.elo.pHome} (${g.home.rating.basis}/${g.away.rating.basis}) · sim pHome ${f.sim.pHome} · ${f.sim.away.mean}-${f.sim.home.mean} · pool ${f.assumptions.availability.away.poolSize}/${f.assumptions.availability.home.poolSize} · seed ${f.seed}`);
}
console.log(` players: expectedMinutes ${manifest.playersWithExpectedMinutes} · out ${manifest.playersOut} · noMinutes ${manifest.playersNoMinutes} · basis ${JSON.stringify(manifest.minutesBasisCounts)}`);
console.log(` unknown-to-history (injuries): ${manifest.playersUnknownToHistory.length} · teams w/o boxscore history: ${manifest.teamsWithoutBoxscoreHistory.length} · w/o rating: regular ${manifest.teamsWithoutRegularHistory.length} preseason ${manifest.teamsWithoutPreseasonHistory.length}`);
console.log(` substitutions: pool-rate ${manifest.poolRateSubstitutions} · default-sd ${manifest.defaultSdSubstitutions}`);
if (FAMILY.poolRule === "roster-gated") console.log(` pool v0.1: roster players ${manifest.pool.rosterPlayers} · simulated ${manifest.pool.playersSimulated} · INSUFFICIENT_HISTORY ${manifest.pool.playersInsufficientHistory} · excluded (not on roster) ${manifest.pool.playersExcludedNotOnRoster} · other-team history ${manifest.pool.playersOtherTeamHistory} · games refused by gate ${manifest.pool.gamesRefusedByRosterGate}`);
console.log(` roster: ${manifest.roster.provided ? `asOf ${manifest.roster.asOf} · on roster w/o history ${manifest.roster.playersOnRosterWithoutHistory} · simulated but not on roster ${manifest.roster.playersSimulatedButNotOnRoster} · teams missing ${manifest.roster.teamsMissingRoster.length}` : "not provided (rosters/latest.json absent)"}`);

// NO-OP IS NOT A FAILURE: a date with no NBA game on the schedule writes nothing and exits 0 with an
// explicit state line, so the workflow's BUILT/FAILED split stays meaningful (FAILED = exit 1 above).
if (manifest.gamesOnSchedule === 0) {
  console.log(`state=NO_GAMES · ${DATE} has no NBA game on the schedule capture — nothing written (exit 0)`);
  process.exit(0);
}

if (FAMILY.poolRule === "roster-gated" && manifest.gamesForecast === 0 && manifest.refused.length > 0) {
  console.error(`REFUSED: every game on ${DATE} was refused by the roster gate — ${[...new Set(manifest.refused.map((r) => r.reason))].join("; ")}`);
  process.exit(1);
}

if (WRITE || OUT_FILE) {
  const out = OUT_FILE ? path.resolve(OUT_FILE) : path.join(OUT_DIR, `${DATE}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(artifact, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
} else {
  console.log("dry run — pass --write to persist");
}
