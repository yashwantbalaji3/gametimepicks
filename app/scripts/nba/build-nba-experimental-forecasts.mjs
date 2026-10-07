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
 *   npx tsx scripts/nba/build-nba-experimental-forecasts.mjs --date 2026-10-03 --now 2026-09-22T12:00:00Z [--write] [--simulations N] [--family v0|v0.1] [--out <file>] [--horizon-hours H]
 *
 * FAMILIES (v1.8 A1): --family v0 (default) is the frozen preregistered pool (box-score history) and writes
 * experimental/forecasts/; --family v0.1 is the ROSTER-GATED pool and writes experimental-v0.1/forecasts/.
 * v0.1 REFUSES (exit 1) when rosters/latest.json is absent — it never falls back to history. --family v0.2 is the
 * 2026-27 CHALLENGER (founder N3): v0.1's pool, plus the season's finals record and fetched box scores folded at
 * --now (season-fold.mjs); writes experimental-v0.2/forecasts/ and REFUSES when the finals record is unreadable. --out <file>
 * overrides the output path for a research comparison (never used by the workflow).
 * WRITE-ONCE, PRE-TIP (Session 10 · G2/G4/G7 — lib/sports/nba/forecast-receipt.mjs): the date file is never
 * rewritten whole. A game already in it is kept byte-for-byte; a game whose tip is at or before --now is
 * REFUSED, never forecast late; only games not yet forecast and still ahead are built and ADDED, each with a
 * receipt (inputs used, injury snapshot hash + age, payloadSha256). So more than one run a day is safe and
 * can only fill gaps. --horizon-hours H limits a run to games tipping within H hours (the windowed run
 * in nba-forecast-window.yml); the daily run passes none. An injury snapshot captured after --now is refused.
 *
 * Exit: 0 ok (including NOTHING_OWED) · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact, familySpec, familyGuard, etDateOf, FAMILIES } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { finalsAsCorpusRows, foldBoxscores } from "../../src/lib/sports/nba/season-fold.mjs";
import { DEFAULT_SIMULATIONS } from "../../src/lib/sports/nba/game-sim.mjs";
import { planRun, stampReceipt, mergeForecastArtifact, frozenGameViolations, injurySnapshotProvenance, sha256 } from "../../src/lib/sports/nba/forecast-receipt.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESEARCH = path.resolve(APP, "..", "data", "internal", "research");
const NBA = path.join(RESEARCH, "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");
const INJURIES = path.join(RESEARCH, "injuries", "nba", "latest.json");
const ROSTERS = path.join(NBA, "rosters", "latest.json");
const FINALS = path.join(APP, "public", "data", "nba", "results", "finals-2026-27.json");

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
const HORIZON = opt("--horizon-hours") != null ? Number(opt("--horizon-hours")) : null;
if (HORIZON != null && !(HORIZON > 0)) { console.error("REFUSED: --horizon-hours must be a positive number"); process.exit(1); }
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
if (!Number.isInteger(SIMS) || SIMS < 1) { console.error("REFUSED: --simulations must be a positive integer"); process.exit(1); }
for (const f of [CORPUS, SCHEDULE, BOXSCORES]) if (!fs.existsSync(f)) { console.error(`REFUSED: missing input ${f}`); process.exit(1); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(CORPUS);
const schedule = readJson(SCHEDULE);
const injuriesText = fs.existsSync(INJURIES) ? fs.readFileSync(INJURIES, "utf8") : null;
const injuries = injuriesText != null ? JSON.parse(injuriesText) : null;
const rostersText = fs.existsSync(ROSTERS) ? fs.readFileSync(ROSTERS, "utf8") : null;
const rosters = rostersText != null ? JSON.parse(rostersText) : null;

// G4 — the injury snapshot this run reads, described; one captured after the forecast instant is refused.
const injuryInput = injurySnapshotProvenance({ doc: injuries, text: injuriesText, now: NOW });
if (!injuryInput.ok) { console.error(`REFUSED: ${injuryInput.reason}`); process.exit(1); }

// G7 — the stored date file (if any) is the starting point; its games are frozen.
const TARGET = OUT_FILE ? path.resolve(OUT_FILE) : path.join(OUT_DIR, `${DATE}.json`);
const existing = fs.existsSync(TARGET) ? readJson(TARGET) : null;
if (existing) {
  const g = familyGuard({ family: FAMILY.family, doc: existing, what: "stored forecast artifact" });
  if (!g.ok) { console.error(`REFUSED: ${path.relative(path.resolve(APP, ".."), TARGET)} — ${g.detail}`); process.exit(1); }
}
const existingIds = new Set((existing?.games ?? []).map((x) => String(x.providerEventId)));
const plan = planRun({ scheduleRows: schedule.rows ?? [], date: DATE, etDateOf, existingIds, now: NOW, horizonHours: HORIZON });
const outcomeCounts = plan.outcomes.reduce((m, o) => ({ ...m, [o.outcome]: (m[o.outcome] ?? 0) + 1 }), {});
console.log(`plan ${DATE} @ ${NOW}${HORIZON != null ? ` (horizon ${HORIZON} h)` : ""}: ${JSON.stringify(outcomeCounts)}`);
for (const o of plan.outcomes.filter((x) => x.outcome === "STARTED_BEFORE_FIRST_FORECAST")) console.log(`  REFUSED ${o.providerEventId}: tipped ${o.tipUtc}, never forecast before tip — not forecast late`);
if (plan.outcomes.length > 0 && plan.build.length === 0) {
  console.log(`state=NOTHING_OWED · ${DATE}: every scheduled game is already frozen, already tipped, or outside the horizon — nothing written (exit 0)`);
  process.exit(0);
}
const buildIds = new Set(plan.build);
if (FAMILY.poolRule === "roster-gated" && !rosters) { console.error(`REFUSED: family ${FAMILY.family} requires ${path.relative(path.resolve(APP, ".."), ROSTERS)} — no roster capture, no forecast (never box-score membership)`); process.exit(1); }
const readBoxDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => readJson(path.join(dir, f))) : []);
const corpusBoxscores = readBoxDir(BOXSCORES);
let boxscores = corpusBoxscores;
let corpusRows = corpus.rows ?? [];
let seasonFold = null;
let finalsText = null;
if (FAMILY.dataRule !== "corpus-v1") {
  // v0.2 (N3): fold the 2026-27 season as of --now. No finals record → no challenger forecast (never a silent v0.1 copy).
  if (!fs.existsSync(FINALS)) { console.error(`REFUSED: family ${FAMILY.family} requires ${path.relative(path.resolve(APP, ".."), FINALS)}`); process.exit(1); }
  finalsText = fs.readFileSync(FINALS, "utf8");
  const finals = finalsAsCorpusRows(JSON.parse(finalsText), { corpusIds: new Set(corpusRows.map((r) => String(r.providerEventId))), now: NOW });
  const fetched = Object.values(FAMILIES).flatMap((f) => readBoxDir(path.join(NBA, f.dir, "boxscores")));
  const box = foldBoxscores(corpusBoxscores, fetched, { now: NOW });
  corpusRows = [...corpusRows, ...finals.rows];
  boxscores = box.docs;
  seasonFold = { finalsFolded: finals.rows.length, finalsSkipped: finals.skipped, boxscoresFolded: box.added, boxscoresSkipped: box.skipped };
  console.log(`season fold @ ${NOW}: finals +${finals.rows.length} ${JSON.stringify(finals.skipped)} · box scores +${box.added} ${JSON.stringify(box.skipped)}`);
}

const { artifact, manifest } = buildForecastArtifact({
  date: DATE, now: NOW,
  scheduleRows: (schedule.rows ?? []).filter((r) => buildIds.has(String(r?.providerEventId))), corpusRows, boxscores,
  injuries: injuries?.entries ?? null, rosters, simulations: SIMS, family: FAMILY.family,
});
artifact.inputs = {
  corpus: { file: "corpus-v1.json", generatedAt: corpus.generatedAt ?? null, rows: (corpus.rows ?? []).length },
  boxscores: { dir: "boxscores/", docs: boxscores.length },
  schedule: { file: "app/public/data/nba/schedule/latest.json", generatedAt: schedule.generatedAt ?? null, rows: (schedule.rows ?? []).length },
  injuries: injuries ? { file: "injuries/nba/latest.json", generatedAt: injuries.generatedAt ?? null, sourceAsOf: injuries.sourceAsOf ?? null, entries: (injuries.entries ?? []).length } : null,
  rosters: rosters ? { file: "rosters/latest.json", asOf: rosters.asOf ?? null, contractVersion: rosters.contractVersion ?? null, teamsCaptured: rosters.manifest?.teamsCaptured ?? null, players: rosters.manifest?.players ?? null } : null,
  ...(seasonFold ? { seasonFold } : {}),
};
/* The per-game receipt's inputs: what THIS game was built from, with content hashes (G4). */
const receiptInputs = {
  injuries: { file: "injuries/nba/latest.json", ...injuryInput.provenance },
  rosters: rosters ? { file: "rosters/latest.json", asOf: rosters.asOf ?? null, contractVersion: rosters.contractVersion ?? null, sha256: sha256(rostersText) } : null,
  schedule: { file: "app/public/data/nba/schedule/latest.json", generatedAt: schedule.generatedAt ?? null },
  corpus: { file: "corpus-v1.json", generatedAt: corpus.generatedAt ?? null, rows: (corpus.rows ?? []).length },
  boxscores: { dir: "boxscores/", docs: boxscores.length },
  ...(seasonFold ? { finals: { file: "app/public/data/nba/results/finals-2026-27.json", sha256: sha256(finalsText), folded: seasonFold.finalsFolded }, fetchedBoxscores: { folded: seasonFold.boxscoresFolded } } : {}),
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
if (FAMILY.poolRule === "roster-gated") console.log(` pool ${FAMILY.family}: roster players ${manifest.pool.rosterPlayers} · simulated ${manifest.pool.playersSimulated} · INSUFFICIENT_HISTORY ${manifest.pool.playersInsufficientHistory} · excluded (not on roster) ${manifest.pool.playersExcludedNotOnRoster} · other-team history ${manifest.pool.playersOtherTeamHistory} · games refused by gate ${manifest.pool.gamesRefusedByRosterGate}`);
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

const stampedGames = artifact.games.map((g) => stampReceipt(g, { family: FAMILY.family, modelVersion: artifact.modelVersion, now: NOW, inputs: receiptInputs }));
const merged = mergeForecastArtifact({
  existing, built: artifact, stampedGames, now: NOW,
  runManifest: { horizonHours: HORIZON, outcomes: plan.outcomes, refused: manifest.refused, injuries: injuryInput.provenance.state },
});
if (!merged.ok) { for (const e of merged.errors) console.error(`REFUSED: ${e}`); process.exit(1); }
const violations = frozenGameViolations({ before: existing, after: merged.artifact });
if (violations.length) { for (const v of violations) console.error(`REFUSED (write-once): ${v}`); process.exit(1); }
console.log(`receipts: added ${merged.added.length} (${merged.added.join(", ") || "none"}) · frozen kept ${existingIds.size} · injuries ${injuryInput.provenance.state} (age ${injuryInput.provenance.ageMinutesAtForecast} min)`);

if (merged.added.length === 0) {
  console.log("state=NOTHING_OWED · no game added — nothing written (exit 0)");
} else if (WRITE || OUT_FILE) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(merged.artifact, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), TARGET)}`);
} else {
  console.log("dry run — pass --write to persist");
}
