/**
 * Stage 3A — canonical forecast-of-record helper, identity/dedupe helper and denominator-state contract.
 *
 * Semantics are the founder decisions of 2026-10-06 22:22Z (protocol/STAGE-3-FOUNDER-DECISIONS-2026-10-06.md):
 * Q1 YES · Q2 TWO · Q3 YES · Q4 HIGHER · Q5 EXCLUDE. Nothing here is a switch: there is ONE rule, so no reader can
 * choose its own. 3A ships the contract and its fixtures only; no page, reader or script imports it yet (a test pins
 * that). Readers move onto it in 3B–3E.
 *
 * WHY. #999: a public NFL reader re-read the owner's per-date files on its own and counted three wins twice (64–43
 * published, 61–43 true). Every reader that publishes a W–L, hit rate, record or graded-forecast count must ask ONE
 * rule which rows count and how.
 *
 * 1. IDENTITY (Q1, Q2, Q5) = question identity + claim/line identity + revision lineage.
 *    - Question: questionKey() = sport | eventId | subjectType | subjectId | family (the Forecast Ledger identity,
 *      lib/forecast-ledger/identity.mjs, without forecastKind). No model version, display text, publication date or
 *      file name: a re-issue, a restatement or a second dated file is the SAME question.
 *    - Claim/line: two genuinely distinct lines published at the same time for one question are two claims, each
 *      graded against its own frozen line (Q2 TWO).
 *    - Revision lineage: a later pregame version replaces the earlier one. When the owner carries an explicit
 *      `claimId`, copies with the same claimId are one claim's revisions and each claimId keeps its own latest
 *      version. Without claimId, a later publication of the question replaces everything published for it earlier.
 *    - A row missing any question field cannot be counted once, so it is not counted: it is disclosed as `unkeyed`,
 *      never a loss, never zero, and never given an inferred identity (no matchup text, no name match).
 *
 * 2. WHICH COPY COUNTS (Q1). The forecast of record is the last valid version published strictly before the ONE
 *    canonical start of the event, applied to every copy. After a postponement that is the rescheduled start, never
 *    the originally scheduled one: a copy's own `eventStart` field is not its cut-off. Earlier versions, postponed-date
 *    copies, late copies and conflicts are returned for audit and never enter a tally.
 *
 * 3. WHICH SIDE IS GRADED (Q3, Q4). Only a side frozen before the start, never one worked out afterwards:
 *    - `frozenSide` (the owner's published side) is graded; `frozenSide: "TOO_CLOSE"` is a frozen abstention and is
 *      NO_PICK. This module never decides when TOO_CLOSE applies (that threshold is a later product/model rule); it
 *      only honours the frozen word and never emits it from probabilities.
 *    - Historical NFL game-winner rows with frozen win probabilities but no frozen side (sideBasis
 *      HISTORICAL_MODEL_FAVORED, set by the adapter) grade the team with the HIGHER frozen win probability; tie mass
 *      is ignored and an exact tie is no side. Shown as "historical model-favored winner accuracy", never "our pick".
 *      The old "P(home) > 0.5 else away" rule is not approved and is not available here.
 *    - Anything else with no frozen side is NO_PICK.
 *
 * 4. DENOMINATOR STATES. Every row of record maps to exactly one OUTCOME. Only WIN and LOSS decide; PUSH, VOID,
 *    PENDING, NO_PICK and UNKNOWN are counted beside the record and never enter the hit rate. Pending is never a loss,
 *    void is never a loss, missing is never zero, nothing decided is "no record" (null), never 0–0.
 *
 * Pure: no fs, no clock, no network. Input rows are plain objects (CanonicalForecast); an adapter per owner maps its
 * rows into that shape. This module never re-grades: `finalSide` and `ownerResult` are the owner's settlement words.
 */

/** Outcome words. Only WIN and LOSS are decisive. */
export const OUTCOME = Object.freeze({
  WIN: "WIN",
  LOSS: "LOSS",
  /** The line landed exactly: neither side won. Counted, never decisive. */
  PUSH: "PUSH",
  /** The question was not answered: tie with no winner, did not play, postponed, withdrawn. Never a loss. */
  VOID: "VOID",
  /** Not settled yet. Never a loss. */
  PENDING: "PENDING",
  /** Settled, but no side was frozen to grade (no side, or a frozen TOO_CLOSE abstention). No W–L. */
  NO_PICK: "NO_PICK",
  /** The owner's state or result is missing or unreadable. Never zero, never a loss. */
  UNKNOWN: "UNKNOWN",
});

/** The denominator-state contract: which outcome words decide, and which are only shown beside the record. */
export const DENOMINATOR = Object.freeze({
  DECISIVE: Object.freeze([OUTCOME.WIN, OUTCOME.LOSS]),
  SHOWN_BESIDE: Object.freeze([OUTCOME.PUSH, OUTCOME.VOID, OUTCOME.PENDING, OUTCOME.NO_PICK, OUTCOME.UNKNOWN]),
});

/** Why a raw row is not of record. Each is disclosed as a count; none is ever a loss or a zero. */
export const EXCLUSION = Object.freeze({
  /** An earlier pregame version of a claim (or an exact duplicate). Audit/history only. */
  SUPERSEDED: "SUPERSEDED",
  /** Published at or after the canonical start. Never of record. */
  LATE: "LATE",
  /** Copies that cannot be ordered, or disagree at the same time, or whose canonical start is unresolved. */
  CONFLICT: "CONFLICT",
  /** Missing a question-identity field (Q5). Preserved in raw history, excluded from aggregates. */
  UNKEYED: "UNKEYED",
});

/** Conflict reasons (surfaced, never silently picked). */
export const CONFLICT_REASON = Object.freeze({
  COPIES_WITHOUT_PUBLISHED_AT: "COPIES_WITHOUT_PUBLISHED_AT",
  SAME_TIME_DIFFERENT_CLAIM: "SAME_TIME_DIFFERENT_CLAIM",
  PARTIAL_LINEAGE: "PARTIAL_LINEAGE",
  CANONICAL_START_DISAGREES: "CANONICAL_START_DISAGREES",
  EVENT_START_UNRESOLVED: "EVENT_START_UNRESOLVED",
});

/** The frozen abstention word (Q3). Its threshold is NOT defined in Stage 3. */
export const TOO_CLOSE = "TOO_CLOSE";

/** Where the graded side came from. */
export const SIDE_BASIS = Object.freeze({
  /** A side frozen before the start. The only basis for "our pick". */
  PUBLISHED: "PUBLISHED",
  /** A frozen TOO_CLOSE abstention: no side, NO_PICK. */
  TOO_CLOSE: "TOO_CLOSE",
  /** Q4: historical NFL game-winner row, no frozen side; the higher frozen win probability is graded. */
  HISTORICAL_MODEL_FAVORED: "HISTORICAL_MODEL_FAVORED",
  /** Nothing frozen to grade: NO_PICK. */
  NONE: "NONE",
});

/** Public wording for a record graded on SIDE_BASIS.HISTORICAL_MODEL_FAVORED (Q4). Never "our pick". */
export const HISTORICAL_MODEL_FAVORED_LABEL = "historical model-favored winner accuracy";

/** The only rows Q4 applies to. */
const HISTORICAL_MODEL_FAVORED_SCOPE = Object.freeze({ sport: "NFL", family: "nfl_game_winner" });

export const QUESTION_FIELDS = Object.freeze(["sport", "eventId", "subjectType", "subjectId", "family"]);
/** Same list as QUESTION_FIELDS (prototype name). */
export const IDENTITY_FIELDS = QUESTION_FIELDS;

const isIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const isProb = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isLine = (v) => typeof v === "number" && Number.isFinite(v);
const hasClaimId = (f) => typeof f?.claimId === "string" && f.claimId.length > 0;

/**
 * @typedef {object} CanonicalForecast
 * @property {string} sport
 * @property {string} eventId          owner's stable event id (gamePk, providerEventId, boutId…), never display text;
 *                                     a postponed game keeps its id
 * @property {string} subjectType      GAME | TEAM | PLAYER | BOUT
 * @property {string} subjectId
 * @property {string} family           e.g. nfl_game_winner, mlb_moneyline, pitcher_strikeouts
 * @property {string|null} [claimId]   revision lineage: the owner's stable id for one claim across its revisions
 * @property {number|null} [line]      the frozen line the side was taken against (claim identity, not question identity)
 * @property {string|null} [publishedAt]     when this copy was published/frozen
 * @property {string|null} [canonicalStart]  the event's ONE canonical start (the rescheduled start after a
 *                                           postponement); the same value on every copy of the event
 * @property {string|null} [eventStart]      the start this copy's file recorded (may be the original,
 *                                           pre-postponement start). Used as the cut-off only when no canonical start
 *                                           is supplied and every copy agrees on it; disclosed when it is
 * @property {string|null} [receiptId]       where this copy lives (provenance only, never identity)
 * @property {string|null} [frozenSide]      side written down before the start (HOME / AWAY / OVER / UNDER / a team),
 *                                           or "TOO_CLOSE"
 * @property {string|null} [sideBasis]       "HISTORICAL_MODEL_FAVORED" for Q4 rows only; otherwise absent
 * @property {Record<string, number>|null} [sideProbabilities]  frozen per-side probabilities, e.g. {HOME, AWAY, TIE}
 * @property {string|null} [state]        owner settlement state: PENDING | SETTLED | VOID | WITHDRAWN | NO_MEASUREMENT
 * @property {string|null} [finalSide]    owner's settled category: HOME / AWAY / OVER / UNDER / PUSH / TIE …
 * @property {string|null} [ownerResult]  owner's directional word (WIN / LOSS / PUSH) for its own frozen side
 */

/** The question identity. Throws when a field is missing: an unidentifiable row cannot be counted once. */
export function questionKey(f) {
  for (const k of QUESTION_FIELDS) {
    const v = f?.[k];
    if (typeof v !== "string" || v.length === 0) throw new Error(`forecast-of-record: ${k} is required (got ${JSON.stringify(v)})`);
    if (v.includes("|")) throw new Error(`forecast-of-record: ${k} may not contain "|"`);
  }
  return QUESTION_FIELDS.map((k) => f[k]).join("|");
}
/** Same as questionKey (prototype name). */
export const identityKey = questionKey;

/** Question + claim identity: the unit one W–L row is about. claimId when the owner carries lineage, else the line. */
export function claimKey(f) {
  const q = questionKey(f);
  if (hasClaimId(f)) return `${q}#claim=${f.claimId}`;
  if (isLine(f.line)) return `${q}#line=${f.line}`;
  return `${q}#-`;
}

const tryKey = (f) => {
  try { return questionKey(f); } catch { return null; }
};

/** Two copies make the same claim (same frozen side, same line, same frozen probabilities). */
function sameClaim(a, b) {
  if ((a.frozenSide ?? null) !== (b.frozenSide ?? null)) return false;
  if ((a.line ?? null) !== (b.line ?? null)) return false;
  const pa = a.sideProbabilities ?? null;
  const pb = b.sideProbabilities ?? null;
  if (pa == null || pb == null) return pa === pb;
  const ks = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  for (const k of ks) if (pa[k] !== pb[k]) return false;
  return true;
}

const lookupStart = (canonicalStarts, eventKey) => {
  if (!canonicalStarts) return undefined;
  return canonicalStarts instanceof Map ? canonicalStarts.get(eventKey) : canonicalStarts[eventKey];
};

/**
 * The ONE cut-off for every copy of an event (Q1).
 *   1. opts.canonicalStarts[`${sport}|${eventId}`] when the caller supplies it;
 *   2. else the copies' `canonicalStart` (must agree, or CANONICAL_START_DISAGREES);
 *   3. else the copies' own `eventStart`, only when every copy that has one agrees (no reschedule is visible). Copies
 *      that disagree mean the event moved and nobody said where to: EVENT_START_UNRESOLVED, never "take the original";
 *   4. else no cut-off (timing unverified, disclosed).
 */
function resolveCutoff(copies, canonicalStarts) {
  const eventKey = `${copies[0].sport}|${copies[0].eventId}`;
  const supplied = lookupStart(canonicalStarts, eventKey);
  if (supplied != null) {
    if (!isIso(supplied)) throw new Error(`forecast-of-record: canonicalStarts[${eventKey}] is not an ISO time`);
    return { at: Date.parse(supplied), source: "CANONICAL" };
  }
  const canon = new Set(copies.filter((c) => isIso(c.canonicalStart)).map((c) => Date.parse(c.canonicalStart)));
  if (canon.size > 1) return { conflict: CONFLICT_REASON.CANONICAL_START_DISAGREES };
  if (canon.size === 1) return { at: [...canon][0], source: "CANONICAL" };
  const own = new Set(copies.filter((c) => isIso(c.eventStart)).map((c) => Date.parse(c.eventStart)));
  if (own.size > 1) return { conflict: CONFLICT_REASON.EVENT_START_UNRESOLVED };
  if (own.size === 1) return { at: [...own][0], source: "EVENT_START" };
  return { at: null, source: "NONE" };
}

/**
 * Latest pregame version(s) of one lineage. `allowDistinctLines`: without claimId lineage, distinct lines published
 * at the same latest time are separate claims (Q2 TWO). Within one claimId they are a conflict (a claim has one line).
 */
function pickLatest(copies, allowDistinctLines) {
  if (copies.length === 1) return { record: copies, superseded: [] };
  if (copies.some((c) => !isIso(c.publishedAt))) {
    // At least one copy cannot be placed in time. Identical claims are one forecast listed twice; different claims
    // would need a guess about which was published last, so they are a conflict.
    if (copies.every((c) => sameClaim(c, copies[0]))) return { record: [copies[0]], superseded: copies.slice(1) };
    return { conflict: CONFLICT_REASON.COPIES_WITHOUT_PUBLISHED_AT };
  }
  const sorted = [...copies].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const latestAt = Date.parse(sorted[0].publishedAt);
  const tied = sorted.filter((c) => Date.parse(c.publishedAt) === latestAt);
  const earlier = sorted.slice(tied.length);
  const unique = [];
  const duplicates = [];
  for (const c of tied) (unique.some((u) => sameClaim(u, c)) ? duplicates : unique).push(c);
  if (unique.length === 1) return { record: unique, superseded: [...duplicates, ...earlier] };
  const lines = unique.map((c) => c.line);
  const distinctLines = lines.every(isLine) && new Set(lines).size === lines.length;
  if (allowDistinctLines && distinctLines) return { record: unique, superseded: [...duplicates, ...earlier] };
  return { conflict: CONFLICT_REASON.SAME_TIME_DIFFERENT_CLAIM };
}

/**
 * The identity/dedupe helper: raw owner rows (any number of copies, in any order) → the rows of record.
 * Every input row lands in exactly one of record / superseded / late / conflicts[].rows / unkeyed.
 *
 * @param {CanonicalForecast[]} rows
 * @param {{ canonicalStarts?: Record<string, string> | Map<string, string> }} [opts]
 *        canonicalStarts: `${sport}|${eventId}` → the event's canonical (rescheduled) start, from the schedule owner
 * @returns {{
 *   record: CanonicalForecast[],      one row per claim of record
 *   superseded: CanonicalForecast[],  earlier pregame versions and exact duplicates (audit only)
 *   late: CanonicalForecast[],        published at/after the canonical start (never of record)
 *   conflicts: Array<{ key: string, rows: CanonicalForecast[], reason: string }>,
 *   unkeyed: CanonicalForecast[],     missing a question-identity field (Q5: excluded, disclosed)
 *   timingUnverified: number,         records with no publishedAt or no cut-off (accepted, disclosed)
 *   cutoffFromEventStart: number      records whose cut-off came from the copies' agreed own eventStart, not a
 *                                     canonical start (disclosed: the adapter owes a canonical start)
 * }}
 */
export function selectForecastOfRecord(rows, { canonicalStarts } = {}) {
  const groups = new Map();
  const unkeyed = [];
  for (const r of rows ?? []) {
    const key = tryKey(r);
    if (key == null) { unkeyed.push(r); continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const record = [];
  const superseded = [];
  const late = [];
  const conflicts = [];
  let timingUnverified = 0;
  let cutoffFromEventStart = 0;
  for (const [key, copies] of groups) {
    const cutoff = resolveCutoff(copies, canonicalStarts);
    if ("conflict" in cutoff) { conflicts.push({ key, rows: copies, reason: cutoff.conflict }); continue; }
    const pre = [];
    for (const c of copies) {
      if (cutoff.at != null && isIso(c.publishedAt) && !(Date.parse(c.publishedAt) < cutoff.at)) late.push(c);
      else pre.push(c);
    }
    if (pre.length === 0) continue;
    const withLineage = pre.filter(hasClaimId);
    if (withLineage.length > 0 && withLineage.length !== pre.length) {
      conflicts.push({ key, rows: pre, reason: CONFLICT_REASON.PARTIAL_LINEAGE });
      continue;
    }
    const lineages = [];
    if (withLineage.length === 0) lineages.push({ key, copies: pre, allowDistinctLines: true });
    else {
      const byClaim = new Map();
      for (const c of pre) {
        if (!byClaim.has(c.claimId)) byClaim.set(c.claimId, []);
        byClaim.get(c.claimId).push(c);
      }
      for (const [claimId, cs] of byClaim) lineages.push({ key: `${key}#claim=${claimId}`, copies: cs, allowDistinctLines: false });
    }
    for (const l of lineages) {
      const pick = pickLatest(l.copies, l.allowDistinctLines);
      if ("conflict" in pick) { conflicts.push({ key: l.key, rows: l.copies, reason: pick.conflict }); continue; }
      record.push(...pick.record);
      superseded.push(...pick.superseded);
      for (const r of pick.record) {
        if (cutoff.at == null || !isIso(r.publishedAt)) timingUnverified += 1;
        if (cutoff.source === "EVENT_START") cutoffFromEventStart += 1;
      }
    }
  }
  return { record, superseded, late, conflicts, unkeyed, timingUnverified, cutoffFromEventStart };
}

/**
 * The graded side and where it came from. Never reads the outcome, never derives TOO_CLOSE.
 * @param {CanonicalForecast} f
 * @returns {{ side: string|null, basis: string }}
 */
export function sideOf(f) {
  const frozen = typeof f?.frozenSide === "string" && f.frozenSide ? f.frozenSide : null;
  if (frozen != null) {
    if (frozen.toUpperCase() === TOO_CLOSE) return { side: null, basis: SIDE_BASIS.TOO_CLOSE };
    return { side: frozen, basis: SIDE_BASIS.PUBLISHED };
  }
  const basis = f?.sideBasis ?? null;
  if (basis == null) return { side: null, basis: SIDE_BASIS.NONE };
  if (basis !== SIDE_BASIS.HISTORICAL_MODEL_FAVORED) throw new Error(`forecast-of-record: unknown sideBasis ${basis}`);
  if (f.sport !== HISTORICAL_MODEL_FAVORED_SCOPE.sport || f.family !== HISTORICAL_MODEL_FAVORED_SCOPE.family) {
    throw new Error(`forecast-of-record: sideBasis ${basis} applies only to NFL nfl_game_winner rows (got ${f.sport} ${f.family})`);
  }
  // Q4 HIGHER: the team with the higher frozen win probability. Tie mass (TIE/DRAW) is not a team and is ignored;
  // a missing probability or an exact tie gives no side.
  const p = f.sideProbabilities ?? null;
  const home = p?.HOME;
  const away = p?.AWAY;
  if (!isProb(home) || !isProb(away) || home === away) return { side: null, basis };
  return { side: home > away ? "HOME" : "AWAY", basis };
}

/** The graded side, or null (NO_PICK). */
export function publishedSide(f) {
  return sideOf(f).side;
}

/**
 * One forecast's outcome under the contract.
 * @param {CanonicalForecast} f
 */
export function outcomeOf(f) {
  const state = typeof f?.state === "string" ? f.state.toUpperCase() : null;
  if (state == null || state === "") return OUTCOME.UNKNOWN;
  if (state === "PENDING") return OUTCOME.PENDING;
  if (state === "VOID" || state === "WITHDRAWN") return OUTCOME.VOID;
  if (state === "NO_MEASUREMENT") return OUTCOME.UNKNOWN;
  if (state !== "SETTLED") return OUTCOME.UNKNOWN;
  const fin = typeof f.finalSide === "string" && f.finalSide ? f.finalSide.toUpperCase() : null;
  if (fin === "TIE") return OUTCOME.VOID; // a game with no winner answers no "who wins" question, pick or not
  const { side, basis } = sideOf(f);
  if (side == null) return OUTCOME.NO_PICK;
  if (fin === "PUSH") return OUTCOME.PUSH;
  if (fin != null) return fin === String(side).toUpperCase() ? OUTCOME.WIN : OUTCOME.LOSS;
  // No settled category: only the owner's own word for its OWN frozen side may stand in.
  const w = typeof f.ownerResult === "string" ? f.ownerResult.toUpperCase() : null;
  if (basis === SIDE_BASIS.PUBLISHED && (w === "WIN" || w === "LOSS" || w === "PUSH")) return w;
  return OUTCOME.UNKNOWN;
}

const FIELD = Object.freeze({
  [OUTCOME.WIN]: "win", [OUTCOME.LOSS]: "loss", [OUTCOME.PUSH]: "push", [OUTCOME.VOID]: "void",
  [OUTCOME.PENDING]: "pending", [OUTCOME.NO_PICK]: "noPick", [OUTCOME.UNKNOWN]: "unknown",
});

/**
 * The denominator helper over rows of record. Counts every outcome; only WIN + LOSS decide; hitRate is null (never 0)
 * when nothing decided. `decidedByBasis` keeps "our pick" (PUBLISHED) apart from Q4's historical model-favored rows;
 * `tooClose` is the part of noPick that is a frozen abstention.
 * @param {CanonicalForecast[]} rows
 */
export function tally(rows) {
  const c = { win: 0, loss: 0, push: 0, void: 0, pending: 0, noPick: 0, unknown: 0 };
  const decidedByBasis = { [SIDE_BASIS.PUBLISHED]: 0, [SIDE_BASIS.HISTORICAL_MODEL_FAVORED]: 0 };
  let tooClose = 0;
  for (const r of rows ?? []) {
    const o = outcomeOf(r);
    c[FIELD[o]] += 1;
    const { basis } = sideOf(r);
    if (o === OUTCOME.WIN || o === OUTCOME.LOSS) decidedByBasis[basis] += 1;
    if (o === OUTCOME.NO_PICK && basis === SIDE_BASIS.TOO_CLOSE) tooClose += 1;
  }
  const decided = c.win + c.loss;
  return { ...c, decided, forecasts: (rows ?? []).length, hitRate: decided > 0 ? c.win / decided : null, tooClose, decidedByBasis };
}

/**
 * Which wording a decided record may carry: "PUBLISHED" (our pick), "HISTORICAL_MODEL_FAVORED" (use
 * HISTORICAL_MODEL_FAVORED_LABEL), "MIXED" (must be split before it is labelled), or null (nothing decided).
 */
export function recordBasis(t) {
  const pub = t?.decidedByBasis?.[SIDE_BASIS.PUBLISHED] ?? 0;
  const hist = t?.decidedByBasis?.[SIDE_BASIS.HISTORICAL_MODEL_FAVORED] ?? 0;
  if (pub > 0 && hist > 0) return "MIXED";
  if (pub > 0) return SIDE_BASIS.PUBLISHED;
  if (hist > 0) return SIDE_BASIS.HISTORICAL_MODEL_FAVORED;
  return null;
}

/**
 * The one call a reader makes: raw owner rows (any number of copies) → the public record, with every exclusion
 * disclosed as a count.
 * @param {CanonicalForecast[]} rows
 * @param {{ canonicalStarts?: Record<string, string> | Map<string, string> }} [opts]
 */
export function recordOf(rows, opts = {}) {
  const sel = selectForecastOfRecord(rows, opts);
  return {
    ...tally(sel.record),
    excluded: {
      superseded: sel.superseded.length,
      late: sel.late.length,
      conflicts: sel.conflicts.length,
      conflictRows: sel.conflicts.reduce((n, c) => n + c.rows.length, 0),
      unkeyed: sel.unkeyed.length,
    },
    timingUnverified: sel.timingUnverified,
    cutoffFromEventStart: sel.cutoffFromEventStart,
  };
}

/** "W–L" plus a push count when there is one. Null when nothing decided and nothing pushed: never "0–0". */
export function formatRecord(t) {
  if (!t || (t.decided === 0 && !t.push)) return null;
  return `${t.win}–${t.loss}${t.push ? `–${t.push}` : ""}`;
}
