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

/** Publication states (B4). Only PUBLISHED and WITHDRAWN rows are public forecasts. */
export const PUBLICATION_STATUS = Object.freeze(["PUBLISHED", "WITHDRAWN", "WITHHELD", "UNAVAILABLE", "SHADOW", "RESEARCH_ONLY", "NOT_SERVED"]);
/** The states a PUBLIC forecast carries. WITHHELD / UNAVAILABLE / SHADOW / RESEARCH_ONLY / NOT_SERVED are not public forecasts. */
export const PUBLIC_LEDGER_STATUSES = Object.freeze(["PUBLISHED", "WITHDRAWN"]);
/**
 * The states a row in the ledger FILE may carry: the public states, plus NOT_SERVED (amendment 1). A NOT_SERVED row is
 * kept as the internal record of a forecast that was graded but never publicly served; because it is not PUBLISHED,
 * every reader that counts published forecasts excludes it (fail closed).
 */
export const LEDGER_FILE_STATUSES = Object.freeze(["PUBLISHED", "WITHDRAWN", "NOT_SERVED"]);

/**
 * DATED CONTRACT AMENDMENTS to forecast-ledger@1. The schema string is unchanged (every existing row stays valid); each
 * amendment is additive, listed here and in the ledger manifest, never a silent addition.
 */
export const CONTRACT_AMENDMENTS = Object.freeze([
  Object.freeze({
    id: "forecast-ledger@1/amendment-1",
    date: "2026-10-10",
    authority: "Founder decision 2 (2026-10-10, TRUTH-001 Stage B); ledger-owner review 2026-10-10",
    change: "Publication status NOT_SERVED: a graded forecast whose revision no Production deployment served before the start. Allowed only as PUBLISHED → NOT_SERVED, only for a forecastId a committed, approved restatement log lists. Not a public forecast: excluded from published counts and verified performance; never a loss.",
  }),
  Object.freeze({
    id: "forecast-ledger@1/amendment-2",
    date: "2026-10-10",
    authority: "Founder decision 2 (2026-10-10, game 824424): a reusable, versioned distinction between scheduled start, verified actual first pitch, generation, freeze and verified public publication time",
    change: "Optional row field `timing` (schema forecast-ledger-timing@1). Absent on every existing row (missing stays missing). When it carries a VERIFIED actual start and a VERIFIED served time, the of-record rule is: generated and served before the earliest instant of the actual start — instead of publishedAt < eventStart (the scheduled start). eventStart and every identity are unchanged; `timing` is immutable once present and can be added to an existing row only by an approved restatement that lists it.",
  }),
]);

/**
 * AMENDMENT 2 · TIMING. Optional; validated when present. Five instants, never conflated:
 *   scheduledStart   the event's scheduled start (equals eventStart, which stays the identity's start)
 *   actualStart      the VERIFIED actual first pitch / kickoff as an interval { from, to, basis, source } — the true
 *                    start lies in [from, to] (a recorded pitch event is later than the pitch, so `from` precedes it)
 *   generatedAt      when the model produced the forecast
 *   frozenAt         when the forecast was frozen, if it was
 *   servedAt         VERIFIED public publication: when a READY Production deployment first served these bytes
 *   publicationEvidence { kind, deploymentId, commitSha, readyAt, servedHash, source }
 */
export const TIMING_SCHEMA = "forecast-ledger-timing@1";
export const OPTIONAL_ROW_FIELDS = Object.freeze(["timing"]);

export function validateTiming(t, row) {
  const p = [];
  if (t == null) return p;
  if (t.schema !== TIMING_SCHEMA) p.push("timing.schema");
  for (const k of ["scheduledStart", "generatedAt", "frozenAt", "servedAt"]) if (t[k] != null && !isIso(t[k])) p.push(`timing.${k}`);
  if (t.scheduledStart != null && row?.eventStart != null && t.scheduledStart !== row.eventStart) p.push("timing.scheduledStart differs from eventStart");
  const a = t.actualStart;
  if (a != null) {
    if (!isIso(a.from) || !isIso(a.to) || Date.parse(a.from) > Date.parse(a.to)) p.push("timing.actualStart interval");
    if (typeof a.basis !== "string" || !a.basis) p.push("timing.actualStart.basis");
  }
  if (t.servedAt != null) {
    const e = t.publicationEvidence;
    if (!e || typeof e.kind !== "string" || !isIso(e.readyAt)) p.push("timing.servedAt without publication evidence");
  }
  return p;
}

/**
 * The of-record rule. With a verified actual start AND a verified served time, the forecast is of record when it was
 * generated and served before the earliest instant of the actual start. Otherwise the original rule: published before
 * the scheduled start. Never both, never a special case.
 */
/** Whether a row carries the VERIFIED timing the actual-start rule needs: an actual start, a served time AND its evidence. */
export const hasVerifiedTiming = (row) => {
  const t = row?.timing;
  return !!(t?.actualStart && isIso(t.actualStart.from) && isIso(t.servedAt) && isIso(t.publicationEvidence?.readyAt) && isIso(t.generatedAt ?? row.publishedAt));
};

export function ofRecordBeforeStart(row) {
  const t = row?.timing;
  if (hasVerifiedTiming(row)) {
    const start = Date.parse(t.actualStart.from);
    return Date.parse(t.servedAt) < start && Date.parse(t.generatedAt ?? row.publishedAt) < start;
  }
  return !(isIso(row?.publishedAt) && isIso(row?.eventStart)) || Date.parse(row.publishedAt) < Date.parse(row.eventStart);
}

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
/**
 * Amendment 2: OPTIONAL fields that are immutable once present (absent on rows that predate them). Adding one to an
 * existing row, or changing it, needs an approved restatement that lists it. Enforced by append-only.mjs beside
 * IMMUTABLE_FIELDS.
 */
export const OPTIONAL_IMMUTABLE_FIELDS = Object.freeze(["timing"]);

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
  for (const k of Object.keys(row)) if (!ROW_FIELDS.includes(k) && !OPTIONAL_ROW_FIELDS.includes(k)) p.push(`unknown field ${k}`);
  p.push(...validateTiming(row.timing, row));
  if (row.schemaVersion !== LEDGER_SCHEMA_VERSION) p.push("schemaVersion");
  if (typeof row.forecastId !== "string" || !/^fl1-[0-9a-f]{16}$/.test(row.forecastId)) p.push("forecastId shape");
  if (!SPORTS.includes(row.sport)) p.push(`sport ${row.sport}`);
  if (!SUBJECT_TYPES.includes(row.subjectType)) p.push(`subjectType ${row.subjectType}`);
  if (typeof row.eventId !== "string" || !row.eventId) p.push("eventId");
  if (typeof row.subjectId !== "string" || !row.subjectId) p.push("subjectId");
  if (typeof row.family !== "string" || !row.family) p.push("family");
  if (!LEDGER_FILE_STATUSES.includes(row.publicationStatus)) p.push(`publicationStatus ${row.publicationStatus} is not a public-ledger state`);
  if (!Object.values(RECOVERABILITY).includes(row.recoverability)) p.push("recoverability");
  if (row.eventStart != null && !isIso(row.eventStart)) p.push("eventStart");
  if (row.publishedAt != null && !isIso(row.publishedAt)) p.push("publishedAt");
  // A forecast stamped at/after the event start is never of record (amendment 2: the verified actual start, when the
  // row carries verified timing).
  if (!ofRecordBeforeStart(row)) p.push(hasVerifiedTiming(row) ? "not generated and served before the verified actual start" : "publishedAt is not before eventStart");
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
