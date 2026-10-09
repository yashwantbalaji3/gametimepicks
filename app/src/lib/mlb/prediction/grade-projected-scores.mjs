/**
 * MLB PROJECTED-SCORE GRADING (Block A · Forecast Truth) — the settlement owner for the two published simulation
 * medians that had none: the PROJECTED SCORE (`projectedScore.{away,home}`, labelled "Median simulation score" on the
 * game page) and the simulation-median TOTAL (`total.simulationMedian`). Pure: no fs, no clock, no git.
 *
 * NOTHING IS RE-CHOSEN. The game-prediction owner (grade-games.mjs → game-predictions-graded.jsonl) already picked
 * each game's forecast of record — the newest revision that pre-dates first pitch — and recorded its source
 * (`snapshot:<date>/<file>`, `git:<sha12>` or `dated-file:<date>`) and the official final. This owner re-opens THAT
 * revision and reads the medians from the same row. The revision must be the same one: same generatedAt, and every
 * probability the owner graded on that game (moneyline / total / run line) must be reproduced from the re-opened row
 * exactly. A revision that cannot be re-opened is UNRECOVERED — counted, never replaced by another revision and never
 * rebuilt from the final (the MLB historical-restoration question stays the founder's; this reads only what the owner
 * already graded).
 *
 * A median is a POINT projection, not a probability: it is measured by error (projection − actual), never W/L.
 */

export const MLB_PROJECTED_GRADING_VERSION = 1;

const isInt = Number.isInteger;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

/** What the owner's row says the revision published for its market — recomputed exactly as grade-games.mjs does. */
function ownerProbability(pred, market) {
  if (market === "moneyline") return r4(pred?.moneyline?.simulationProbability);
  if (market === "total") return r4(pred?.total?.pick === "OVER" ? pred.total.overProbability : pred?.total?.underProbability);
  if (market === "run_line" || market === "run_line_posted") return r4(pred?.runLine?.coverProbability);
  return undefined;
}

/**
 * @param {object[]} gameRows  the owner's graded rows for ONE gamePk (one per market, same forecast source)
 * @param {{ generatedAt: string, predictions: object[] } | null} revision  the re-opened artifact revision
 * @returns {{ row } | { refused }}
 */
export function gradeProjectedScore(gameRows, revision) {
  const g = gameRows?.[0];
  if (!g || !isInt(g.gamePk)) return { refused: "NO_GAME" };
  if (new Set(gameRows.map((r) => `${r.forecastSource}|${r.forecastGeneratedAt}`)).size !== 1) return { refused: "OWNER_ROWS_DISAGREE_ON_SOURCE" };
  const h = g.actual?.homeRuns;
  const a = g.actual?.awayRuns;
  if (!isInt(h) || !isInt(a)) return { refused: "NO_FINAL_SCORE" };
  if (!(Date.parse(g.forecastGeneratedAt ?? "") < Date.parse(g.firstPitchUtc ?? ""))) return { refused: "FORECAST_NOT_PRE_FIRST_PITCH" };
  if (!revision) return { refused: "FORECAST_OF_RECORD_UNRECOVERED" };
  if (Date.parse(revision.generatedAt ?? "") !== Date.parse(g.forecastGeneratedAt)) return { refused: "REVISION_IS_NOT_THE_FORECAST_OF_RECORD" };
  const pred = (revision.predictions ?? []).find((p) => p?.gamePk === g.gamePk || String(p?.gamePk) === String(g.gamePk));
  if (!pred) return { refused: "GAME_ABSENT_FROM_REVISION" };
  for (const r of gameRows) {
    if (ownerProbability(pred, r.market) !== r.modelProbability) return { refused: "REVISION_DOES_NOT_REPRODUCE_OWNER_GRADE" };
  }
  const ps = pred.projectedScore;
  const projected = isNum(ps?.away) && isNum(ps?.home) ? { away: ps.away, home: ps.home, label: ps.label ?? null } : null;
  const totalMedian = isNum(pred.total?.simulationMedian) ? pred.total.simulationMedian : null;
  if (!projected && totalMedian == null) return { refused: "NO_PUBLISHED_MEDIAN" };
  return {
    row: {
      schemaVersion: 1,
      gradingVersion: MLB_PROJECTED_GRADING_VERSION,
      gamePk: g.gamePk,
      date: g.date ?? null,
      matchup: g.matchup ?? null,
      awayTeam: pred.awayTeam ?? null,
      homeTeam: pred.homeTeam ?? null,
      firstPitchUtc: g.firstPitchUtc,
      forecastGeneratedAt: g.forecastGeneratedAt,
      forecastSource: g.forecastSource,
      modelId: typeof pred.decisionEngineVersion === "string" ? pred.decisionEngineVersion : null,
      projectedScore: projected,
      simulationMedianTotal: totalMedian,
      actual: { awayRuns: a, homeRuns: h, totalRuns: a + h },
      resultSource: g.resultSource ?? null,
      gradedAt: g.gradedAt ?? null,
    },
  };
}
