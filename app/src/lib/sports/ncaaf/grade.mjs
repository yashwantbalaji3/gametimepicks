/**
 * NCAAF-006 grading of forward SHADOW receipts. PRIVATE_RESEARCH.
 *
 * One grade per event, against its FORECAST OF RECORD (forward.mjs forecastOfRecord) only — never against a
 * later receipt, never against a re-run model. Settlement comes only from the provider's official status:
 *
 *   STATUS_FINAL (played)         → SETTLED   with measurements
 *   STATUS_FORFEIT                → VOID      (administrative result; no measurement)
 *   STATUS_CANCELED               → VOID
 *   STATUS_POSTPONED / scheduled / in progress / unknown → PENDING (never a loss, never measured)
 *
 * Grade log is APPEND-ONLY per event: `appendGrade(log, grade)` returns the log unchanged when the new grade is
 * identical in substance (idempotent re-run), appends a new version with `corrections + 1` when the official
 * outcome changed, and refuses to move a decided grade back to PENDING.
 *
 * Market numbers are a BENCHMARK recorded at capture time (de-vigged moneyline P(home), cover / over results
 * against the captured line). They never become the model's probability.
 */
import { brier, logLoss, normalCrps, inCentral80 } from "./metrics.mjs";

export const GRADE_SCHEMA_VERSION = "ncaaf-grade@1";

const settlementState = (statusRaw, resultType) => {
  if (resultType === "PLAYED_FINAL") return "SETTLED";
  if (statusRaw === "STATUS_FORFEIT" || statusRaw === "STATUS_CANCELED") return "VOID";
  return "PENDING";
};

/** Exact CRPS of an integer-valued distribution given as a histogram { value: count }. */
export function crpsHistogram(hist, x) {
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const n = keys.reduce((s, k) => s + hist[k], 0);
  const m = new Map(keys.map((k) => [k, hist[k]]));
  let F = 0, s = 0;
  for (let z = Math.min(keys[0], x); z <= Math.max(keys.at(-1), x); z++) { F += (m.get(z) ?? 0) / n; s += (F - (z >= x ? 1 : 0)) ** 2; }
  return s;
}

/** Proportional de-vig of two American moneylines → implied P(home), or null. */
export function devigHome(homeMl, awayMl) {
  const imp = (ml) => (ml == null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
  const h = imp(homeMl), a = imp(awayMl);
  return h == null || a == null ? null : h / (h + a);
}

/**
 * Grade one event. `receipt` = forecast of record (or null), `result` = the provider's normalised event at
 * grading time (espn-events row), `gradedAt` ISO, `sourceCapturedAt` ISO of the result snapshot.
 */
export function gradeEvent({ receipt, result, gradedAt, sourceCapturedAt }) {
  if (!receipt) return null;
  const state = result ? settlementState(result.statusRaw, result.resultType) : "PENDING";
  const base = {
    schemaVersion: GRADE_SCHEMA_VERSION,
    eventId: receipt.event.eventId,
    forecastOfRecord: { capturedAt: receipt.capturedAt, codeCommit: receipt.code.commit, startUtcAtCapture: receipt.event.startUtcAtCapture },
    settlement: { state, statusRaw: result?.statusRaw ?? null, finalHome: null, finalAway: null, overtimePeriods: null, source: "ESPN scoreboard", sourceCapturedAt, gradedAt },
    measurement: null,
    marketBenchmark: null,
  };
  if (state !== "SETTLED") return base;
  const h = result.home.score, a = result.away.score;
  if (!Number.isInteger(h) || !Number.isInteger(a)) return { ...base, settlement: { ...base.settlement, state: "NO_MEASUREMENT", reason: "FINAL_WITHOUT_SCORES" } };
  const y = h > a ? 1 : 0, margin = h - a, total = h + a;
  const f = receipt.forecast;
  const w = f.worlds && !f.worlds.refused ? f.worlds : null;
  const measurement = {
    winnerC1: { p: f.winner.pHome, logLoss: logLoss(f.winner.pHome, y), brier: brier(f.winner.pHome, y) },
    winnerC2: { p: f.score.pHome, logLoss: logLoss(f.score.pHome, y), brier: brier(f.score.pHome, y) },
    scoreC2: {
      marginError: f.score.marginMean - margin, totalError: f.score.totalMean - total,
      marginCrps: normalCrps(f.score.marginMean, f.score.marginSd, margin), totalCrps: normalCrps(f.score.totalMean, f.score.totalSd, total),
      marginIn80: inCentral80(f.score.marginMean, f.score.marginSd, margin), totalIn80: inCentral80(f.score.totalMean, f.score.totalSd, total),
    },
    worlds: w && {
      p: w.pHome, logLoss: logLoss(w.pHome, y),
      marginCrps: crpsHistogram(w.marginHistogram, margin), totalCrps: crpsHistogram(w.totalHistogram, total),
      marginIn80: margin >= w.marginPercentiles.p10 && margin <= w.marginPercentiles.p90,
      totalIn80: total >= w.totalPercentiles.p10 && total <= w.totalPercentiles.p90,
    },
  };
  const mk = receipt.market;
  const cover = (line) => (line == null ? null : margin + line > 0 ? "HOME_COVERED" : margin + line < 0 ? "AWAY_COVERED" : "PUSH");
  const ou = (line) => (line == null ? null : total > line ? "OVER" : total < line ? "UNDER" : "PUSH");
  const marketBenchmark = mk && {
    provider: mk.provider, capturedAt: mk.capturedAt,
    devigPHome: devigHome(mk.homeMoneyline, mk.awayMoneyline),
    devigLogLoss: devigHome(mk.homeMoneyline, mk.awayMoneyline) == null ? null : logLoss(devigHome(mk.homeMoneyline, mk.awayMoneyline), y),
    homeSpread: mk.homeSpread, spreadResult: cover(mk.homeSpread),
    overUnder: mk.overUnder, totalResult: ou(mk.overUnder),
  };
  return {
    ...base,
    settlement: { ...base.settlement, finalHome: h, finalAway: a, overtimePeriods: result.overtimePeriods },
    measurement,
    marketBenchmark,
  };
}

/** Substance of a grade for idempotency (timestamps of the grading run itself excluded). */
const substance = (g) => JSON.stringify({ ...g, version: undefined, corrections: undefined, settlement: { ...g.settlement, gradedAt: undefined, sourceCapturedAt: undefined } });

/** Append-only per-event log. Returns { log, action } with action NOOP | APPEND | CORRECTION, or throws. */
export function appendGrade(log, grade) {
  const last = log.at(-1);
  if (!last) return { log: [{ ...grade, version: 1, corrections: 0 }], action: "APPEND" };
  if (substance(last) === substance(grade)) return { log, action: "NOOP" };
  if (last.settlement.state !== "PENDING" && grade.settlement.state === "PENDING") {
    throw new Error(`${grade.eventId}: refusing to revert a ${last.settlement.state} grade to PENDING`);
  }
  if (last.forecastOfRecord.capturedAt !== grade.forecastOfRecord.capturedAt) {
    throw new Error(`${grade.eventId}: forecast of record changed after grading (${last.forecastOfRecord.capturedAt} → ${grade.forecastOfRecord.capturedAt})`);
  }
  const corrections = last.settlement.state === "PENDING" ? last.corrections : last.corrections + 1;
  return { log: [...log, { ...grade, version: last.version + 1, corrections }], action: last.settlement.state === "PENDING" ? "APPEND" : "CORRECTION" };
}
