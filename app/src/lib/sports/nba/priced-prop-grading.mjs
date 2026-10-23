/**
 * NBA PRICED-LINE GRADING + APPEND-ONLY PRICED PROP-GRADE LEDGER — PURE, no I/O, deterministic. PRIVATE research only.
 *
 * WHAT IT GRADES. Real sportsbook lines captured under a founder-approved receipt (the `gtp.nba.prop-price@1` records in
 * data/internal/research/odds/nba/props/*.json, lib/sports/odds/nba-props/parse.mjs) against the player's line in the
 * final box score. Each record is graded on BOTH sides at the book's own line, by the ONE NBA player-prop grader
 * (prop-settlement.mjs `gradeNbaPlayerProp`), so this ledger, the v0.1 shadow ledger, Top Board grading and the Parlay
 * Lab settler read a player's stat in exactly one way.
 *
 * WHAT IT IS NOT. Not a pick, not a recommendation, not a product record, not model evidence on its own. It carries no
 * model number: comparing a model with these lines is a separate, descriptive read. `notAPick: true` on every entry.
 * Nothing here enters a public record or a promotion decision automatically (the prop-settlement gate needs a
 * founder-approved promotion record; prop-settlement-readiness.mjs).
 *
 * STATES and HOLDS are PR 1169's, unchanged (prop-shadow-grading.mjs):
 *   GRADED · NO_MEASUREMENT (absent / DNP / 0 min — never a loss) · PENDING_FINAL · PENDING_BOXSCORE ·
 *   VOID_PENDING_REVIEW. Held events (a finals-record conflict such as D4 401901822, an explicit release-owner HOLD,
 *   a box score whose summed points disagree with the recorded final) are not graded and get no entry.
 *
 * LEDGER. JSONL, only ever appended, keyed by (event, player, family, book, recordId). The `priced` block (line, both
 * prices, book, capture time, record id, source file) is WRITE-ONCE: a key whose priced block changed is refused.
 * Lineage INITIAL | PENDING_RESOLVED | CORRECTION with `supersedes`; an identical re-grade appends nothing; a pending
 * row that stays pending appends nothing; a recorded state is never downgraded to pending; a changed measurement
 * appends a CORRECTION with its cause and the old and new actual.
 * STORAGE (founder decision, 2026-10-22): this ledger holds real sportsbook lines and prices, so it lives ONLY in private
 * storage outside every repository (<private dir>/nba/priced-props/ledger.jsonl; lib/ops/private-data-dir.mjs). It is
 * never committed. The ONE writer is app/scripts/nba/grade-nba-priced-props.mjs (priced-prop-grading.test.mjs pins it).
 */
import { canonicalJson } from "./forecast-receipt.mjs";
import { gradeNbaPlayerProp, NBA_PROP_SETTLEMENT_VERSION, PROP_FAMILIES, PROP_REASON } from "./prop-settlement.mjs";
import { CORRECTION_CAUSE, LINEAGE, SHADOW_STATE, isPendingState, parsePropLedger, propLedgerLines } from "./prop-shadow-grading.mjs";

export const PRICED_GRADER_VERSION = "nba-priced-prop-grader-1";
export const PRICED_SCHEMA = "nba-priced-prop-grade@1";
/** Ledger directory name inside the PRIVATE data directory (never under the repository). */
export const PRICED_DIR = "priced-props";
export const PRICED_LEDGER_FILE = "ledger.jsonl";
export const PRICE_RECORD_SCHEMA = "gtp.nba.prop-price@1";
export { parsePropLedger as parsePricedLedger, propLedgerLines as pricedLedgerLines };

export const pricedKey = ({ eventId, playerId, family, book, recordId }) => `${eventId}|${playerId}|${family}|${book}|${recordId}`;

/** A price record → the write-once identity + priced block a ledger row carries. Null for anything that is not one. */
export function pricedRow(record, { sourceFile = null } = {}) {
  if (!record || record.schema !== PRICE_RECORD_SCHEMA || !PROP_FAMILIES[record.family]) return null;
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  if (!ok(record.line) || !Number.isInteger(record.overAmerican) || !Number.isInteger(record.underAmerican) || !record.recordId || !record.book) return null;
  const row = {
    eventId: String(record.eventId), playerId: String(record.providerAthleteId), family: record.family,
    book: String(record.book), recordId: String(record.recordId),
    priced: {
      line: record.line, overAmerican: record.overAmerican, underAmerican: record.underAmerican,
      book: String(record.book), capturedAt: record.capturedAt ?? null, fetchedAt: record.fetchedAt ?? null,
      recordId: String(record.recordId), sourceFile,
    },
  };
  return { ...row, key: pricedKey(row) };
}

/** Grade one priced row on both sides. Never throws. Same state mapping as the v0.1 shadow grader. */
export function gradePricedRow(row, result) {
  const leg = (side) => ({ family: row?.family, side, line: row?.priced?.line, providerAthleteId: row?.playerId, eventId: row?.eventId });
  const over = gradeNbaPlayerProp(leg("OVER"), result);
  const under = gradeNbaPlayerProp(leg("UNDER"), result);
  const base = { code: over.code, reason: over.reason, measurement: null };
  if (over.outcome === "NO_MEASUREMENT") return { state: SHADOW_STATE.NO_MEASUREMENT, ...base, measurement: { actual: null, minutes: over.minutes, bookRuleUnknown: true } };
  if (over.outcome === "VOID_PENDING_REVIEW") {
    if (over.code === PROP_REASON.NO_FINAL_BOXSCORE) return { state: SHADOW_STATE.PENDING_BOXSCORE, ...base };
    if (over.code === PROP_REASON.NOT_FINAL && result?.status === "PENDING") return { state: SHADOW_STATE.PENDING_FINAL, ...base };
    return { state: SHADOW_STATE.VOID_PENDING_REVIEW, ...base };
  }
  return {
    state: SHADOW_STATE.GRADED,
    ...base,
    measurement: { actual: over.finalStat, components: over.components, minutes: over.minutes, line: row.priced.line, over: over.outcome, under: under.outcome },
  };
}

/** What may not move without a new entry (reason text and file paths excluded). */
const body = (x) => canonicalJson({ state: x.state, code: x.code ?? null, priced: x.priced ?? null, measurement: x.measurement ?? null });
const pricedBody = (p) => canonicalJson({ ...(p ?? {}), sourceFile: null });

/**
 * Append graded priced items. Item: { key, date, eventId, playerId, family, book, recordId, priced, state, code, reason,
 * measurement, inputs }. Returns { appended, pricedMismatches } — `appended` are NEW entries only.
 */
export function appendPricedGrades(entries, items, { gradedAt, graderVersion = PRICED_GRADER_VERSION }) {
  const latest = new Map();
  for (const e of entries ?? []) latest.set(e.key, e);
  let seq = (entries ?? []).reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
  const appended = [];
  const pricedMismatches = [];
  for (const it of items ?? []) {
    const key = it.key ?? pricedKey(it);
    const prev = latest.get(key) ?? null;
    if (prev && pricedBody(prev.priced) !== pricedBody(it.priced)) { pricedMismatches.push({ key, seq: prev.seq }); continue; }
    if (prev && body({ ...prev, priced: it.priced }) === body(it)) continue;
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
      schema: PRICED_SCHEMA, seq, key,
      date: it.date ?? null, eventId: String(it.eventId), playerId: String(it.playerId), family: it.family, book: it.book, recordId: it.recordId,
      gradedAt, graderVersion, propGraderVersion: NBA_PROP_SETTLEMENT_VERSION,
      dataClass: "PRIVATE_RESEARCH", productEligible: false, notAPick: true,
      state: it.state, code: it.code ?? null, reason: it.reason ?? null,
      priced: it.priced, measurement: it.measurement ?? null, inputs: it.inputs ?? null,
      lineageReason, supersedes: prev ? prev.seq : null, cause,
      ...(lineageReason === LINEAGE.CORRECTION ? { correction: { oldState: prev.state, newState: it.state, oldActual: prev.measurement?.actual ?? null, newActual: it.measurement?.actual ?? null } } : {}),
    };
    appended.push(entry);
    latest.set(key, entry);
  }
  return { appended, pricedMismatches };
}

/** Post-write guard over the ledger TEXT: prefix-preserving, seqs 1…n, private/not a pick, lineage, write-once priced. */
export function pricedLedgerAppendOnlyViolations({ beforeText = "", afterText = "" }) {
  const v = [];
  const b = beforeText ?? "", a = afterText ?? "";
  if (!a.startsWith(b)) v.push("the ledger before this run is not an unchanged prefix of the ledger after it");
  const { entries, errors } = parsePropLedger(a);
  v.push(...errors);
  const seen = new Map();
  entries.forEach((e, i) => {
    if (e.seq !== i + 1) v.push(`line ${i + 1}: seq ${e.seq}, expected ${i + 1}`);
    if (e.schema !== PRICED_SCHEMA) v.push(`seq ${e.seq}: schema ${JSON.stringify(e.schema)}`);
    if (e.dataClass !== "PRIVATE_RESEARCH" || e.productEligible !== false || e.notAPick !== true) v.push(`seq ${e.seq}: must be PRIVATE_RESEARCH, productEligible false, notAPick true`);
    if (e.key !== pricedKey(e)) v.push(`seq ${e.seq}: key ${e.key} does not match its fields`);
    const prev = seen.get(e.key);
    if (e.lineageReason === LINEAGE.INITIAL && prev) v.push(`seq ${e.seq}: second INITIAL for ${e.key}`);
    if (e.lineageReason !== LINEAGE.INITIAL && (!prev || e.supersedes !== prev.seq)) v.push(`seq ${e.seq} (${e.lineageReason}) does not supersede the previous entry of ${e.key}`);
    if (prev && isPendingState(e.state)) v.push(`seq ${e.seq}: ${e.key} went back to ${e.state}`);
    if (prev && pricedBody(prev.priced) !== pricedBody(e.priced)) v.push(`seq ${e.seq}: priced block of ${e.key} changed`);
    seen.set(e.key, e);
  });
  return v;
}

/** Descriptive counts over the CURRENT entries (latest per key), per family: states and over/under/push at real lines. */
export function summarisePricedGrades(entries) {
  const latest = new Map();
  for (const e of entries ?? []) latest.set(e.key, e);
  const out = {};
  for (const e of latest.values()) {
    const f = (out[e.family] ??= { rows: 0, graded: 0, noMeasurement: 0, pending: 0, voids: 0, over: 0, under: 0, push: 0 });
    f.rows += 1;
    if (e.state === SHADOW_STATE.GRADED) {
      f.graded += 1;
      if (e.measurement?.over === "PUSH") f.push += 1;
      else if (e.measurement?.over === "WIN") f.over += 1;
      else f.under += 1;
    } else if (e.state === SHADOW_STATE.NO_MEASUREMENT) f.noMeasurement += 1;
    else if (isPendingState(e.state)) f.pending += 1;
    else f.voids += 1;
  }
  return out;
}
