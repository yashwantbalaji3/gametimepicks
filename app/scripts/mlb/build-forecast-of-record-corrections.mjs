#!/usr/bin/env node
/**
 * TRUTH-001 · FORECAST-OF-RECORD CORRECTIONS (founder decision 2026-10-09, Option B) — PROPOSED, NOT APPLIED.
 *
 * Policy: the public forecast of record is the last forecast VERIFIABLY PUBLISHED before first pitch; generation
 * time alone is not enough. The MLB game grader picks "the newest revision generated before first pitch"
 * (grade-games.mjs selectForecastOfRecord), so a revision generated minutes before first pitch — and never served —
 * could be graded. Example the founder named: BAL @ NYY 823491 (2026-09-25), generated 20:04:50Z, committed
 * 20:05:01Z (after the 20:05 first pitch), never served; the forecast the public saw was f51be27b62 (deployment
 * ready 19:27:49Z).
 *
 * For every erased game whose verified-public forecast (pregame-forecast-recoveries.jsonl, PUBLISHED_VERIFIED)
 * differs from the forecast the ledger graded, this appends ONE record referencing both, their versions,
 * timestamps and publication evidence, and the effect on Results computed with the SAME grader
 * (gradeGameFamilies) against the SAME official final. Nothing is regraded: the graded ledger, Results and every
 * denominator are untouched until the founder approves applying a record.
 *
 *   npx tsx app/scripts/mlb/build-forecast-of-record-corrections.mjs [--write]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeGameFamilies } from "../../src/lib/mlb/prediction/grade-games.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WRITE = process.argv.includes("--write");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString();
const jsonl = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const recoveries = jsonl("app/public/data/mlb/corrections/pregame-forecast-recoveries.jsonl");
const graded = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl");
const gradedBy = new Map();
for (const g of graded) gradedBy.set(`${g.date}|${g.gamePk}`, [...(gradedBy.get(`${g.date}|${g.gamePk}`) ?? []), g]);

function snapshotRow(source, gamePk) {
  const m = /^snapshot:(.+)$/.exec(source ?? "");
  if (!m) return null;
  const p = path.join(ROOT, "data/internal/mlb/prediction-snapshots", m[1]);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).predictions?.find((x) => x.gamePk === gamePk) ?? null;
}
const brief = (rows) => rows.map((r) => ({ market: r.market, pick: r.pick, modelProbability: r.modelProbability, outcome: r.outcome }))
  .sort((a, b) => a.market.localeCompare(b.market));

const records = [];
for (const rec of recoveries) {
  if (rec.class !== "PUBLISHED_VERIFIED") continue;
  const rows = gradedBy.get(rec.key);
  if (!rows?.length) continue;
  const gradedPred = snapshotRow(rows[0].forecastSource, rec.gamePk);
  if (!gradedPred || gradedPred.artifactHash === rec.original.artifactHash) continue; // graded = the public forecast
  const publicPred = JSON.parse(git("show", `${rec.original.commit}:app/public/data/mlb/predictions/${rec.date}.json`))
    .predictions.find((p) => p.gamePk === rec.gamePk);
  const final = { isFinal: true, homeRuns: rows[0].actual.homeRuns, awayRuns: rows[0].actual.awayRuns };
  const publicGraded = gradeGameFamilies({
    row: publicPred, final,
    revision: { generatedAt: rec.original.fileGeneratedAt, source: `git:${rec.original.commit.slice(0, 10)}` },
    firstPitchUtc: rec.firstPitchUtc,
  });
  const g = brief(rows), p = brief(publicGraded);
  const outcomeChanges = p.filter((x) => (g.find((y) => y.market === x.market)?.outcome ?? null) !== x.outcome).map((x) => x.market);
  records.push({
    schema: "gtp.mlb.forecast-of-record-correction@1",
    key: rec.key, date: rec.date, gamePk: rec.gamePk, matchup: rec.matchup, firstPitchUtc: rec.firstPitchUtc,
    reasonCode: "GRADED_FORECAST_NOT_PUBLISHED_BEFORE_START",
    reason: "The graded forecast was generated before first pitch but no Production deployment served it before first pitch; the founder's forecast-of-record policy (Option B, 2026-10-09) requires verifiable publication.",
    status: "PROPOSED_NOT_APPLIED",
    gradedForecast: {
      source: rows[0].forecastSource, generatedAt: rows[0].forecastGeneratedAt, artifactHash: gradedPred.artifactHash,
      decisionEngineVersion: gradedPred.decisionEngineVersion ?? null, publicationEvidence: null, grades: g,
    },
    publicForecastOfRecord: {
      commit: rec.original.commit, committedAt: rec.original.committedAt, generatedAt: rec.original.fileGeneratedAt,
      artifactHash: rec.original.artifactHash, modelVersion: rec.original.values?.modelVersion ?? null,
      decisionEngineVersion: publicPred.decisionEngineVersion ?? null,
      publication: rec.publication, grades: p,
    },
    resultsEffectIfApplied: {
      picksChanged: p.some((x) => (g.find((y) => y.market === x.market)?.pick ?? null) !== x.pick),
      outcomeChangedMarkets: outcomeChanges,
      note: outcomeChanges.length
        ? "Win/loss counts for the listed markets would change; probability scores change for every market."
        : "Same picks and outcomes; only the stated probabilities (Brier / log loss) change.",
    },
  });
}
records.sort((a, b) => a.key.localeCompare(b.key));

const OUT = path.join(ROOT, "app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl");
const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean) : [];
const byKey = new Map(existing.map((l) => [JSON.parse(l).key, l]));
const appended = [];
for (const r of records) {
  const line = JSON.stringify(r);
  if (byKey.has(r.key) && byKey.get(r.key) !== line) { console.error(`IMMUTABLE RECORD WOULD CHANGE: ${r.key}`); process.exit(4); }
  if (!byKey.has(r.key)) appended.push(line);
}
console.log(`${records.length} graded games whose graded forecast was not the publicly served one · picks changed in ${records.filter((r) => r.resultsEffectIfApplied.picksChanged).length} · outcomes changed in ${records.filter((r) => r.resultsEffectIfApplied.outcomeChangedMarkets.length).length} · new lines ${appended.length}`);
if (WRITE && appended.length) { fs.appendFileSync(OUT, appended.map((l) => `${l}\n`).join("")); console.log(`appended → ${path.relative(ROOT, OUT)}`); }
else if (!WRITE) console.log("(dry run — pass --write to append)");
