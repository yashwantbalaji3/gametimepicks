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
 *   npx tsx scripts/nba/build-nba-experimental-forecasts.mjs --date 2026-10-03 --now 2026-09-22T12:00:00Z [--write] [--simulations N]
 * Exit: 0 ok · 1 usage / refused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildForecastArtifact } from "../../src/lib/sports/nba/experimental-forecast.mjs";
import { DEFAULT_SIMULATIONS } from "../../src/lib/sports/nba/game-sim.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESEARCH = path.resolve(APP, "..", "data", "internal", "research");
const NBA = path.join(RESEARCH, "nba");
const CORPUS = path.join(NBA, "corpus-v1.json");
const BOXSCORES = path.join(NBA, "boxscores");
const SCHEDULE = path.join(APP, "public", "data", "nba", "schedule", "latest.json");
const INJURIES = path.join(RESEARCH, "injuries", "nba", "latest.json");
const OUT_DIR = path.join(NBA, "experimental", "forecasts");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] ?? null; };
const DATE = opt("--date");
const NOW = opt("--now");
const WRITE = flag("--write");
const SIMS = opt("--simulations") != null ? Number(opt("--simulations")) : DEFAULT_SIMULATIONS;
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
if (!Number.isInteger(SIMS) || SIMS < 1) { console.error("REFUSED: --simulations must be a positive integer"); process.exit(1); }
for (const f of [CORPUS, SCHEDULE, BOXSCORES]) if (!fs.existsSync(f)) { console.error(`REFUSED: missing input ${f}`); process.exit(1); }

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const corpus = readJson(CORPUS);
const schedule = readJson(SCHEDULE);
const injuries = fs.existsSync(INJURIES) ? readJson(INJURIES) : null;
const boxscores = fs.readdirSync(BOXSCORES)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => readJson(path.join(BOXSCORES, f)));

const { artifact, manifest } = buildForecastArtifact({
  date: DATE, now: NOW,
  scheduleRows: schedule.rows ?? [], corpusRows: corpus.rows ?? [], boxscores,
  injuries: injuries?.entries ?? null, simulations: SIMS,
});
artifact.inputs = {
  corpus: { file: "corpus-v1.json", generatedAt: corpus.generatedAt ?? null, rows: (corpus.rows ?? []).length },
  boxscores: { dir: "boxscores/", docs: boxscores.length },
  schedule: { file: "app/public/data/nba/schedule/latest.json", generatedAt: schedule.generatedAt ?? null, rows: (schedule.rows ?? []).length },
  injuries: injuries ? { file: "injuries/nba/latest.json", generatedAt: injuries.generatedAt ?? null, sourceAsOf: injuries.sourceAsOf ?? null, entries: (injuries.entries ?? []).length } : null,
};

console.log(`NBA experimental forecasts · ${DATE} · now ${NOW} · sims ${SIMS}`);
console.log(` schedule rows on date: ${manifest.gamesOnSchedule} · forecast ${manifest.gamesForecast} · refused ${manifest.refused.length}`);
console.log(` labels: ${JSON.stringify(manifest.byLabel)}`);
for (const g of artifact.games) {
  const f = g.forecast;
  console.log(`  ${g.providerEventId} ${g.away.abbr} @ ${g.home.abbr} [${g.label}] elo pHome ${f.elo.pHome} (${g.home.rating.basis}/${g.away.rating.basis}) · sim pHome ${f.sim.pHome} · ${f.sim.away.mean}-${f.sim.home.mean} · pool ${f.assumptions.availability.away.poolSize}/${f.assumptions.availability.home.poolSize} · seed ${f.seed}`);
}
console.log(` players: expectedMinutes ${manifest.playersWithExpectedMinutes} · out ${manifest.playersOut} · noMinutes ${manifest.playersNoMinutes} · basis ${JSON.stringify(manifest.minutesBasisCounts)}`);
console.log(` unknown-to-history (injuries): ${manifest.playersUnknownToHistory.length} · teams w/o boxscore history: ${manifest.teamsWithoutBoxscoreHistory.length} · w/o rating: regular ${manifest.teamsWithoutRegularHistory.length} preseason ${manifest.teamsWithoutPreseasonHistory.length}`);
console.log(` substitutions: pool-rate ${manifest.poolRateSubstitutions} · default-sd ${manifest.defaultSdSubstitutions}`);

if (WRITE) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `${DATE}.json`);
  fs.writeFileSync(out, JSON.stringify(artifact, null, 1));
  console.log(`wrote ${path.relative(path.resolve(APP, ".."), out)}`);
} else {
  console.log("dry run — pass --write to persist");
}
