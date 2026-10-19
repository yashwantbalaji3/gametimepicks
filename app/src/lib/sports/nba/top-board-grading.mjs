/**
 * NBA TOP BOARD GRADING + APPEND-ONLY LEDGER — PURE, no I/O. PRIVATE research (productEligible false).
 *
 * Two separate questions per frozen board row, never blended:
 *
 *   SETTLEMENT (bet vocabulary): WIN | LOSS | PUSH | VOID | PENDING | UNGRADABLE.
 *     A row can only WIN/LOSE/PUSH against a RECORDED line and side. No NBA line is authorized, so every row that
 *     played is UNGRADABLE with reason NO_RECORDED_LINE — W/L/P are structurally 0 and the report says so. The
 *     line settlement below exists (and is tested) so the vocabulary is real, but no current row can reach it.
 *   PROJECTION ACCURACY: the frozen p50 / mean / p10–p90 against the actual stat — error, |error|, inside p10–p90,
 *     at-or-above p50 — computed whenever the player played, line or no line.
 *
 * VOID is never a loss and never in a denominator: DNP (incl. coach's decision), not in the box score (late
 * scratch / inactive), postponed or cancelled game. A missing or non-final box score is PENDING, never a loss.
 *
 * LEDGER: entries are appended, never edited. A row's first grade is INITIAL; a PENDING row that later resolves
 * appends PENDING_RESOLVED; a changed grade for an already-decided row appends CORRECTION with `supersedes` (the
 * lineage). An identical re-grade appends nothing. `ledgerAppendOnlyViolations` is the post-write guard.
 */
import { canonicalJson } from "./forecast-receipt.mjs";

export const GRADES_ARTIFACT = "nba-top-board-grades";
export const SETTLEMENT = Object.freeze({ WIN: "WIN", LOSS: "LOSS", PUSH: "PUSH", VOID: "VOID", PENDING: "PENDING", UNGRADABLE: "UNGRADABLE" });
export const PROJECTION_STATUS = Object.freeze({ GRADED: "GRADED", VOID: "VOID", PENDING: "PENDING", UNGRADABLE: "UNGRADABLE" });
export const GRADE_REASON = Object.freeze({
  NO_RECORDED_LINE: "NO_RECORDED_LINE",
  NO_SIDE: "NO_SIDE",
  GAME_POSTPONED: "GAME_POSTPONED",
  NO_FINAL_BOXSCORE: "NO_FINAL_BOXSCORE",
  NOT_IN_BOXSCORE: "NOT_IN_BOXSCORE",
  DNP: "DNP",
  NULL_ACTUAL: "NULL_ACTUAL",
});

const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r2 = (x) => (isNum(x) ? Number(x.toFixed(2)) : null);

/** Line settlement (OVER/UNDER against a recorded line). Unreachable today: no row carries a line. */
export function settleAgainstLine({ line, side, actual }) {
  if (!isNum(line)) return { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NO_RECORDED_LINE };
  if (side !== "OVER" && side !== "UNDER") return { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NO_SIDE };
  if (!isNum(actual)) return { status: SETTLEMENT.PENDING, reason: GRADE_REASON.NULL_ACTUAL };
  if (actual === line) return { status: SETTLEMENT.PUSH, reason: null };
  const over = actual > line;
  return { status: (side === "OVER") === over ? SETTLEMENT.WIN : SETTLEMENT.LOSS, reason: null };
}

const POSTPONED = /POSTPONED|CANCELED|CANCELLED|SUSPENDED|FORFEIT/i;

/**
 * Grade one frozen board row.
 * @param row        a frozen board row (top-boards.mjs)
 * @param boxscore   the event's box-score doc (boxscore-parse.mjs) or null
 * @param gameStatus the schedule/results statusRaw for the event, or null
 */
export function gradeBoardRow(row, { boxscore = null, gameStatus = null } = {}) {
  const base = { rowId: row.rowId, category: row.category, stat: row.stat, eventId: row.eventId, providerAthleteId: row.player?.providerAthleteId ?? null };
  const voidAs = (reason, detail = null) => ({ ...base, settlement: { status: SETTLEMENT.VOID, reason, detail }, projectionStatus: PROJECTION_STATUS.VOID, accuracy: null });
  const pendingAs = (reason) => ({ ...base, settlement: { status: SETTLEMENT.PENDING, reason, detail: null }, projectionStatus: PROJECTION_STATUS.PENDING, accuracy: null });

  if (POSTPONED.test(String(gameStatus ?? "")) || POSTPONED.test(String(boxscore?.status ?? ""))) return voidAs(GRADE_REASON.GAME_POSTPONED, gameStatus ?? boxscore?.status);
  if (!boxscore?.boxscoreAvailable || !/FINAL/.test(String(boxscore.status ?? ""))) return pendingAs(GRADE_REASON.NO_FINAL_BOXSCORE);

  const id = String(row.player?.providerAthleteId);
  const a = (boxscore.players ?? []).find((p) => String(p.providerAthleteId) === id);
  if (!a) return voidAs(GRADE_REASON.NOT_IN_BOXSCORE, "late scratch or inactive — not listed in the final box score");
  if (a.didNotPlay) return voidAs(GRADE_REASON.DNP, a.dnpReason ?? null);
  const actual = a[row.stat];
  if (!isInt(a.minutes) || !isInt(actual)) {
    return { ...base, settlement: { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NULL_ACTUAL, detail: `minutes ${a.minutes} · ${row.stat} ${actual}` }, projectionStatus: PROJECTION_STATUS.UNGRADABLE, accuracy: null };
  }
  const { p50, mean } = row.projection ?? {};
  const { p10, p90 } = row.range ?? {};
  const accuracy = {
    actual,
    actualMinutes: a.minutes,
    p50, mean, p10, p90,
    errorP50: r2(p50 - actual),            // forecast − actual: positive = projected too high (repo convention)
    absErrorP50: r2(Math.abs(p50 - actual)),
    errorMean: r2(mean - actual),
    absErrorMean: r2(Math.abs(mean - actual)),
    inside80: actual >= p10 && actual <= p90 ? 1 : 0,
    atOrAboveP50: actual >= p50 ? 1 : 0,
    minutesError: isNum(row.expectedMinutes) ? r2(row.expectedMinutes - a.minutes) : null,
  };
  const settlement = row.marketLine == null
    ? { status: SETTLEMENT.UNGRADABLE, reason: GRADE_REASON.NO_RECORDED_LINE, detail: "no authorized NBA price — projection accuracy is still graded" }
    : { ...settleAgainstLine({ line: row.marketLine, side: row.side ?? null, actual }), detail: null };
  return { ...base, settlement, projectionStatus: PROJECTION_STATUS.GRADED, accuracy };
}

/** Every row of every edition of a board document, with its edition number. */
export function boardRows(doc) {
  const out = [];
  for (const e of doc?.editions ?? []) for (const b of Object.values(e.boards ?? {})) for (const r of b.rows ?? []) out.push({ ...r, edition: e.edition, frozenAt: e.frozenAt, date: doc.date });
  return out;
}

export function emptyGradesLedger({ family }) {
  return {
    schemaVersion: 1, artifact: GRADES_ARTIFACT, family, dataClass: "PRIVATE_RESEARCH", productEligible: false,
    rule: "append-only: an entry is never edited or removed; a resolved PENDING appends PENDING_RESOLVED, a changed decided grade appends CORRECTION with supersedes",
    settlementVocabulary: Object.values(SETTLEMENT),
    entries: [],
  };
}

const gradeBody = (g) => canonicalJson({ settlement: g.settlement, projectionStatus: g.projectionStatus, accuracy: g.accuracy });

/** Latest entry per rowId. */
export function latestByRow(ledger) {
  const m = new Map();
  for (const e of ledger?.entries ?? []) m.set(e.rowId, e);
  return m;
}

/**
 * Append grades to a ledger (returns a NEW ledger; the input is not modified).
 * @param grades  [{ ...gradeBoardRow(), date, edition }]
 */
export function appendGrades(ledger, grades, { gradedAt, sourceOf = () => null }) {
  const next = { ...ledger, entries: [...(ledger?.entries ?? [])] };
  const latest = latestByRow(next);
  let seq = next.entries.length ? Math.max(...next.entries.map((e) => e.seq)) : 0;
  const appended = [];
  for (const g of grades) {
    const prev = latest.get(g.rowId) ?? null;
    if (prev && gradeBody(prev) === gradeBody(g)) continue;
    const lineageReason = !prev ? "INITIAL" : prev.settlement?.status === SETTLEMENT.PENDING ? "PENDING_RESOLVED" : "CORRECTION";
    seq += 1;
    const entry = {
      seq, rowId: g.rowId, date: g.date ?? null, edition: g.edition ?? null, category: g.category, eventId: g.eventId, providerAthleteId: g.providerAthleteId,
      gradedAt, settlement: g.settlement, projectionStatus: g.projectionStatus, accuracy: g.accuracy,
      source: sourceOf(g) ?? null,
      supersedes: prev ? prev.seq : null, lineageReason,
    };
    next.entries.push(entry);
    latest.set(g.rowId, entry);
    appended.push(entry);
  }
  return { ledger: next, appended };
}

/** Post-write guard: the BEFORE entries are an unchanged prefix of AFTER; seq strictly increasing. */
export function ledgerAppendOnlyViolations({ before, after }) {
  const v = [];
  const b = before?.entries ?? [];
  const a = after?.entries ?? [];
  if (a.length < b.length) v.push(`entries removed (${b.length} → ${a.length})`);
  for (let i = 0; i < b.length; i += 1) if (a[i] && canonicalJson(a[i]) !== canonicalJson(b[i])) v.push(`entry seq ${b[i].seq} was edited`);
  for (let i = 1; i < a.length; i += 1) if (!(a[i].seq > a[i - 1].seq)) v.push(`seq not increasing at ${a[i].seq}`);
  return v;
}
