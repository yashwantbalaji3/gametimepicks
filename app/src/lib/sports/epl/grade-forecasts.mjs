/**
 * EPL forecast grading — the PURE join from a pre-kickoff forecast to an official result.
 *
 * Extracted from the script so the rules can be exercised against fixtures rather than first run for
 * real on a matchday. Every rule below encodes a defect this repo has already paid for once; a rule
 * that only exists inside a script that has never run is not a rule, it is an intention.
 *
 * No fs, no clock, no network — the caller supplies the artifacts and the current time.
 */
import { gradeEplLeg } from "./settlement-contract.mjs";

export const EPL_GRADING_VERSION = 1;

/** Provider status strings mapped onto the committed contract's vocabulary. Unknown ⇒ NOT_STARTED. */
const STATUS_MAP = Object.freeze({
  FT: "FULL_TIME", FULL_TIME: "FULL_TIME", FINAL: "FULL_TIME",
  POSTPONED: "POSTPONED", ABANDONED: "ABANDONED", SUSPENDED: "SUSPENDED",
  IN_PLAY: "IN_PLAY", LIVE: "IN_PLAY", NOT_STARTED: "NOT_STARTED", SCHEDULED: "NOT_STARTED",
});

const clip = (p) => Math.min(1 - 1e-15, Math.max(1e-15, p));
const r6 = (v) => Number(v.toFixed(6));

/**
 * Index dated forecast artifacts by fixture, keeping the LATEST forecast that still PRE-DATES the
 * kickoff — the forecast of record. Artifacts generated at or after kickoff are dropped here, so a
 * post-hoc forecast cannot reach the ledger even if one were somehow produced.
 *
 * @param {Array<{ file: string, generatedAt: string, rows: Array<object> }>} artifacts
 */
export function indexForecasts(artifacts) {
  const byEvent = new Map();
  const refused = [];
  for (const art of artifacts ?? []) {
    const generatedAt = Date.parse(art.generatedAt ?? "");
    if (!Number.isFinite(generatedAt)) { refused.push({ file: art.file, reason: "unparseable generatedAt" }); continue; }
    for (const row of art.rows ?? []) {
      if (row.state !== "CURRENT_PRE_EVENT" || !row.model?.probs) continue;
      const kickoff = Date.parse(row.kickoffUtc ?? "");
      if (!Number.isFinite(kickoff)) { refused.push({ eventId: row.eventId, reason: "unparseable kickoff" }); continue; }
      if (generatedAt >= kickoff) {
        refused.push({ eventId: row.eventId, file: art.file, reason: "forecast generated at/after kickoff" });
        continue;
      }
      const prev = byEvent.get(row.eventId);
      if (!prev || generatedAt > prev.generatedAt) {
        byEvent.set(row.eventId, { row, generatedAt, sourceFile: art.file });
      }
    }
  }
  return { byEvent, refused };
}

/**
 * Grade every completed fixture that has a forecast of record and is not already in the ledger.
 *
 * @param {{ forecasts: Map, results: object, alreadyGraded: Set<string> }} input
 * @returns {{ graded: Array<object>, skipped: object }}
 */
export function buildGradedRows({ forecasts, results, alreadyGraded = new Set() }) {
  const graded = [];
  const skipped = { alreadyGraded: 0, noForecast: 0, notFinal: 0, missingScores: 0 };

  for (const r of results?.rows ?? []) {
    const eventId = r.eventId ?? r.canonicalEventId;
    if (!eventId) continue;
    if (alreadyGraded.has(eventId)) { skipped.alreadyGraded += 1; continue; }

    const fc = forecasts.get(eventId);
    if (!fc) { skipped.noForecast += 1; continue; }

    const status = STATUS_MAP[String(r.status ?? "").toUpperCase()] ?? "NOT_STARTED";
    const homeGoalsFT = Number.isInteger(r.homeGoalsFT) ? r.homeGoalsFT : (Number.isInteger(r.ftHome) ? r.ftHome : null);
    const awayGoalsFT = Number.isInteger(r.awayGoalsFT) ? r.awayGoalsFT : (Number.isInteger(r.ftAway) ? r.ftAway : null);

    /*
     * The FINAL gate is delegated to the committed settlement contract rather than re-decided here.
     * Anything it will not grade — postponed, abandoned, suspended, in-play — quarantines, because a
     * provider reporting "Final" without scores is a case this codebase has already been burned by.
     *
     * The probe's side must be a VALID one ("home", not "HOME"). The contract returns
     * VOID_PENDING_REVIEW both for an un-gradeable result AND for an unrecognised side, so a typo
     * there reads as "this match cannot be graded" and silently grades nothing — which is exactly
     * what it did on this file's first run. A guard pins it so it cannot rot back.
     */
    const probe = gradeEplLeg({ market: "match_result", side: "home" }, { fixtureId: eventId, status, homeGoalsFT, awayGoalsFT });
    if (probe.outcome === "VOID_PENDING_REVIEW") { skipped.notFinal += 1; continue; }
    if (homeGoalsFT == null || awayGoalsFT == null) { skipped.missingScores += 1; continue; }

    const p = fc.row.model.probs;
    const actual = homeGoalsFT > awayGoalsFT ? "H" : homeGoalsFT === awayGoalsFT ? "D" : "A";
    const total = homeGoalsFT + awayGoalsFT;
    const pActual = actual === "H" ? p.home : actual === "D" ? p.draw : p.away;
    const predicted = p.home >= p.draw && p.home >= p.away ? "H" : p.draw >= p.away ? "D" : "A";
    const over25 = fc.row.model.totals?.over25 ?? null;
    const overHit = total >= 3;

    graded.push({
      schemaVersion: 1,
      gradingVersion: EPL_GRADING_VERSION,
      eventId,
      matchup: fc.row.matchup,
      kickoffUtc: fc.row.kickoffUtc,
      forecastGeneratedAt: new Date(fc.generatedAt).toISOString(),
      forecastSource: fc.sourceFile,
      modelId: fc.row.model.modelId ?? null,
      resultSource: results?.source?.id ?? null,
      resultAsOf: results?.sourceAsOf ?? null,
      status,
      actual: { homeGoalsFT, awayGoalsFT, outcome: actual, totalGoals: total },
      forecast: { probs: p, over25, expectedGoals: fc.row.model.totals?.expected ?? null },
      scores: {
        hit: predicted === actual,
        predictedOutcome: predicted,
        probabilityOfActual: r6(pActual),
        logLoss: r6(-Math.log(clip(pActual))),
        brier: r6(["H", "D", "A"].reduce((s, o) => {
          const q = o === "H" ? p.home : o === "D" ? p.draw : p.away;
          return s + (q - (o === actual ? 1 : 0)) ** 2;
        }, 0)),
        over25: over25 == null ? null : { modelProbOver: over25, observedOver: overHit, brier: r6((over25 - (overHit ? 1 : 0)) ** 2) },
      },
    });
  }
  return { graded, skipped };
}

/**
 * Classify an empty grading run. The whole point is that "nothing to grade" has THREE causes and only
 * two of them are healthy — a preseason date, an in-season slate with nothing final yet, and a broken
 * join. Collapsing them into one reassuring sentence is how a permanently dead loop keeps reporting
 * that everything is fine, which is the failure mode this codebase has hit repeatedly.
 *
 * @returns {"PRESEASON"|"NO_COMPLETED_FIXTURES"|"NOTHING_NEW"|"BROKEN_JOIN"}
 */
export function classifyEmptyRun({ results, gradedCount, alreadyGradedCount = 0, unexplainedCount = undefined }) {
  if (gradedCount > 0) return "NOTHING_NEW";                       // not an empty run at all
  const asOf = Date.parse(results?.sourceAsOf ?? results?.generatedAt ?? "");
  const start = Date.parse(results?.seasonStart ?? "");
  if (Number.isFinite(start) && Number.isFinite(asOf) && asOf < start) return "PRESEASON";
  const completed = results?.completedCount ?? 0;
  if (completed === 0) return "NO_COMPLETED_FIXTURES";
  if (alreadyGradedCount >= completed) return "NOTHING_NEW";       // all of them are already recorded

  /*
   * A COMPLETED FIXTURE WE NEVER FORECAST IS ACCOUNTED FOR, NOT A BROKEN JOIN.
   *
   * `alreadyGradedCount >= completed` was the only way out, so a single fixture that can NEVER be
   * graded pinned this at BROKEN_JOIN permanently. On 2026-08-23 that is exactly what happened:
   * nine fixtures complete, eight already in the ledger, and one — Brighton v Aston Villa — that the
   * forecast artifact had openly declined because no three-way price was ever captured for it. The
   * job had been green the night before and will now fail every night forever, on a settlement path,
   * for a slate where nothing is wrong.
   *
   * The discriminator cannot simply be "we have no forecast for it", because that is ALSO what a
   * broken join looks like from in here — if eventIds stopped agreeing, every fixture would land in
   * the same bucket. What separates them is whether the join has demonstrably worked for anything:
   * a run that graded or had already graded at least one of these fixtures has a functioning join,
   * and the unmatched remainder are individually explained. A run where NOTHING matched, with
   * completed fixtures on the board, is the failure this exists to catch and still refuses.
   *
   * `unexplainedCount` lets a caller be stricter than that by checking each unmatched fixture
   * against the forecast artifact's own declared refusals. When it is supplied, it decides.
   */
  if (Number.isFinite(unexplainedCount)) {
    return unexplainedCount > 0 ? "BROKEN_JOIN" : "NOTHING_NEW";
  }
  if (alreadyGradedCount > 0) return "NOTHING_NEW";
  return "BROKEN_JOIN";
}

/**
 * Running performance over a graded ledger. Proper metrics only: no "confidence", no grade, no pick.
 * `n` is stated on every figure because a mean over four matches is not a track record and the number
 * that says so must travel with it.
 */
export function summariseGraded(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0, hitRate: null, logLoss: null, brier: null, over25Brier: null, byOutcome: null };
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const o25 = rows.filter((r) => r.scores?.over25);
  const byOutcome = {};
  for (const o of ["H", "D", "A"]) {
    const seen = rows.filter((r) => r.actual.outcome === o);
    byOutcome[o] = { observed: seen.length, meanPredicted: seen.length ? r6(sum((r) => (r.actual.outcome === o ? r.forecast.probs[o === "H" ? "home" : o === "D" ? "draw" : "away"] : 0)) / seen.length) : null };
  }
  return {
    n,
    hitRate: r6(sum((r) => (r.scores.hit ? 1 : 0)) / n),
    logLoss: r6(sum((r) => r.scores.logLoss) / n),
    brier: r6(sum((r) => r.scores.brier) / n),
    over25Brier: o25.length ? r6(o25.reduce((s, r) => s + r.scores.over25.brier, 0) / o25.length) : null,
    byOutcome,
  };
}
