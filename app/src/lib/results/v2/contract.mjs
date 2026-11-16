/**
 * RESULTS V2 · THE RESULTS DAY CONTRACT (gtp.results-day@1) — one sport, one ET date, official prediction vs actual.
 *
 * Pure: no fs, no clock, no network, and nothing here reads a source. The builder (scripts/results/build-results-day.mjs)
 * feeds it rows, the emit step and the /results/day shell consume what it returns.
 *
 * THREE SEPARATE QUESTIONS PER ROW, NEVER ONE WORD (founder rulings, 2026-11-02):
 *
 *   measurement   MEASURED · NO_MEASUREMENT · PENDING · VOID      did an official figure exist?
 *   sideResult    CORRECT · INCORRECT · PUSH · NO_SIDE · null     did the model's side beat the captured market reference?
 *   claim         WIN · LOSS · PUSH · NO_PICK · NO_CLAIM          is this an official betting result?
 *
 * `claim` is the strict one. It leaves NO_CLAIM only through `officialClaim`, which needs a verified qualifying reference,
 * a verified snapshot AND a verified settlement rule. Every pilot day is SURVEY_MEASURED, so every pilot row and game is
 * NO_CLAIM. A forecast median alone is never an official result. `sideResult` is a comparison and is labelled as one.
 *
 * Forecast accuracy is a third thing again: `absoluteError` per row and `meanAbsoluteError` per market. A missing stat is
 * NO_MEASUREMENT with actual null: it is not a zero, and it is never counted against the model. Counts stay per family and
 * are never pooled across families or sports. The mappers RE-GRADE NOTHING: an NFL CORRECT or INCORRECT is the settlement
 * owner's `forecastResult`, read as it stands.
 *
 * ⚠ NO ROW FROM WHICH A RESTRICTED LINE CAN BE RECONSTRUCTED (founder ruling, 2026-11-03). A row carrying the frozen
 * prediction, the actual AND a side or side result against a hidden reference brackets that reference. The mappers still
 * return `modelSide` and `sideResult` so the builder can count them, but `publicRow` drops both before a row is sealed,
 * and `publicSafetyViolations` refuses any row that carries either. Side comparisons ship only as per-family day totals
 * (`sideAggregate`), suppressed below SIDE_MIN_COMPARED compared rows or when one outcome is zero.
 *
 * ⚠ NO PRICE REACHES THIS CONTRACT'S OUTPUT. The frozen market is read to find the side and is then dropped: the side
 * ships, and the figure behind it does not. `publicSafetyViolations` refuses a file that carries one (provider terms forbid
 * downloadable price files). NBA has no captured reference here, so it has no side: the shadow ledger's W/L is graded
 * against the median itself, which says nothing.
 */

export const RESULTS_DAY_SCHEMA = "gtp.results-day@1";
export const RESULTS_DAY_INDEX_SCHEMA = "gtp.results-day-index@1";

export const MEASUREMENT = Object.freeze({ MEASURED: "MEASURED", NO_MEASUREMENT: "NO_MEASUREMENT", PENDING: "PENDING", VOID: "VOID" });
export const CLAIM = Object.freeze({ WIN: "WIN", LOSS: "LOSS", PUSH: "PUSH", NO_PICK: "NO_PICK", NO_CLAIM: "NO_CLAIM" });
export const MODEL_SIDE = Object.freeze({ OVER: "OVER", UNDER: "UNDER" });
export const SIDE_RESULT = Object.freeze({ CORRECT: "CORRECT", INCORRECT: "INCORRECT", PUSH: "PUSH", NO_SIDE: "NO_SIDE" });

/** How a row's frozen prediction reached the day file. A pilot day is a backfill, kept apart from any future live capture. */
export const EVIDENCE = Object.freeze({ BACKFILL_GITHUB: "BACKFILL_GITHUB" });
/**
 * Evidence a day must carry before the emit step publishes it (founder ruling, 2026-11-03). Empty today: a backfill is
 * not proof a forecast was served live, so BACKFILL_GITHUB days stay private and the public index may be empty.
 */
export const PUBLIC_EVIDENCE = Object.freeze([]);
/** The served check is not reproduced by the builder: the day was measured by a survey, cited in the doc note. */
export const VALIDATION = Object.freeze({ SURVEY_MEASURED: "SURVEY_MEASURED" });

export const REASON = Object.freeze({
  SIDE_COMPARED: "SIDE_COMPARED",
  NO_STAT_ROW: "NO_STAT_ROW",
  NOT_FINAL: "NOT_FINAL",
  VOIDED: "VOIDED",
  PROJECTION_ONLY: "PROJECTION_ONLY",
  YES_NO_MARKET: "YES_NO_MARKET",
  NO_FROZEN_REFERENCE: "NO_FROZEN_REFERENCE",
  NO_MODEL_SIDE: "NO_MODEL_SIDE",
  NOT_GRADED: "NOT_GRADED",
  EXPERIMENTAL_LANE: "EXPERIMENTAL_LANE",
  DID_NOT_PLAY: "DID_NOT_PLAY",
  NOT_IN_BOX_SCORE: "NOT_IN_BOX_SCORE",
  SIDE_AGGREGATE_ONLY: "SIDE_AGGREGATE_ONLY",
});

/** Every reason, in words a reader can use. These strings ship in the CSV, so `publicSafetyViolations` scans them too. */
export const REASON_WORDS = Object.freeze({
  [REASON.SIDE_COMPARED]: "Model side compared with the captured pregame market reference. Not a betting result.",
  [REASON.NO_STAT_ROW]: "No official stat row for this player in this market at final. Not counted against the model.",
  [REASON.NOT_FINAL]: "Not final yet. Not counted.",
  [REASON.VOIDED]: "Voided. Not counted.",
  [REASON.PROJECTION_ONLY]: "Model projection only: this market has not cleared its publication bar, so its side is not compared.",
  [REASON.YES_NO_MARKET]: "Yes or no market: the forecast is a probability, so it has no side to compare.",
  [REASON.NO_FROZEN_REFERENCE]: "No pregame market reference was captured for this player, so there is no side.",
  [REASON.NO_MODEL_SIDE]: "The model took no side here.",
  [REASON.NOT_GRADED]: "The settlement record holds no comparison for this row.",
  [REASON.EXPERIMENTAL_LANE]: "Experimental lane: medians only, with no side and no betting result.",
  [REASON.DID_NOT_PLAY]: "Did not play. Not counted against the model.",
  [REASON.NOT_IN_BOX_SCORE]: "Not listed in the final box score. Not counted against the model.",
  [REASON.SIDE_AGGREGATE_ONLY]: "Side comparisons for this market are published only as day totals per market, never per row. Not a betting result.",
});

/** Market keys in display order, per sport. A family outside this table is refused, never silently dropped. */
export const MARKET_LABELS = Object.freeze({
  player_receptions: "Receptions",
  player_reception_yds: "Receiving yards",
  player_rush_yds: "Rushing yards",
  player_pass_yds: "Passing yards",
  anytime_td: "Anytime TD",
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  threePm: "3-pointers made",
  pra: "Pts + Reb + Ast",
  ptsReb: "Pts + Reb",
  ptsAst: "Pts + Ast",
});
const MARKET_ORDER = Object.keys(MARKET_LABELS);
export const marketRank = (m) => {
  const i = MARKET_ORDER.indexOf(m);
  if (i < 0) throw new Error(`unknown market ${m}`);
  return i;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/* `claim` is not an argument: nothing reaches it except `officialClaim`. */
const axes = (measurement, sideResult, reason, modelSide = null) => ({ measurement, modelSide, sideResult, claim: CLAIM.NO_CLAIM, reason });

/** |prediction − actual| to two places, or null when either side is not a number (a yes/no row, a missing stat). */
export function absoluteError(prediction, actual) {
  if (!isNum(prediction) || !isNum(actual)) return null;
  return Number(Math.abs(prediction - actual).toFixed(2));
}

/**
 * The model's side against a frozen numeric reference, or null when there is none. A median ON the reference has no side.
 * The side may ship; the reference may not.
 */
export function modelSideOf(median, reference) {
  if (!isNum(median) || !isNum(reference) || median === reference) return null;
  return median > reference ? MODEL_SIDE.OVER : MODEL_SIDE.UNDER;
}

const OFFICIAL_CLAIM = Object.freeze({
  [SIDE_RESULT.CORRECT]: CLAIM.WIN, [SIDE_RESULT.INCORRECT]: CLAIM.LOSS, [SIDE_RESULT.PUSH]: CLAIM.PUSH, [SIDE_RESULT.NO_SIDE]: CLAIM.NO_PICK,
});

/**
 * The only way a row leaves NO_CLAIM: all three verified, each by its own evidence. A side result alone is not enough, and
 * neither is two of the three. SURVEY_MEASURED verifies none of them, so no pilot day passes anything here.
 */
export function officialClaim(sideResult, { qualifyingReference = false, snapshot = false, settlementRule = false } = {}) {
  if (qualifyingReference !== true || snapshot !== true || settlementRule !== true) return CLAIM.NO_CLAIM;
  return OFFICIAL_CLAIM[sideResult] ?? CLAIM.NO_CLAIM;
}

/**
 * One row of nfl-prop-settlement. Order matters: no measurement first (a row with nothing to measure compares nothing),
 * then the families with no comparison, then the frozen reference, and only then the owner's grade. The side itself is
 * shown wherever it can be determined, measured or not: it was fixed before kickoff.
 *
 * ⚠ A forecastResult of PUSH HAS TWO MEANINGS (live-prop-state.mjs `settle`). The median sitting ON the reference means
 * there was never a side (NO_SIDE, 10-04 has one real row: 37.5 on 37.5, final 13). A side that landed exactly on the
 * reference is a real PUSH. Anything else is a defect, and the builder stops rather than guessing.
 */
export function axesForNflRow(row) {
  const state = row?.measurementState;
  const reference = row?.frozen?.market?.line;
  const median = row?.frozen?.projection?.median;
  const side = modelSideOf(median, reference);
  if (state === "PENDING") return axes(MEASUREMENT.PENDING, null, REASON.NOT_FINAL, side);
  if (state === "VOID") return axes(MEASUREMENT.VOID, null, REASON.VOIDED, side);
  if (state !== "OBSERVED" && state !== "NO_MEASUREMENT") throw new Error(`${row?.settlementId}: unknown measurementState ${state}`);
  if (row.finality !== "CANONICAL") return axes(MEASUREMENT.PENDING, null, REASON.NOT_FINAL, side);
  if (state === "NO_MEASUREMENT" || row.finalStat == null) return axes(MEASUREMENT.NO_MEASUREMENT, null, REASON.NO_STAT_ROW, side);

  const measured = (sideResult, reason) => axes(MEASUREMENT.MEASURED, sideResult, reason, side);
  if (row.family === "anytime_td") return measured(null, REASON.YES_NO_MARKET);
  if (row.familyState !== "PUBLISHED") return measured(null, REASON.PROJECTION_ONLY);
  if (!isNum(reference)) return measured(null, REASON.NO_FROZEN_REFERENCE);

  switch (row.forecastResult) {
    case "WIN": return measured(SIDE_RESULT.CORRECT, REASON.SIDE_COMPARED);
    case "LOSS": return measured(SIDE_RESULT.INCORRECT, REASON.SIDE_COMPARED);
    case "PUSH":
      if (median === reference) return measured(SIDE_RESULT.NO_SIDE, REASON.NO_MODEL_SIDE);
      if (row.lineResult === "PUSH") return measured(SIDE_RESULT.PUSH, REASON.SIDE_COMPARED);
      throw new Error(`${row.settlementId}: forecastResult PUSH with a side and no push on the reference`);
    case null:
    case undefined:
      return measured(null, REASON.NOT_GRADED);
    default:
      throw new Error(`${row.settlementId}: unknown forecastResult ${row.forecastResult}`);
  }
}

/** The actual a reader sees for one NFL row: the stat, YES or NO for anytime TD, and null unless MEASURED. */
export function nflActual(row, { measurement }) {
  if (measurement !== MEASUREMENT.MEASURED) return null;
  if (row.family === "anytime_td") return row.finalStat > 0 ? "YES" : "NO";
  return row.finalStat;
}

const NBA_PENDING = new Set(["PENDING_FINAL", "PENDING_BOXSCORE"]);

/** One current entry of the NBA prop-grade ledger. No side and no claim on any row, whatever the entry says. */
export function axesForNbaRow(entry) {
  const row = (measurement, reason) => axes(measurement, null, reason);
  const state = entry?.state;
  if (state === "GRADED") return row(MEASUREMENT.MEASURED, REASON.EXPERIMENTAL_LANE);
  if (NBA_PENDING.has(state)) return row(MEASUREMENT.PENDING, REASON.NOT_FINAL);
  if (state === "VOID_PENDING_REVIEW") return row(MEASUREMENT.VOID, REASON.VOIDED);
  if (state === "NO_MEASUREMENT") {
    if (entry.code === "DNP") return row(MEASUREMENT.NO_MEASUREMENT, REASON.DID_NOT_PLAY);
    if (entry.code === "NOT_IN_BOXSCORE") return row(MEASUREMENT.NO_MEASUREMENT, REASON.NOT_IN_BOX_SCORE);
    throw new Error(`${entry.key}: unknown NO_MEASUREMENT code ${entry.code}`);
  }
  throw new Error(`${entry?.key}: unknown ledger state ${state}`);
}

/**
 * The NBA game-level comparison: the frozen Elo side against the final. Sides are compared as home/away because the lane's
 * abbreviations and the finals record's tricodes differ (NY vs NYK, SA vs SAS). No score forecast exists to compare, and
 * on a SURVEY_MEASURED day this is a `sideResult` like any other, not an official claim.
 */
export function axesForNbaSide(game, final) {
  if (!final) return axes(MEASUREMENT.PENDING, null, REASON.NOT_FINAL);
  const favoured = game?.elo?.favoured ?? null;
  const side = favoured === game.home.abbr ? "home" : favoured === game.away.abbr ? "away" : null;
  if (game?.elo?.state !== "FAVOURED" || side === null) return axes(MEASUREMENT.MEASURED, SIDE_RESULT.NO_SIDE, REASON.NO_MODEL_SIDE);
  if (final.ftHome === final.ftAway) return axes(MEASUREMENT.MEASURED, SIDE_RESULT.PUSH, REASON.SIDE_COMPARED);
  const correct = (final.ftHome > final.ftAway) === (side === "home");
  return axes(MEASUREMENT.MEASURED, correct ? SIDE_RESULT.CORRECT : SIDE_RESULT.INCORRECT, REASON.SIDE_COMPARED);
}

/** Two-sided 95% Wilson score interval for k of n, to four places, or null when n is 0. */
export function wilson95(k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null;
  const z = 1.959963984540054;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: Number(Math.max(0, centre - half).toFixed(4)), upper: Number(Math.min(1, centre + half).toFixed(4)) };
}

/** A cell with fewer compared rows than this prints no side counts at all. */
export const SIDE_MIN_COMPARED = 10;

/**
 * A side comparison as it may be published: counts plus a 95% Wilson interval, never a bare rate. Null when nothing was
 * compared. Suppressed below SIDE_MIN_COMPARED, and also when either outcome is zero, because an all-INCORRECT cell would
 * place every compared row's hidden reference between its prediction and its actual.
 */
export function sideAggregate(correct, incorrect) {
  const compared = correct + incorrect;
  if (!compared) return null;
  if (compared < SIDE_MIN_COMPARED || correct === 0 || incorrect === 0) return { suppressed: true, minimumCompared: SIDE_MIN_COMPARED };
  const interval = wilson95(correct, compared);
  return { compared, correct, incorrect, wilson95: interval, indistinguishableFromHalf: interval.lower <= 0.5 && interval.upper >= 0.5 };
}

/** Row keys that would pair a per-row side with a provider reference. Never in a sealed or public row. */
const ROW_SIDE_KEY = /^(modelSide|sideResult|side|pick|lean|overUnder|direction|lineSide|referenceSide|vsReference)$/i;
/** Row reasons that name a per-row side comparison. A sealed row says SIDE_AGGREGATE_ONLY instead. */
const ROW_SIDE_REASON = new Set([REASON.SIDE_COMPARED, REASON.NO_MODEL_SIDE]);

/**
 * The row as it may be sealed: the mapper's `modelSide` and `sideResult` are dropped, and a reason that would say which
 * rows were compared (or sat on the reference) becomes SIDE_AGGREGATE_ONLY.
 */
export function publicRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!ROW_SIDE_KEY.test(k)) out[k] = v;
  if (ROW_SIDE_REASON.has(out.reason)) out.reason = REASON.SIDE_AGGREGATE_ONLY;
  return out;
}

/**
 * Per-market counts in display order: measurement, side comparison, accuracy and official claim, each on its own fields.
 * One entry per family and no total, because pooling is what this contract exists to prevent. Only CORRECT and INCORRECT
 * enter `side` (sideAggregate: counts and a Wilson interval, never a bare rate). PUSH and NO_SIDE are not published even
 * as counts: a push count says some row's reference equals its actual. No rate field exists.
 */
export function familySummary(rows) {
  const by = new Map();
  for (const r of rows) {
    const c = by.get(r.market) ?? {
      market: r.market, rows: 0, measured: 0, noMeasurement: 0, pending: 0, void: 0,
      sideCorrect: 0, sideIncorrect: 0, errorRows: 0, errorSum: 0,
      win: 0, loss: 0, push: 0, noPick: 0, noClaim: 0,
    };
    c.rows += 1;
    if (r.measurement === MEASUREMENT.MEASURED) c.measured += 1;
    else if (r.measurement === MEASUREMENT.NO_MEASUREMENT) c.noMeasurement += 1;
    else if (r.measurement === MEASUREMENT.PENDING) c.pending += 1;
    else if (r.measurement === MEASUREMENT.VOID) c.void += 1;
    else throw new Error(`unknown measurement ${r.measurement}`);
    if (r.sideResult === SIDE_RESULT.CORRECT) c.sideCorrect += 1;
    else if (r.sideResult === SIDE_RESULT.INCORRECT) c.sideIncorrect += 1;
    else if (r.sideResult != null && r.sideResult !== SIDE_RESULT.PUSH && r.sideResult !== SIDE_RESULT.NO_SIDE) throw new Error(`unknown sideResult ${r.sideResult}`);
    if (isNum(r.absoluteError)) { c.errorRows += 1; c.errorSum += r.absoluteError; }
    if (r.claim === CLAIM.WIN) c.win += 1;
    else if (r.claim === CLAIM.LOSS) c.loss += 1;
    else if (r.claim === CLAIM.PUSH) c.push += 1;
    else if (r.claim === CLAIM.NO_PICK) c.noPick += 1;
    else if (r.claim === CLAIM.NO_CLAIM) c.noClaim += 1;
    else throw new Error(`unknown claim ${r.claim}`);
    by.set(r.market, c);
  }
  return [...by.values()]
    .sort((a, b) => marketRank(a.market) - marketRank(b.market))
    .map(({ errorSum, sideCorrect, sideIncorrect, ...c }) => ({
      ...c, side: sideAggregate(sideCorrect, sideIncorrect), decided: c.win + c.loss,
      meanAbsoluteError: c.errorRows ? Number((errorSum / c.errorRows).toFixed(2)) : null,
    }));
}

/** Stable JSON: keys sorted at every depth, one trailing newline, no clock. Same inputs, same bytes. */
export function canonicalDayJson(doc) {
  const sorted = (v) => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
    return v;
  };
  return `${JSON.stringify(sorted(doc))}\n`;
}

export const CSV_COLUMNS = Object.freeze([
  "sport", "date", "eventId", "matchup", "start", "cutoff", "subject", "playerId", "team", "market", "marketLabel",
  "predictionKind", "prediction", "actual", "absoluteError", "measurement", "claim", "reason", "reasonWords",
  "evidence", "validationStatus", "servedFrom", "settledFrom", "generatedAt", "sourceVersion",
]);
const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The day as a flat download: one line per row, the game's snapshot repeated on each so a line stands alone. */
export function toDayCsv(doc) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const g of doc.games) {
    for (const r of g.rows) {
      const v = {
        ...r, ...g.snapshot, sport: doc.sport, date: doc.date, eventId: g.eventId, matchup: g.matchup, start: g.start,
        cutoff: g.cutoff, marketLabel: MARKET_LABELS[r.market], reasonWords: REASON_WORDS[r.reason],
      };
      lines.push(CSV_COLUMNS.map((c) => csvCell(v[c])).join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Keys that may never appear in a public day file, at any depth. */
const FORBIDDEN_KEY = /^(line|lines|lineResult|odds|overOdds|underOdds|yesOdds|noOdds|sportsbook|book|bookmaker|price|prices|overPrice|underPrice|overAmerican|underAmerican|american|impliedProbability|frozen|p10|p90|band80|teamScores|projectedScore|syntheticMedianLine)$/i;
/** Words and book names that may never appear in a public day file's text, CSV included. */
const FORBIDDEN_TEXT = /\blines?\b|\bodds\b|sportsbook|draftkings|fan\s?duel|betmgm|caesars|betrivers|pinnacle|bovada|bet365|espn\s?bet|pointsbet|fanatics|[+-]\d{3}\b/i;

/** Text that only a per-row side would put in a file. A game's NBA `sideResult` (model pick vs the final) is allowed. */
const ROW_SIDE_TEXT = /"modelSide"|"(OVER|UNDER)"|"(SIDE_COMPARED|NO_MODEL_SIDE|sideResult)"[^{}]*"subject"|"subject"[^{}]*"(SIDE_COMPARED|NO_MODEL_SIDE|sideResult)"/;

/** Every reason a day file (object) or its serialised text may not be published. Empty means safe. */
export function publicSafetyViolations(content) {
  const out = [];
  const visit = (v, at, isRow = false) => {
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`));
    else if (v && typeof v === "object") {
      if (isRow) {
        for (const k of Object.keys(v)) if (ROW_SIDE_KEY.test(k)) out.push(`${at}.${k}: per-row side vs a provider reference`);
        if (ROW_SIDE_REASON.has(v.reason)) out.push(`${at}.reason: ${v.reason} names a per-row side comparison`);
      }
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEY.test(k)) out.push(`${at}.${k}: forbidden key`);
        if (k === "rows" && Array.isArray(x)) x.forEach((r, i) => visit(r, `${at}.rows[${i}]`, true));
        else visit(x, `${at}.${k}`);
      }
    }
  };
  if (typeof content === "string") {
    const hit = FORBIDDEN_TEXT.exec(content);
    if (hit) out.push(`text: "${hit[0]}" near offset ${hit.index}`);
    const side = ROW_SIDE_TEXT.exec(content);
    if (side) out.push(`text: per-row side "${side[0]}" near offset ${side.index}`);
    const header = content.trimStart().startsWith("{") ? "" : content.split("\n", 1)[0];
    if (/(^|,)(modelSide|sideResult)(,|$)/.test(header)) out.push("csv: a per-row side column");
    for (const [i, r] of (content.trimStart().startsWith("{") ? [] : content.split("\n").slice(1).entries())) {
      if (/(^|,)(OVER|UNDER)(,|$)/.test(r)) { out.push(`csv line ${i + 2}: a per-row OVER or UNDER`); break; }
    }
    return out;
  }
  visit(content, "$");
  const hit = FORBIDDEN_TEXT.exec(JSON.stringify(content));
  if (hit) out.push(`text: "${hit[0]}" near offset ${hit.index}`);
  return out;
}
