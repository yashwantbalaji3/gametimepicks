/**
 * EPL DERIVED-MARKET GRADING (Block A · Forecast Truth) — the settlement owner for the published match markets that
 * had none: BOTH TEAMS TO SCORE, CLEAN SHEET (each side) and the CORRECT-SCORE table. Pure: no fs, no clock.
 *
 * WHAT IS GRADED, AND AGAINST WHAT. Nothing new is predicted and nothing is re-derived. The 1X2 owner
 * (grade-epl-forecasts.mjs → graded-forecasts.jsonl) has already chosen each match's forecast of record — the latest
 * CURRENT_PRE_EVENT row generated before kickoff — and recorded the official full-time score. This owner re-opens
 * EXACTLY that forecast (same event, same generatedAt) and reads the other numbers the same row published beside the
 * 1X2: `model.btts`, `model.cleanSheet`, `model.topScorelines`. The 1X2 probabilities on the re-opened row must equal
 * the ones the 1X2 owner graded, to the last digit — that is the proof it is the same forecast, not a later revision.
 *
 * THREE REFUSALS, EACH A WAY THIS COULD QUIETLY LIE:
 *   1. NOT PUBLIC THEN. These markets reached the public artifact on 2026-08-21T00:59:55Z (581b84c). A forecast
 *      generated before that published only 1X2 / over 2.5, so its BTTS was never shown and is not graded.
 *   2. NOT THE FORECAST OF RECORD. No candidate with the graded generatedAt + identical 1X2 → UNRECOVERED (counted,
 *      never approximated from another revision, never rebuilt from the final score).
 *   3. NOT FINAL. Only rows the 1X2 owner settled FULL_TIME with integer goals are graded.
 *
 * DOUBLE CHANCE IS DELIBERATELY NOT HERE. Each double-chance number is exactly 1 − one 1X2 class (the producer guards
 * that identity), so its scores are the per-class terms of the 1X2 multiclass Brier already in the ledger. A second
 * set of rows would count the same forecast twice — the ledger's own rule is one observation however it is rendered.
 */
import { publishedModel } from "./published-forecast.mjs";

export const EPL_DERIVED_GRADING_VERSION = 1;
/** The commit that first copied btts / cleanSheet / doubleChance / topScorelines into the PUBLIC forecast rows. */
export const EPL_DERIVED_PUBLIC_SINCE = "2026-08-21T00:59:55Z";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sameInstant = (a, b) => Number.isFinite(Date.parse(a ?? "")) && Date.parse(a) === Date.parse(b ?? "");

function probsEqual(a, b) {
  return !!a && !!b && ["home", "draw", "away"].every((k) => isNum(a[k]) && a[k] === b[k]);
}

/** Source preference: an immutable snapshot, then a dated file that still holds that revision, then git history. */
function sourceRank(source) {
  if (/^forecasts\/snapshot-\d{12}\.json$/.test(source)) return 0;
  if (/^forecasts\/\d{4}-\d{2}-\d{2}\.json$/.test(source)) return 1;
  return 2;
}

/**
 * Find the forecast of record the 1X2 owner graded.
 * @param {object} graded  a graded-forecasts.jsonl row
 * @param {Array<{ source: string, generatedAt: string, rows: object[] }>} artifacts  candidate forecast artifacts
 * @returns {{ row: object, source: string } | null}
 */
export function locateForecastOfRecord(graded, artifacts) {
  const hits = [];
  for (const art of artifacts ?? []) {
    if (!sameInstant(art.generatedAt, graded.forecastGeneratedAt)) continue;
    for (const row of art.rows ?? []) {
      if (row.eventId !== graded.eventId) continue;
      const pub = publishedModel(row);                     // the same rule the 1X2 grader used to pick it
      if (!pub || !probsEqual(pub.model.probs, graded.forecast?.probs)) continue;
      hits.push({ row, model: pub.model, source: art.source });
    }
  }
  hits.sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  return hits[0] ?? null;
}

/** The published derived block, validated. Returns null (with a reason) rather than a half-forecast. */
export function derivedForecast(model) {
  const btts = model?.btts?.yes;
  const csH = model?.cleanSheet?.home;
  const csA = model?.cleanSheet?.away;
  const top = Array.isArray(model?.topScorelines) ? model.topScorelines : null;
  if (!isNum(btts) || !isNum(csH) || !isNum(csA)) return { forecast: null, reason: "DERIVED_FIELDS_ABSENT" };
  if (!top || top.length === 0) return { forecast: null, reason: "SCORELINES_ABSENT" };
  const seen = new Set();
  for (const s of top) {
    if (!/^\d+-\d+$/.test(String(s?.score)) || !isNum(s?.p) || s.p < 0 || seen.has(s.score)) return { forecast: null, reason: "SCORELINES_MALFORMED" };
    seen.add(s.score);
  }
  const listedMass = top.reduce((a, s) => a + s.p, 0);
  if (!(listedMass > 0 && listedMass <= 1 + 1e-6)) return { forecast: null, reason: "SCORELINES_MASS_INVALID" };
  return {
    forecast: {
      btts: { yes: btts },
      cleanSheet: { home: csH, away: csA },
      topScorelines: top.map((s) => ({ score: s.score, p: s.p })),
      topScorelinesMass: isNum(model.topScorelinesMass) ? model.topScorelinesMass : null,
    },
    reason: null,
  };
}

/**
 * Grade one match. `located` is locateForecastOfRecord's result. Returns { row } or { refused: reason }.
 * The outcome words come from the official full-time score the 1X2 owner already recorded — never re-fetched here.
 */
export function gradeDerivedMarkets(graded, located) {
  if (!graded?.eventId) return { refused: "NO_EVENT_ID" };
  if (graded.status !== "FULL_TIME") return { refused: "NOT_FULL_TIME" };
  const h = graded.actual?.homeGoalsFT;
  const a = graded.actual?.awayGoalsFT;
  if (!Number.isInteger(h) || !Number.isInteger(a)) return { refused: "NO_FINAL_SCORE" };
  if (!(Date.parse(graded.forecastGeneratedAt ?? "") >= Date.parse(EPL_DERIVED_PUBLIC_SINCE))) return { refused: "NOT_PUBLIC_AT_FORECAST_TIME" };
  if (!(Date.parse(graded.forecastGeneratedAt) < Date.parse(graded.kickoffUtc ?? ""))) return { refused: "FORECAST_NOT_PRE_KICKOFF" };
  if (!located) return { refused: "FORECAST_OF_RECORD_UNRECOVERED" };
  const { forecast, reason } = derivedForecast(located.model ?? located.row.model);
  if (!forecast) return { refused: reason };
  const score = `${h}-${a}`;
  return {
    row: {
      schemaVersion: 1,
      gradingVersion: EPL_DERIVED_GRADING_VERSION,
      eventId: graded.eventId,
      matchup: graded.matchup ?? null,
      homeClub: located.row.homeClub ?? null,
      awayClub: located.row.awayClub ?? null,
      kickoffUtc: graded.kickoffUtc,
      modelId: graded.modelId ?? (located.model ?? located.row.model)?.modelId ?? null,
      /* The 1X2 owner's pointer, and where this owner actually re-opened that same revision. */
      forecastGeneratedAt: graded.forecastGeneratedAt,
      forecastSource: graded.forecastSource ?? null,
      recoveredFrom: located.source,
      status: graded.status,
      resultSource: graded.resultSource ?? null,
      actual: { homeGoalsFT: h, awayGoalsFT: a, score },
      forecast,
      outcomes: {
        btts: h > 0 && a > 0,
        homeCleanSheet: a === 0,
        awayCleanSheet: h === 0,
        /* The listed score, or OTHER — the published table's own remainder. */
        scorelineClass: forecast.topScorelines.some((s) => s.score === score) ? score : "OTHER",
      },
      gradedAt: graded.gradedAt ?? null,
    },
  };
}
