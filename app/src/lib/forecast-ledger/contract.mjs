/**
 * THE UNIVERSAL FORECAST LEDGER — CONTRACT (Session 13 · Phase B).
 *
 * One row = one forecast observation GameTimePicks actually published (or froze) for one subject, one family,
 * one event. It is the measured model-history unit that Results V2, Ask and Research read. It is NOT:
 *   - a product receipt (a 4-leg card is one product receipt; its legs' forecasts are rows here, once);
 *   - a page rendering (the same forecast on a Top board, a game page and Ask is still ONE row);
 *   - a shadow, research or unpublished candidate row (those never enter the public ledger);
 *   - a pre-kickoff revision (a revision superseded before the event was never the forecast of record — the
 *     owner's lineage keeps it; the ledger keeps the LAST pre-start publication, which is what was graded).
 *
 * THE LEDGER IS A PROJECTION, NOT A NEW CAPTURE. Every row is read from an owner that already froze or graded the
 * forecast (NFL forecast receipts + experimental settlement, the NFL prop-settlement ledger, the MLB game-grade
 * log, the EPL / Ligue 1 grade logs, the UFC model-vs-market grade log, Homer Nukes settled files). Nothing is
 * re-predicted, nothing is re-settled: the owner's outcome word is carried; only the family-appropriate
 * MEASUREMENT (absolute error, Brier, log loss…) is computed here, from the owner's own numbers, by one pure
 * function per forecast kind (measure.mjs), with parity tests against the owners that also publish a score.
 *
 * MISSING STAYS MISSING. A field the owner did not record is `null` — never 0, never "", never a guess.
 *
 * APPEND-ONLY. Once a row exists, its IMMUTABLE fields never change and the row never disappears
 * (append-only.mjs). Settlement may move PENDING → settled, and a settled row may change only when the owner
 * recorded a correction (settlement.corrections grows). Everything else is a violation.
 */

export const LEDGER_SCHEMA_VERSION = "forecast-ledger@1";

/** Publication states (B4). Only PUBLISHED and WITHDRAWN rows are in the public ledger at all. */
export const PUBLICATION_STATUS = Object.freeze(["PUBLISHED", "WITHDRAWN", "WITHHELD", "UNAVAILABLE", "SHADOW", "RESEARCH_ONLY"]);
/** The states a public ledger row may carry. WITHHELD / UNAVAILABLE / SHADOW / RESEARCH_ONLY never enter. */
export const PUBLIC_LEDGER_STATUSES = Object.freeze(["PUBLISHED", "WITHDRAWN"]);

/** What kind of claim the forecast made — decides how it is measured. */
export const FORECAST_KIND = Object.freeze({
  /** A number with (optionally) a printed central range: yards, points, a total. Measured by error, never W/L. */
  CONTINUOUS: "CONTINUOUS_PROJECTION",
  /** One probability of one binary event: ATD, a win, over 2.5. Measured by Brier / log loss. */
  BINARY: "BINARY_PROBABILITY",
  /** A probability vector over mutually exclusive classes: 1X2. Measured by multiclass Brier / log loss / top class. */
  MULTICLASS: "MULTICLASS_PROBABILITY",
});

/** How a row came to be in the ledger — the honest recoverability label Phase G reports on. */
export const RECOVERABILITY = Object.freeze({
  /** An immutable pre-start receipt the owner graded (NFL forecast receipts, prop-settlement frozen rows). */
  EXACT_FROZEN: "EXACT_FROZEN",
  /** The owner's append-only grade log, which records the pre-start forecast it graded and where it came from. */
  OWNER_GRADED_LOG: "OWNER_GRADED_LOG",
  /** The owner settled the published value, but the published file was overwritten and has no frozen copy. */
  OWNER_SETTLED_UNFROZEN: "OWNER_SETTLED_UNFROZEN",
});

export const SETTLEMENT_STATE = Object.freeze(["PENDING", "SETTLED", "VOID", "NO_MEASUREMENT"]);

/** Directional words. PENDING / WITHDRAWN / VOID are never a LOSS. */
export const DIRECTIONAL_RESULT = Object.freeze(["WIN", "LOSS", "PUSH", "VOID", "WITHDRAWN", "PENDING"]);

/**
 * Fields that, once written, never change (B3). `settlement`, `measurement`, `withdrawal` and `provenance.notes`
 * are the only parts of a row that may evolve, and only in the directions append-only.mjs allows.
 */
export const IMMUTABLE_FIELDS = Object.freeze([
  "forecastId", "sport", "competition", "season", "eventId", "eventStart",
  "subjectType", "subjectId", "teamId", "family", "forecastKind",
  "modelId", "modelVersion", "modelStatusAtPublish",
  "publicationSurface", "receiptId", "publishedAt", "frozenAt",
  "projection", "rangeLow", "rangeHigh", "rangeCoverage",
  "probability", "probabilityType", "classProbabilities",
  "market", "direction", "categoryPrediction", "recoverability",
]);

/** Every top-level field a row carries, in canonical order (serialisation order is part of determinism). */
export const ROW_FIELDS = Object.freeze([
  "forecastId", "schemaVersion",
  "sport", "competition", "season", "eventId", "eventStart", "matchup",
  "subjectType", "subjectId", "subjectDisplay", "teamId",
  "family", "forecastKind",
  "modelId", "modelVersion", "modelStatusAtPublish",
  "publicationStatus", "publicationSurface", "receiptId", "publishedAt", "frozenAt",
  "projection", "rangeLow", "rangeHigh", "rangeCoverage",
  "probability", "probabilityType", "classProbabilities",
  "market",
  "direction", "categoryPrediction",
  "withdrawal",
  "settlement", "measurement",
  "recoverability", "provenance",
]);

export const SUBJECT_TYPES = Object.freeze(["GAME", "TEAM", "PLAYER", "BOUT"]);
export const SPORTS = Object.freeze(["NFL", "MLB", "EPL", "LIGUE_1", "UFC", "NBA"]);

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));

/**
 * Validate one row against the contract. Returns a list of problems (empty = valid). Pure.
 * The checks are the ones a reader would otherwise get wrong silently.
 */
export function validateRow(row) {
  const p = [];
  if (!row || typeof row !== "object") return ["row is not an object"];
  for (const k of ROW_FIELDS) if (!(k in row)) p.push(`missing field ${k}`);
  for (const k of Object.keys(row)) if (!ROW_FIELDS.includes(k)) p.push(`unknown field ${k}`);
  if (row.schemaVersion !== LEDGER_SCHEMA_VERSION) p.push("schemaVersion");
  if (typeof row.forecastId !== "string" || !/^fl1-[0-9a-f]{16}$/.test(row.forecastId)) p.push("forecastId shape");
  if (!SPORTS.includes(row.sport)) p.push(`sport ${row.sport}`);
  if (!SUBJECT_TYPES.includes(row.subjectType)) p.push(`subjectType ${row.subjectType}`);
  if (typeof row.eventId !== "string" || !row.eventId) p.push("eventId");
  if (typeof row.subjectId !== "string" || !row.subjectId) p.push("subjectId");
  if (typeof row.family !== "string" || !row.family) p.push("family");
  if (!PUBLIC_LEDGER_STATUSES.includes(row.publicationStatus)) p.push(`publicationStatus ${row.publicationStatus} is not a public-ledger state`);
  if (!Object.values(RECOVERABILITY).includes(row.recoverability)) p.push("recoverability");
  if (row.eventStart != null && !isIso(row.eventStart)) p.push("eventStart");
  if (row.publishedAt != null && !isIso(row.publishedAt)) p.push("publishedAt");
  // A forecast stamped at/after the event start is never of record.
  if (isIso(row.publishedAt) && isIso(row.eventStart) && !(Date.parse(row.publishedAt) < Date.parse(row.eventStart))) {
    p.push("publishedAt is not before eventStart");
  }
  switch (row.forecastKind) {
    case FORECAST_KIND.CONTINUOUS:
      if (!isNum(row.projection)) p.push("continuous row without a numeric projection");
      if (row.probability != null) p.push("continuous row carries a probability");
      if ((row.rangeLow == null) !== (row.rangeHigh == null)) p.push("half a range");
      if (isNum(row.rangeLow) && isNum(row.rangeHigh) && row.rangeLow > row.rangeHigh) p.push("range inverted");
      break;
    case FORECAST_KIND.BINARY:
      if (!isNum(row.probability) || row.probability < 0 || row.probability > 1) p.push("binary row without a probability in [0,1]");
      if (row.probabilityType !== "MODEL") p.push("binary probability is not typed MODEL");
      break;
    case FORECAST_KIND.MULTICLASS: {
      const cp = row.classProbabilities;
      if (!cp || typeof cp !== "object") { p.push("multiclass row without classProbabilities"); break; }
      const vs = Object.values(cp);
      if (!vs.every(isNum)) p.push("non-numeric class probability");
      else if (Math.abs(vs.reduce((a, b) => a + b, 0) - 1) > 0.02) p.push("class probabilities do not sum to 1");
      if (row.probabilityType !== "MODEL") p.push("multiclass probability is not typed MODEL");
      break;
    }
    default:
      p.push(`forecastKind ${row.forecastKind}`);
  }
  const s = row.settlement;
  if (!s || !SETTLEMENT_STATE.includes(s.state)) p.push("settlement.state");
  const m = row.measurement;
  if (m?.directionalResult != null && !DIRECTIONAL_RESULT.includes(m.directionalResult)) p.push("directionalResult word");
  // PENDING / WITHDRAWN are never a loss, and an unsettled row carries no score.
  if (s?.state === "PENDING" && m && (m.directionalResult === "LOSS" || m.directionalResult === "WIN" || m.absoluteError != null || m.brier != null)) {
    p.push("pending row carries a measured outcome");
  }
  if (row.publicationStatus === "WITHDRAWN" && m?.directionalResult === "LOSS") p.push("withdrawn row scored as a loss");
  // A continuous projection never gets a W/L unless the owner graded a published directional claim.
  if (row.forecastKind === FORECAST_KIND.CONTINUOUS && (m?.directionalResult === "WIN" || m?.directionalResult === "LOSS") && !m?.directionalBasis) {
    p.push("continuous row has a W/L without a published directional basis");
  }
  // Market numbers are context, typed as such: a market block never carries the model's probability field.
  if (row.market && "probability" in row.market) p.push("market block carries a bare `probability` (must be impliedProbability)");
  return p;
}
