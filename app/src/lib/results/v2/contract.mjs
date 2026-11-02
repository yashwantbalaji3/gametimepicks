/**
 * RESULTS V2 · THE RESULTS DAY CONTRACT (gtp.results-day@1) — one sport, one ET date, official prediction vs actual.
 *
 * Pure: no fs, no clock, no network, and nothing here reads a source. The builder (scripts/results/build-results-day.mjs)
 * feeds it rows, the emit step and the /results/day shell consume what it returns.
 *
 * TWO AXES PER ROW, NEVER ONE WORD:
 *
 *   measurement   MEASURED · NO_MEASUREMENT · PENDING · VOID     did an official figure exist?
 *   claim         WIN · LOSS · PUSH · NO_PICK · NO_CLAIM         was a directional claim made, and how did it land?
 *
 * Only WIN and LOSS enter a rate. `decided` is printed per family and is never pooled across families or sports. A
 * missing stat is NO_MEASUREMENT with actual null: it is not a zero, and it is not a loss. The mappers RE-GRADE NOTHING:
 * an NFL WIN or LOSS is the settlement owner's `forecastResult`, read as it stands.
 *
 * ⚠ NO PRICE REACHES THIS CONTRACT'S OUTPUT. The frozen market is read to decide whether a claim exists and is then
 * dropped; `publicSafetyViolations` refuses a file that carries one (provider terms forbid downloadable price files).
 * NBA props are NO_CLAIM on every row: the shadow ledger's W/L is graded against the median itself, which is not a claim.
 */

export const RESULTS_DAY_SCHEMA = "gtp.results-day@1";
export const RESULTS_DAY_INDEX_SCHEMA = "gtp.results-day-index@1";

export const MEASUREMENT = Object.freeze({ MEASURED: "MEASURED", NO_MEASUREMENT: "NO_MEASUREMENT", PENDING: "PENDING", VOID: "VOID" });
export const CLAIM = Object.freeze({ WIN: "WIN", LOSS: "LOSS", PUSH: "PUSH", NO_PICK: "NO_PICK", NO_CLAIM: "NO_CLAIM" });

/** How a row's frozen prediction reached the day file. A pilot day is a backfill, kept apart from any future live capture. */
export const EVIDENCE = Object.freeze({ BACKFILL_GITHUB: "BACKFILL_GITHUB" });
/** The served check is not reproduced by the builder: the day was measured by a survey, cited in the doc note. */
export const VALIDATION = Object.freeze({ SURVEY_MEASURED: "SURVEY_MEASURED" });

export const REASON = Object.freeze({
  GRADED: "GRADED",
  NO_STAT_ROW: "NO_STAT_ROW",
  NOT_FINAL: "NOT_FINAL",
  VOIDED: "VOIDED",
  PROJECTION_ONLY: "PROJECTION_ONLY",
  YES_NO_MARKET: "YES_NO_MARKET",
  NO_FROZEN_REFERENCE: "NO_FROZEN_REFERENCE",
  ON_THE_REFERENCE: "ON_THE_REFERENCE",
  NOT_GRADED: "NOT_GRADED",
  EXPERIMENTAL_LANE: "EXPERIMENTAL_LANE",
  DID_NOT_PLAY: "DID_NOT_PLAY",
  NOT_IN_BOX_SCORE: "NOT_IN_BOX_SCORE",
});

/** Every reason, in words a reader can use. These strings ship in the CSV, so `publicSafetyViolations` scans them too. */
export const REASON_WORDS = Object.freeze({
  [REASON.GRADED]: "Graded against the frozen pregame market reference, which is not published here.",
  [REASON.NO_STAT_ROW]: "No official stat row for this player in this market at final. Not a loss.",
  [REASON.NOT_FINAL]: "Not final yet. Not counted.",
  [REASON.VOIDED]: "Voided. Not counted.",
  [REASON.PROJECTION_ONLY]: "Model projection only: this market has not cleared its publication bar, so no claim is graded.",
  [REASON.YES_NO_MARKET]: "Yes or no market: the forecast is a probability, so no win or loss is graded.",
  [REASON.NO_FROZEN_REFERENCE]: "No pregame market reference was frozen for this player, so no claim is graded.",
  [REASON.ON_THE_REFERENCE]: "The model projection sat exactly on the frozen reference, so it took no side.",
  [REASON.NOT_GRADED]: "The settlement record holds no grade for this row.",
  [REASON.EXPERIMENTAL_LANE]: "Experimental lane: medians only, and no claim is graded.",
  [REASON.DID_NOT_PLAY]: "Did not play. Not a loss.",
  [REASON.NOT_IN_BOX_SCORE]: "Not listed in the final box score. Not a loss.",
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
const axes = (measurement, claim, reason) => ({ measurement, claim, reason });

/** |prediction − actual| to two places, or null when either side is not a number (a yes/no row, a missing stat). */
export function absoluteError(prediction, actual) {
  if (!isNum(prediction) || !isNum(actual)) return null;
  return Number(Math.abs(prediction - actual).toFixed(2));
}

/**
 * One row of nfl-prop-settlement. Order matters: no measurement first (a row with nothing to measure is never a claim),
 * then the families that make no directional claim, then the frozen reference, and only then the owner's grade.
 *
 * ⚠ A forecastResult of PUSH HAS TWO MEANINGS (live-prop-state.mjs `settle`). The median sitting ON the reference means
 * there was never a side (NO_PICK, 10-04 has one real row: 37.5 on 37.5, final 13). A side that landed exactly on the
 * reference is a real PUSH. Anything else is a defect, and the builder stops rather than guessing.
 */
export function axesForNflRow(row) {
  const state = row?.measurementState;
  if (state === "PENDING") return axes(MEASUREMENT.PENDING, CLAIM.NO_CLAIM, REASON.NOT_FINAL);
  if (state === "VOID") return axes(MEASUREMENT.VOID, CLAIM.NO_CLAIM, REASON.VOIDED);
  if (state !== "OBSERVED" && state !== "NO_MEASUREMENT") throw new Error(`${row?.settlementId}: unknown measurementState ${state}`);
  if (row.finality !== "CANONICAL") return axes(MEASUREMENT.PENDING, CLAIM.NO_CLAIM, REASON.NOT_FINAL);
  if (state === "NO_MEASUREMENT" || row.finalStat == null) return axes(MEASUREMENT.NO_MEASUREMENT, CLAIM.NO_CLAIM, REASON.NO_STAT_ROW);

  const measured = (claim, reason) => axes(MEASUREMENT.MEASURED, claim, reason);
  if (row.family === "anytime_td") return measured(CLAIM.NO_CLAIM, REASON.YES_NO_MARKET);
  if (row.familyState !== "PUBLISHED") return measured(CLAIM.NO_CLAIM, REASON.PROJECTION_ONLY);
  const reference = row.frozen?.market?.line;
  if (!isNum(reference)) return measured(CLAIM.NO_CLAIM, REASON.NO_FROZEN_REFERENCE);

  switch (row.forecastResult) {
    case "WIN": return measured(CLAIM.WIN, REASON.GRADED);
    case "LOSS": return measured(CLAIM.LOSS, REASON.GRADED);
    case "PUSH":
      if (row.frozen?.projection?.median === reference) return measured(CLAIM.NO_PICK, REASON.ON_THE_REFERENCE);
      if (row.lineResult === "PUSH") return measured(CLAIM.PUSH, REASON.GRADED);
      throw new Error(`${row.settlementId}: forecastResult PUSH with a side and no push on the reference`);
    case null:
    case undefined:
      return measured(CLAIM.NO_CLAIM, REASON.NOT_GRADED);
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

/** One current entry of the NBA prop-grade ledger. `claim` is NO_CLAIM on every row, whatever the entry says. */
export function axesForNbaRow(entry) {
  const noClaim = (measurement, reason) => axes(measurement, CLAIM.NO_CLAIM, reason);
  const state = entry?.state;
  if (state === "GRADED") return noClaim(MEASUREMENT.MEASURED, REASON.EXPERIMENTAL_LANE);
  if (NBA_PENDING.has(state)) return noClaim(MEASUREMENT.PENDING, REASON.NOT_FINAL);
  if (state === "VOID_PENDING_REVIEW") return noClaim(MEASUREMENT.VOID, REASON.VOIDED);
  if (state === "NO_MEASUREMENT") {
    if (entry.code === "DNP") return noClaim(MEASUREMENT.NO_MEASUREMENT, REASON.DID_NOT_PLAY);
    if (entry.code === "NOT_IN_BOXSCORE") return noClaim(MEASUREMENT.NO_MEASUREMENT, REASON.NOT_IN_BOX_SCORE);
    throw new Error(`${entry.key}: unknown NO_MEASUREMENT code ${entry.code}`);
  }
  throw new Error(`${entry?.key}: unknown ledger state ${state}`);
}

/**
 * The NBA game-level record: the frozen Elo side against the final. Sides are compared as home/away because the lane's
 * abbreviations and the finals record's tricodes differ (NY vs NYK, SA vs SAS). No score forecast exists to grade.
 */
export function axesForNbaSide(game, final) {
  if (!final) return axes(MEASUREMENT.PENDING, CLAIM.NO_CLAIM, REASON.NOT_FINAL);
  const favoured = game?.elo?.favoured ?? null;
  const side = favoured === game.home.abbr ? "home" : favoured === game.away.abbr ? "away" : null;
  if (game?.elo?.state !== "FAVOURED" || side === null) return axes(MEASUREMENT.MEASURED, CLAIM.NO_PICK, REASON.ON_THE_REFERENCE);
  if (final.ftHome === final.ftAway) return axes(MEASUREMENT.MEASURED, CLAIM.PUSH, REASON.GRADED);
  const won = (final.ftHome > final.ftAway) === (side === "home");
  return axes(MEASUREMENT.MEASURED, won ? CLAIM.WIN : CLAIM.LOSS, REASON.GRADED);
}

/** Per-market counts in display order. One row per family and no total: pooling is what this contract exists to prevent. */
export function familySummary(rows) {
  const by = new Map();
  for (const r of rows) {
    const c = by.get(r.market) ?? { market: r.market, rows: 0, measured: 0, noMeasurement: 0, pending: 0, void: 0, win: 0, loss: 0, push: 0, noPick: 0, noClaim: 0 };
    c.rows += 1;
    if (r.measurement === MEASUREMENT.MEASURED) c.measured += 1;
    else if (r.measurement === MEASUREMENT.NO_MEASUREMENT) c.noMeasurement += 1;
    else if (r.measurement === MEASUREMENT.PENDING) c.pending += 1;
    else if (r.measurement === MEASUREMENT.VOID) c.void += 1;
    else throw new Error(`unknown measurement ${r.measurement}`);
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
    .map((c) => {
      const decided = c.win + c.loss;
      return { ...c, decided, winRate: decided ? Number((c.win / decided).toFixed(4)) : null };
    });
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

/** Every reason a day file (object) or its serialised text may not be published. Empty means safe. */
export function publicSafetyViolations(content) {
  const out = [];
  const visit = (v, at) => {
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEY.test(k)) out.push(`${at}.${k}: forbidden key`);
        visit(x, `${at}.${k}`);
      }
    }
  };
  if (typeof content === "string") {
    const hit = FORBIDDEN_TEXT.exec(content);
    if (hit) out.push(`text: "${hit[0]}" near offset ${hit.index}`);
    return out;
  }
  visit(content, "$");
  const hit = FORBIDDEN_TEXT.exec(JSON.stringify(content));
  if (hit) out.push(`text: "${hit[0]}" near offset ${hit.index}`);
  return out;
}
