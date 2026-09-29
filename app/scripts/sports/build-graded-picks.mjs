/**
 * Publish one "model picks vs actual outcomes" artifact per sport, from each sport's own graded
 * ledger, in the single shape every surface renders.
 *
 * Writes public/data/<sport>/graded-picks.json.
 *
 * FOUR SOURCES, FOUR SHAPES, ONE CONTRACT. Each adapter below reads the ledger that sport already
 * maintains and translates it — nothing is re-graded here, and no outcome is derived. If a sport's
 * ledger says a pick missed, this says it missed. That matters because a translation layer that
 * recomputed anything would be a second opinion about a settled result, and settled results have
 * exactly one source per sport.
 *
 * WHAT EACH SPORT'S RECORD ACTUALLY IS differs, and the difference is carried on the artifact rather
 * than flattened away:
 *   · MLB is a MODEL-PERFORMANCE ledger over player props, independent of the paper bankroll — it
 *     shares no rows with the 19-14 money record and must never be read as one.
 *   · NFL is EXPERIMENTAL preseason forecasting. The team model is not promoted, and its own model
 *     card says so.
 *   · UFC is the fight model's winner head, the one model here that cleared a preregistered bar.
 *   · EPL is a model that has cleared nothing and is published as distributions, not picks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGradedRecord } from "../../src/lib/sports/graded-picks.mjs";
import { makeGradedPickOwners } from "../../src/lib/sports/graded-pick-owners.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now", new Date().toISOString());
const WRITE = process.argv.includes("--write");

/* The owner readers live in src/lib/sports/graded-pick-owners.mjs (Results V2 reads the same rows). */
const { ufcPicks, eplPicks, nflPicks, mlbPicks } = makeGradedPickOwners({ appDir: APP, rootDir: ROOT });

const SPORTS = [
  { sport: "mlb", label: "MLB", picks: mlbPicks, shown: 60,
    what: "Player-prop projections: the model's over/under lean against the book's line, graded from the official box score.",
    caveat: "A model-performance record, independent of the paper bankroll. It shares no row with the settled money record on /results." },
  { sport: "nfl", label: "NFL", picks: nflPicks, shown: 60,
    what: "Preseason game forecasts: which side the model favoured, graded against the official final.",
    caveat: "EXPERIMENTAL. The NFL team model has not cleared a preregistered bar and is not promoted into any paper product. A tie is recorded as void, not a miss." },
  { sport: "ufc", label: "UFC", picks: ufcPicks, shown: 60,
    what: "Fight-winner picks: the model's chosen fighter and its probability, graded against the official result.",
    caveat: "The market's own de-vigged probability for the same bout is shown alongside. This is the only sport here where the two are recorded together." },
  { sport: "epl", label: "Premier League", picks: eplPicks, shown: 60,
    what: "Match-result forecasts: the outcome the model gave the most probability to, graded against the official full-time score.",
    caveat: "This model has cleared no preregistered bar and publishes distributions rather than picks — the 'predicted' column is simply its likeliest outcome." },
];

let wrote = 0;
for (const s of SPORTS) {
  const picks = s.picks();
  if (picks == null) { console.log(`${s.sport}: no graded ledger on disk — nothing published (not a zero)`); continue; }
  const record = buildGradedRecord({ sport: s.sport, label: s.label, picks, shown: s.shown, what: s.what, caveat: s.caveat });
  const artifact = {
    schemaVersion: 1, artifact: "graded-picks", dataClass: "PUBLIC_DERIVED", moneyClass: "NON_MONEY",
    generatedAt: NOW, ...record,
  };
  const out = path.join(APP, "public", "data", s.sport, "graded-picks.json");
  console.log(`${s.sport}: ${record.counts.counted} graded · ${record.counts.hits} hit · ${record.counts.voided} void · ${record.sampleState}`);
  if (WRITE) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(artifact, null, 1) + "\n"); wrote += 1; }
}
console.log(WRITE ? `wrote ${wrote} artifact(s)` : "dry run — pass --write to publish");
