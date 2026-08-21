#!/usr/bin/env node
/**
 * GRADE EPL FORECASTS — join each PRE-KICKOFF forecast to the OFFICIAL result and record the hit or
 * the miss. This is the missing link in the EPL chain.
 *
 *   node scripts/epl/grade-epl-forecasts.mjs [--write]
 *
 * The chain already published forecasts and already captured results. Nothing joined them, so no EPL
 * prediction had ever been scored against what actually happened — which is the difference between a
 * model that improves from its own record and one that merely keeps producing numbers.
 *
 * FIVE RULES, EACH FROM A DEFECT THIS REPO HAS ALREADY PAID FOR:
 *
 *  1. APPEND-ONLY, AND A GRADED ROW IS IMMUTABLE. This runs daily against a CUMULATIVE record, and a
 *     daily job that rewrites a cumulative record is how two ledgers were wiped in one day. Existing
 *     eventIds are skipped, never recomputed; the file is only ever appended to.
 *
 *  2. OFFICIAL AND FINAL ONLY. A fixture grades from a FULL_TIME official result or not at all.
 *     Postponed, abandoned, suspended and in-play quarantine instead of guessing — the StatsAPI
 *     lesson that "Final" strings without scores lie.
 *
 *  3. THE FORECAST MUST PRE-DATE THE KICKOFF, re-checked HERE. Generation already refuses at/after
 *     kickoff, but a grader that trusts an upstream gate is one refactor away from scoring a
 *     forecast made with the result in hand. A row that fails this is refused, not discounted.
 *
 *  4. THE FORECAST OF RECORD IS THE LATEST PRE-KICKOFF ONE. Several forecast files may cover one
 *     fixture as the matchweek approaches; the graded row uses the newest that still pre-dates the
 *     kickoff, and records which file it came from.
 *
 *  5. NO MONEY, EVER. This writes a model-performance record only. It touches no bankroll, no
 *     portfolio and no settled-money ledger, and EPL remains a paper-free sport.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeEplLeg } from "../../src/lib/sports/epl/settlement-contract.mjs";
import { loadCurrentEplResults } from "../../src/lib/soccer/epl-current-results.mjs";
import { classifyEmptyRun } from "../../src/lib/sports/epl/grade-forecasts.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RESEARCH = path.join(REPO, "data/internal/research/epl");
const PUBLIC_EPL = path.join(APP, "public/data/soccer/epl");
const LEDGER = path.join(PUBLIC_EPL, "results/graded-forecasts.jsonl");

const WRITE = process.argv.includes("--write");
const NOW_ISO = (() => { const i = process.argv.indexOf("--now"); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : new Date().toISOString(); })();
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/* ── Inputs ──────────────────────────────────────────────────────────────────────────────────── */
const resultsPath = path.join(PUBLIC_EPL, "results/latest.json");
if (!fs.existsSync(resultsPath)) { console.error("no results capture — nothing to grade"); process.exit(2); }
const results = readJson(resultsPath);

/*
 * RESULTS COME THROUGH THE LANE'S OWN IDENTITY BRIDGE, not from the raw artifact.
 *
 * This script used to read results/latest.json directly and look for `eventId` and `status` on each
 * row. Neither exists there: the ESPN capture writes `providerEventId` and `statusRaw`, and carries
 * no canonical identity at all. So every finished fixture fell through the join silently and the
 * first real settlement — Arsenal 3-0 Coventry — graded nothing.
 *
 * loadCurrentEplResults already did this properly and had done since P154: it joins each result to
 * the committed fixture capture through identityFromFixture, the SAME function both sides use, and
 * quarantines anything that cannot resolve. I duplicated a capability that existed, and did it worse.
 */
const bridged = loadCurrentEplResults({ nowIso: NOW_ISO });
if (bridged.quarantined.length > 0) {
  console.log(`  ${bridged.quarantined.length} result(s) quarantined by identity: ${bridged.quarantined.map((q) => q.reason).join("; ").slice(0, 200)}`);
}

const forecastDir = path.join(RESEARCH, "forecasts");
const forecastFiles = fs.readdirSync(forecastDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (forecastFiles.length === 0) { console.error("no dated forecast artifacts — nothing to grade"); process.exit(2); }

/*
 * Rule 4: index every dated forecast by fixture, keeping the LATEST that still pre-dates kickoff.
 * `latest.json` is deliberately not read — it is a moving pointer, and the graded record must cite a
 * file whose contents cannot change under it.
 */
const forecastByEvent = new Map();
for (const file of forecastFiles) {
  const art = readJson(path.join(forecastDir, file));
  const generatedAt = Date.parse(art.generatedAt ?? "");
  for (const row of art.rows ?? []) {
    if (row.state !== "CURRENT_PRE_EVENT" || !row.model?.probs) continue;
    const kickoff = Date.parse(row.kickoffUtc ?? "");
    if (!Number.isFinite(kickoff) || !Number.isFinite(generatedAt)) continue;
    if (generatedAt >= kickoff) continue;                                    // rule 3
    const prev = forecastByEvent.get(row.eventId);
    if (!prev || generatedAt > prev.generatedAt) {
      forecastByEvent.set(row.eventId, { row, generatedAt, sourceFile: `forecasts/${file}` });
    }
  }
}

/** Already-graded fixtures. Rule 1: these are never recomputed. */
const alreadyGraded = new Set();
if (fs.existsSync(LEDGER)) {
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { alreadyGraded.add(JSON.parse(line).eventId); } catch { /* a malformed line is not a grade */ }
  }
}

/* ── Join ────────────────────────────────────────────────────────────────────────────────────── */
const STATUS_MAP = { FT: "FULL_TIME", FULL_TIME: "FULL_TIME", POSTPONED: "POSTPONED", ABANDONED: "ABANDONED", SUSPENDED: "SUSPENDED", IN_PLAY: "IN_PLAY", NOT_STARTED: "NOT_STARTED" };
const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));

const graded = [];
const skipped = { alreadyGraded: 0, noForecast: 0, notFinal: 0, noResultRow: 0 };

for (const r of bridged.results) {
  const eventId = r.canonicalEventId;
  if (!eventId) continue;
  if (alreadyGraded.has(eventId)) { skipped.alreadyGraded += 1; continue; }

  const fc = forecastByEvent.get(eventId);
  if (!fc) { skipped.noForecast += 1; continue; }

  /* The bridge has already applied the FULL_TIME contract; this reads its verdict, never re-derives it. */
  const status = r.settlementResult?.status ?? "NOT_STARTED";
  const homeGoalsFT = Number.isInteger(r.settlementResult?.homeGoalsFT) ? r.settlementResult.homeGoalsFT : null;
  const awayGoalsFT = Number.isInteger(r.settlementResult?.awayGoalsFT) ? r.settlementResult.awayGoalsFT : null;

  /* Rule 2, delegated to the committed contract rather than re-decided here. */
  const official = { fixtureId: eventId, status, homeGoalsFT, awayGoalsFT };
  const probe = gradeEplLeg({ market: "match_result", side: "home" }, official);
  if (probe.outcome === "VOID_PENDING_REVIEW") { skipped.notFinal += 1; continue; }
  if (homeGoalsFT == null || awayGoalsFT == null) { skipped.noResultRow += 1; continue; }

  const p = fc.row.model.probs;
  const actual = homeGoalsFT > awayGoalsFT ? "H" : homeGoalsFT === awayGoalsFT ? "D" : "A";
  const total = homeGoalsFT + awayGoalsFT;
  const pActual = actual === "H" ? p.home : actual === "D" ? p.draw : p.away;
  const predicted = p.home >= p.draw && p.home >= p.away ? "H" : p.draw >= p.away ? "D" : "A";

  const over25 = fc.row.model.totals?.over25 ?? null;
  const overHit = total >= 3;

  graded.push({
    schemaVersion: 1,
    eventId,
    matchup: fc.row.matchup,
    kickoffUtc: fc.row.kickoffUtc,
    /* Provenance of the prediction being scored — file and stamp, so a row can be re-derived. */
    forecastGeneratedAt: fc.row.generatedAtOverride ?? new Date(fc.generatedAt).toISOString(),
    forecastSource: fc.sourceFile,
    modelId: fc.row.model.modelId ?? null,
    resultSource: results.source?.id ?? null,
    resultAsOf: results.sourceAsOf ?? null,
    status,
    actual: { homeGoalsFT, awayGoalsFT, outcome: actual, totalGoals: total },
    forecast: { probs: p, over25, expectedGoals: fc.row.model.totals?.expected ?? null },
    /* The scores. Proper metrics only — no "confidence", no grade, no pick. */
    scores: {
      hit: predicted === actual,
      predictedOutcome: predicted,
      probabilityOfActual: Number(pActual.toFixed(6)),
      logLoss: Number((-Math.log(clip(pActual))).toFixed(6)),
      /* Multiclass Brier over the three-way outcome. */
      brier: Number((["H", "D", "A"].reduce((s, o) => {
        const q = o === "H" ? p.home : o === "D" ? p.draw : p.away;
        return s + (q - (o === actual ? 1 : 0)) ** 2;
      }, 0)).toFixed(6)),
      over25: over25 == null ? null : {
        modelProbOver: over25,
        observedOver: overHit,
        brier: Number(((over25 - (overHit ? 1 : 0)) ** 2).toFixed(6)),
      },
    },
    gradedAt: new Date(results.sourceAsOf ?? results.generatedAt).toISOString(),
  });
}

/* ── Report ──────────────────────────────────────────────────────────────────────────────────── */
console.log(`\nEPL forecast grading`);
console.log(`  results capture: state=${results.state} rows=${results.rowCount} completed=${results.completedCount} asOf=${results.sourceAsOf}`);
console.log(`  forecasts indexed: ${forecastByEvent.size} fixture(s) across ${forecastFiles.length} dated file(s)`);
console.log(`  already graded:   ${alreadyGraded.size}`);
console.log(`  NEWLY GRADED:     ${graded.length}`);
console.log(`  skipped: ${JSON.stringify(skipped)}`);

for (const g of graded) {
  /* g.scores.hit, not g.hit — the flag lives under scores, and reading the wrong path printed MISS
     against a 3-0 home win the model had called at 69%. The ledger was right; the operator's view
     of it was not, which is its own kind of wrong. */
  console.log(`    ${g.scores.hit ? "HIT " : "MISS"} ${g.matchup.padEnd(38)} ${g.actual.homeGoalsFT}-${g.actual.awayGoalsFT} ` +
    `(${g.actual.outcome}) p=${g.scores.probabilityOfActual.toFixed(3)} logLoss=${g.scores.logLoss.toFixed(3)}`);
}

if (graded.length === 0) {
  /*
   * AN EMPTY RUN IS A STATE, AND WHICH ONE MATTERS. Before the season starts, nothing to grade is
   * correct. After it starts, nothing to grade means the join is broken — and those two must never
   * print the same sentence, because that is how a permanently broken loop reads as a healthy one.
   */
  /*
   * The script had its OWN inline version of this and it forgot the case that happens most: every
   * finished fixture already recorded. It reported a BROKEN JOIN on the second run of the day, which
   * would have failed epl-settle every night after the first grading — the same cry-wolf shape as
   * nightly-settle's duplicate cron and the odds dedup refusal.
   *
   * classifyEmptyRun already handled all four states and is used by the player grader. One
   * classifier, both graders.
   */
  const state = classifyEmptyRun({
    results,
    gradedCount: 0,
    alreadyGradedCount: alreadyGraded.size,
  });
  const say = {
    PRESEASON: `the season starts ${results.seasonStart}. Nothing to grade is the correct answer today.`,
    NO_COMPLETED_FIXTURES: `the capture reports ${results.rowCount} row(s), none final.`,
    NOTHING_NEW: "every completed fixture is already in the ledger.",
  }[state];
  if (say) {
    console.log(`\n  ${state} — ${say}`);
  } else {
    console.error(`\n  REFUSED — ${results.completedCount} fixture(s) are complete and NONE could be graded.`);
    console.error(`  That is a broken join, not an empty slate. Check eventId agreement between the results`);
    console.error(`  capture and the forecast artifacts before trusting any calibration built on this.`);
    process.exit(3);
  }
}

if (WRITE && graded.length > 0) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(LEDGER, graded.map((g) => JSON.stringify(g)).join("\n") + "\n");
  console.log(`\nappended ${graded.length} row(s) to ${path.relative(APP, LEDGER)}`);
} else if (!WRITE) {
  console.log(`\ndry run — pass --write to append.`);
}
