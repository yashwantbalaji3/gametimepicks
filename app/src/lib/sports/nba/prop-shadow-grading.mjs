/**
 * NBA PLAYER SHADOW GRADING + APPEND-ONLY PROP-GRADE LEDGER — PURE, no I/O, deterministic. PRIVATE research only.
 *
 * WHAT IT GRADES. The official v0.1 player rows frozen before tip (`nbaOfficialSnapshot`, official-snapshot.mjs;
 * families pts, reb, ast, threePm, pra, ptsReb, ptsAst) against the player's line in the final box score. For each
 * row it records the frozen median, the actual stat, the absolute error, whether the actual landed at or below the
 * frozen median or above it, and whether the actual fell inside the frozen p10–p90 band when the receipt carries one.
 *
 * WHAT IT IS NOT. No price, no odds and no sportsbook line is read or written. The only "line" is the frozen median
 * itself, run through `gradeNbaPlayerProp` (prop-settlement.mjs) so this module and the prop grader read a stat in
 * exactly one way. That result is labelled SYNTHETIC_MEDIAN_LINE and `notAPrice: true`: it is not a price, not a
 * pick and not a product. This is descriptive shadow evidence. It promotes nothing and supports no claim.
 *
 * STATES (a row is never read as 0 and never as a miss when there is nothing to measure):
 *   GRADED              FINAL score + FINAL box score + the player's integer line.
 *   NO_MEASUREMENT      the player is not in the final box score, is flagged DNP, or logged 0 minutes.
 *   PENDING_FINAL       the finals record holds no final for the event yet.
 *   PENDING_BOXSCORE    a final exists, but no FINAL box score with player rows is stored yet.
 *   VOID_PENDING_REVIEW a source defect the prop grader quarantines (non-integer stat, tied final, ...).
 * HOLDS (no ledger entry is appended; nothing is graded): a finals-record `conflicts` entry (FINAL_UNDER_REVIEW),
 * an explicit release-owner HOLD (`NBA_PROP_GRADE_HOLDS`), a final whose team ids disagree with the forecast, or a
 * box score whose summed player points disagree with the recorded final. A disputed final is never graded.
 *
 * LEDGER. One JSON object per line (JSONL), only ever appended, keyed by (forecast date, event, player, family) —
 * the family ledgers' lineage rules (experimental-grading-ledger.mjs): INITIAL | PENDING_RESOLVED | CORRECTION with
 * `supersedes` = the earlier seq. An identical re-grade appends nothing, a pending row that stays pending appends
 * nothing, a recorded state is never downgraded to pending, and a changed measurement appends a CORRECTION with its
 * cause and the old and new actual. The frozen row is write-once: a key whose frozen numbers changed is refused.
 * The ONE writer is app/scripts/nba/grade-nba-player-props.mjs (settlement-contract.test.mjs pins it).
 */
import { canonicalJson } from "./forecast-receipt.mjs";
import { gradeNbaPlayerProp, NBA_PROP_SETTLEMENT_VERSION, PROP_FAMILIES, PROP_REASON } from "./prop-settlement.mjs";

export const PROP_SHADOW_GRADER_VERSION = "nba-prop-shadow-grader-1";
export const PROP_SHADOW_SCHEMA = "nba-prop-shadow-grade@1";
/** Ledger location under data/internal/research/nba/ (mirrors top-boards/<family>/ledger.json). */
export const PROP_GRADES_DIR = "prop-grades";
export const PROP_GRADE_LEDGER_FILE = "ledger.jsonl";
export const PROP_SHADOW_FAMILY = "v0.1";
export const SYNTHETIC_MEDIAN_LINE = "SYNTHETIC_MEDIAN_LINE";

export const SHADOW_STATE = Object.freeze({
  GRADED: "GRADED",
  NO_MEASUREMENT: "NO_MEASUREMENT",
  PENDING_FINAL: "PENDING_FINAL",
  PENDING_BOXSCORE: "PENDING_BOXSCORE",
  VOID_PENDING_REVIEW: "VOID_PENDING_REVIEW",
});
const PENDING = new Set([SHADOW_STATE.PENDING_FINAL, SHADOW_STATE.PENDING_BOXSCORE]);
export const isPendingState = (s) => PENDING.has(s);

export const HOLD = Object.freeze({
  FINAL_UNDER_REVIEW: "FINAL_UNDER_REVIEW",
  HELD: "HELD",
  TEAM_ID_MISMATCH: "TEAM_ID_MISMATCH",
  BOXSCORE_POINTS_DISAGREE: "BOXSCORE_POINTS_DISAGREE",
});

/**
 * Explicit release-owner holds. 401901822 (2026-10-17): the finals record holds 117-98 and a later capture observed
 * 116-98 (its `conflicts` entry, observed 2026-10-18). The recorded final stands in the record, but it is disputed,
 * so no player row of that game is graded until the founder decides the restatement.
 */
export const NBA_PROP_GRADE_HOLDS = Object.freeze([
  Object.freeze({ providerEventId: "401901822", reason: "release-owner HOLD: recorded final 117-98 disputed by an observed 116-98 (finals-record conflicts); never graded until the restatement is decided" }),
]);

export const LINEAGE = Object.freeze({ INITIAL: "INITIAL", PENDING_RESOLVED: "PENDING_RESOLVED", CORRECTION: "CORRECTION" });
export const CORRECTION_CAUSE = Object.freeze({ BOXSCORE_CORRECTION: "BOXSCORE_CORRECTION", FINAL_CHANGED: "FINAL_CHANGED", GRADER_CHANGE: "GRADER_CHANGE", OTHER: "OTHER" });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pointAt = (dist, q) => {
  const p = (dist?.points ?? []).find((x) => x.q === q);
  return p && isNum(p.v) ? p.v : null;
};

/** Ledger key: one forecast date's frozen row for one (event, player, family). */
export const propGradeKey = ({ date, eventId, playerId, family }) => `${date ?? ""}|${eventId}|${playerId}|${family}`;

/**
 * Every gradable frozen row of one official snapshot (families in PROP_FAMILIES order; minutes is not graded).
 * @param {object} snapshot nbaOfficialSnapshot(...) output
 * @param {{ date: string, forecastFile?: string|null }} ctx
 */
export function frozenShadowRows(snapshot, { date, forecastFile = null } = {}) {
  const official = (snapshot?.sources ?? []).find((s) => s.role === "OFFICIAL") ?? null;
  const rows = [];
  for (const p of snapshot?.players ?? []) {
    for (const family of Object.keys(PROP_FAMILIES)) {
      const f = p.families?.[family];
      if (!f || !isNum(f.median)) continue;
      const row = {
        date, eventId: String(snapshot.eventId), playerId: String(p.playerId), family,
        frozen: {
          median: f.median,
          p10: pointAt(f.distribution, 0.1),
          p90: pointAt(f.distribution, 0.9),
          mean: isNum(f.expected) ? f.expected : null,
          modelVersion: f.modelVersion ?? null,
          receiptPayloadSha256: official?.inputRef ?? null,
          frozenAt: snapshot.frozenAt ?? null,
          lockAt: snapshot.lockAt ?? null,
          participation: p.participation ?? null,
          expectedMinutes: isNum(p.expectedMinutes) ? p.expectedMinutes : null,
          displayName: p.displayName ?? null,
          team: p.team ?? null,
          side: p.side ?? null,
          forecastFile,
        },
      };
      rows.push({ key: propGradeKey(row), ...row });
    }
  }
  return rows;
}

/**
 * Events that must not be graded, with why: explicit holds, then the finals record's `conflicts`.
 * @returns {Map<string, { hold: string, reason: string }>}
 */
export function propGradeHolds({ finalsRecord = null, explicitHolds = NBA_PROP_GRADE_HOLDS } = {}) {
  const out = new Map();
  for (const h of explicitHolds ?? []) out.set(String(h.providerEventId), { hold: HOLD.HELD, reason: h.reason });
  for (const c of finalsRecord?.conflicts ?? []) {
    const id = String(c.providerEventId);
    const why = `finals-record conflict: recorded ${c.recorded?.ftHome}-${c.recorded?.ftAway}, observed ${c.observed?.ftHome}-${c.observed?.ftAway} (${c.observedAt ?? "?"})`;
    if (out.has(id)) out.set(id, { ...out.get(id), reason: `${out.get(id).reason}; ${why}` });
    else out.set(id, { hold: HOLD.FINAL_UNDER_REVIEW, reason: why });
  }
  return out;
}

/**
 * Grade one frozen row against the grader input `nbaPropResult` builds (prop-settlement-source.mjs). Never throws.
 * The frozen median is the synthetic line; the result is a measurement, never a price.
 */
export function gradeShadowRow(row, result) {
  const median = row?.frozen?.median;
  const g = gradeNbaPlayerProp({ family: row?.family, side: "OVER", line: median, providerAthleteId: row?.playerId, eventId: row?.eventId }, result);
  const base = { code: g.code, reason: g.reason, measurement: null };
  if (g.outcome === "NO_MEASUREMENT") return { state: SHADOW_STATE.NO_MEASUREMENT, ...base, measurement: { actual: null, minutes: g.minutes } };
  if (g.outcome === "VOID_PENDING_REVIEW") {
    if (g.code === PROP_REASON.NO_FINAL_BOXSCORE) return { state: SHADOW_STATE.PENDING_BOXSCORE, ...base };
    if (g.code === PROP_REASON.NOT_FINAL && result?.status === "PENDING") return { state: SHADOW_STATE.PENDING_FINAL, ...base };
    return { state: SHADOW_STATE.VOID_PENDING_REVIEW, ...base };
  }
  const actual = g.finalStat;
  const { p10, p90 } = row.frozen;
  return {
    state: SHADOW_STATE.GRADED,
    ...base,
    measurement: {
      actual,
      components: g.components,
      minutes: g.minutes,
      absError: Math.abs(actual - median),
      vsMedian: actual <= median ? "AT_OR_BELOW_MEDIAN" : "ABOVE_MEDIAN",
      band80: isNum(p10) && isNum(p90) ? { p10, p90, covered: actual >= p10 && actual <= p90 } : null,
      syntheticMedianLine: { label: SYNTHETIC_MEDIAN_LINE, line: median, side: "OVER", outcome: g.outcome, notAPrice: true },
    },
  };
}

/* ─────────────────────────── ledger ─────────────────────────── */

/** Parse JSONL text. Blank trailing line allowed; any unparseable line is an error (the writer refuses). */
export function parsePropLedger(text) {
  const entries = [];
  const errors = [];
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, i) => {
    if (line.trim() === "") { if (i !== lines.length - 1) errors.push(`line ${i + 1}: blank line inside the ledger`); return; }
    try { entries.push(JSON.parse(line)); } catch (e) { errors.push(`line ${i + 1}: ${e.message}`); }
  });
  return { entries, errors };
}

/** The on-disk text of entries: one compact JSON object per line, newline-terminated. */
export const propLedgerLines = (entries) => (entries ?? []).map((e) => `${JSON.stringify(e)}\n`).join("");

/** Latest entry per key (the ledger's CURRENT view). */
export function currentPropEntries(entries) {
  const m = new Map();
  for (const e of entries ?? []) m.set(e.key, e);
  return m;
}

/** What may not move without a new entry. Reason text and input file paths are excluded (wording is not a grade). */
const body = (x) => canonicalJson({ state: x.state, code: x.code ?? null, frozen: x.frozen ?? null, measurement: x.measurement ?? null });

/**
 * Append graded items. Each item: { key, date, eventId, playerId, family, frozen, state, code, reason, measurement,
 * inputs: { finalSource, finalState, final: {ftHome, ftAway}|null, boxscoreSource, boxscoreFile, boxscoreHash, ... } }.
 * Returns { appended, frozenMismatches } — `appended` are NEW entries only (the caller appends their lines).
 */
export function appendPropShadowGrades(entries, items, { gradedAt, graderVersion = PROP_SHADOW_GRADER_VERSION }) {
  const latest = currentPropEntries(entries);
  let seq = (entries ?? []).reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
  const appended = [];
  const frozenMismatches = [];
  for (const it of items ?? []) {
    const key = it.key ?? propGradeKey(it);
    const prev = latest.get(key) ?? null;
    if (prev && canonicalJson(prev.frozen) !== canonicalJson(it.frozen)) { frozenMismatches.push({ key, seq: prev.seq }); continue; }
    if (prev && body(prev) === body(it)) continue;
    // A recorded state is never downgraded to pending, and a pending row that stays pending appends nothing.
    if (prev && isPendingState(it.state)) continue;
    const lineageReason = !prev ? LINEAGE.INITIAL : isPendingState(prev.state) ? LINEAGE.PENDING_RESOLVED : LINEAGE.CORRECTION;
    let cause = null;
    if (lineageReason === LINEAGE.CORRECTION) {
      const ph = prev.inputs?.boxscoreHash ?? null, nh = it.inputs?.boxscoreHash ?? null;
      const pf = prev.inputs?.final ?? null, nf = it.inputs?.final ?? null;
      if (ph && nh && ph !== nh) cause = CORRECTION_CAUSE.BOXSCORE_CORRECTION;
      else if (pf && nf && (pf.ftHome !== nf.ftHome || pf.ftAway !== nf.ftAway)) cause = CORRECTION_CAUSE.FINAL_CHANGED;
      else if (prev.graderVersion !== graderVersion || prev.propGraderVersion !== NBA_PROP_SETTLEMENT_VERSION) cause = CORRECTION_CAUSE.GRADER_CHANGE;
      else cause = CORRECTION_CAUSE.OTHER;
    }
    seq += 1;
    const entry = {
      schema: PROP_SHADOW_SCHEMA, seq, key,
      date: it.date, eventId: String(it.eventId), playerId: String(it.playerId), family: it.family,
      gradedAt, graderVersion, propGraderVersion: NBA_PROP_SETTLEMENT_VERSION,
      dataClass: "PRIVATE_RESEARCH", productEligible: false, notAPrice: true,
      state: it.state, code: it.code ?? null, reason: it.reason ?? null,
      frozen: it.frozen, measurement: it.measurement ?? null,
      inputs: it.inputs ?? null,
      lineageReason, supersedes: prev ? prev.seq : null, cause,
      ...(lineageReason === LINEAGE.CORRECTION ? {
        correction: {
          oldState: prev.state, newState: it.state,
          oldActual: prev.measurement?.actual ?? null, newActual: it.measurement?.actual ?? null,
          oldBoxscoreHash: prev.inputs?.boxscoreHash ?? null, newBoxscoreHash: it.inputs?.boxscoreHash ?? null,
        },
      } : {}),
    };
    appended.push(entry);
    latest.set(key, entry);
  }
  return { appended, frozenMismatches };
}

/**
 * Post-write guard over the ledger TEXT. BEFORE is a byte-exact prefix of AFTER; every line parses; seqs run 1, 2, 3 …;
 * every entry is private, not product-eligible and not a price; one INITIAL per key; every later entry of a key
 * supersedes the previous one; a recorded state is never followed by a pending one; the frozen row never changes.
 */
export function propLedgerAppendOnlyViolations({ beforeText = "", afterText = "" }) {
  const v = [];
  const b = beforeText ?? "", a = afterText ?? "";
  if (!a.startsWith(b)) v.push("the ledger before this run is not an unchanged prefix of the ledger after it");
  const { entries, errors } = parsePropLedger(a);
  v.push(...errors);
  const seen = new Map();
  entries.forEach((e, i) => {
    if (e.seq !== i + 1) v.push(`line ${i + 1}: seq ${e.seq}, expected ${i + 1}`);
    if (e.schema !== PROP_SHADOW_SCHEMA) v.push(`seq ${e.seq}: schema ${JSON.stringify(e.schema)}`);
    if (e.dataClass !== "PRIVATE_RESEARCH" || e.productEligible !== false || e.notAPrice !== true) v.push(`seq ${e.seq}: must be PRIVATE_RESEARCH, productEligible false, notAPrice true`);
    if (e.key !== propGradeKey(e)) v.push(`seq ${e.seq}: key ${e.key} does not match its fields`);
    const prev = seen.get(e.key);
    if (e.lineageReason === LINEAGE.INITIAL && prev) v.push(`seq ${e.seq}: second INITIAL for ${e.key}`);
    if (e.lineageReason !== LINEAGE.INITIAL && (!prev || e.supersedes !== prev.seq)) v.push(`seq ${e.seq} (${e.lineageReason}) does not supersede the previous entry of ${e.key}`);
    if (prev && isPendingState(e.state)) v.push(`seq ${e.seq}: ${e.key} went back to ${e.state}`);
    if (prev && canonicalJson(prev.frozen) !== canonicalJson(e.frozen)) v.push(`seq ${e.seq}: frozen row of ${e.key} changed`);
    seen.set(e.key, e);
  });
  return v;
}

/** Current recorded (non-pending) entries, held events excluded — what any descriptive summary reads. */
export function currentShadowGrades(entries, { held = new Map() } = {}) {
  return [...currentPropEntries(entries).values()].filter((e) => !isPendingState(e.state) && !held.has(String(e.eventId)));
}

/**
 * Descriptive counts per family over current entries. No ratio here is a claim: n is printed beside every rate, and
 * NO_MEASUREMENT / VOID rows are counted beside the graded ones, never inside a denominator.
 */
export function summariseShadowGrades(entries) {
  const out = {};
  for (const family of Object.keys(PROP_FAMILIES)) out[family] = { graded: 0, noMeasurement: 0, voids: 0, absErrorSum: 0, atOrBelowMedian: 0, band80N: 0, band80Covered: 0 };
  for (const e of entries ?? []) {
    const s = out[e.family];
    if (!s) continue;
    if (e.state === SHADOW_STATE.NO_MEASUREMENT) { s.noMeasurement += 1; continue; }
    if (e.state !== SHADOW_STATE.GRADED) { s.voids += 1; continue; }
    s.graded += 1;
    s.absErrorSum += e.measurement.absError;
    if (e.measurement.vsMedian === "AT_OR_BELOW_MEDIAN") s.atOrBelowMedian += 1;
    if (e.measurement.band80) { s.band80N += 1; if (e.measurement.band80.covered) s.band80Covered += 1; }
  }
  for (const s of Object.values(out)) {
    s.mae = s.graded ? s.absErrorSum / s.graded : null;
    delete s.absErrorSum;
  }
  return out;
}
