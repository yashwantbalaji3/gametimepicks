/**
 * Stage 3A pins — lib/results/forecast-of-record.mjs (forecast-of-record + identity/dedupe + denominator contract).
 *
 * Founder decisions 2026-10-06 22:22Z (protocol/STAGE-3-FOUNDER-DECISIONS-2026-10-06.md): Q1 YES (rescheduled
 * canonical start), Q2 TWO (+ revision lineage), Q3 YES (frozen side or TOO_CLOSE; no threshold defined here),
 * Q4 HIGHER (historical NFL winner rows; "historical model-favored winner accuracy"), Q5 EXCLUDE. Revision ruling
 * 2026-10-07 00:25Z: a later revision replaces only the SAME claim; whole-board replacement only on explicit provenance;
 * no lineage and no one-to-one mapping ⇒ AMBIGUOUS_REVISION (kept, disclosed, excluded, never a loss).
 *
 * Pins rules on synthetic fixtures (__fixtures__/forecast-of-record/cases.json). No live data and no live count is
 * read or pinned: the rules and invariants are under test, never today's record.
 *
 * Runs from app/: npx tsx --test src/lib/results/forecast-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OUTCOME, DENOMINATOR, CONFLICT_REASON, EXCLUSION, EXCLUSION_REASONS, BOARD_PROVENANCE_FIELDS, TOO_CLOSE, SIDE_BASIS, HISTORICAL_MODEL_FAVORED_LABEL,
  questionKey, identityKey, claimKey, selectForecastOfRecord, sideOf, publishedSide, outcomeOf, tally, recordBasis,
  recordOf, formatRecord,
} from "./forecast-of-record.mjs";
import * as contract from "./forecast-of-record.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(fs.readFileSync(path.join(HERE, "__fixtures__/forecast-of-record/cases.json"), "utf8"));
const without = (row, ...keys) => { const r = { ...row }; for (const k of keys) delete r[k]; return r; };
const tags = (rows) => rows.map((r) => r.tag);
const hasLineage = (r) => r.claimId != null || r.publicationId != null || r.replacesPublicationIds != null;

/** Every raw row must land in exactly one bucket: nothing double-counted, nothing silently dropped. */
function assertConserved(rows, sel) {
  const out = [...sel.record, ...sel.superseded, ...sel.late, ...sel.conflicts.flatMap((c) => c.rows), ...sel.ambiguous, ...sel.unkeyed];
  assert.equal(out.length, rows.length, "every input row is accounted for exactly once");
  for (const r of rows) assert.equal(out.filter((o) => o === r).length, 1);
}

/* ── 1 · identity (Q1, Q2, Q5) ────────────────────────────────────────────────────────────────── */

test("question identity = sport | event | subject type | subject | family; version, receipt and date are not identity", () => {
  const [a, b] = F.reissued;
  assert.notEqual(a.modelVersion, b.modelVersion);
  assert.notEqual(a.receiptId, b.receiptId);
  assert.notEqual(a.publishedAt, b.publishedAt);
  assert.equal(questionKey(a), questionKey(b));
  assert.equal(questionKey(a), "NFL|9001|GAME|nfl-9001|nfl_game_winner");
  assert.equal(identityKey, questionKey, "prototype name kept as an alias, same function");
});

test("claim identity = question + claimId (lineage) when carried, else the frozen line", () => {
  const [k55, k45, k65] = F.lineRevision;
  assert.equal(claimKey(k55), "MLB|664|PLAYER|mlb-player-664|pitcher_strikeouts#claim=k-a");
  assert.equal(claimKey(k55), claimKey(k65), "a revision keeps its claim identity even when the line moves");
  assert.notEqual(claimKey(k55), claimKey(k45));
  assert.equal(claimKey(without(k45, "claimId")), "MLB|664|PLAYER|mlb-player-664|pitcher_strikeouts#line=4.5");
  assert.equal(claimKey(F.reissued[0]), "NFL|9001|GAME|nfl-9001|nfl_game_winner#-");
});

test("Q5 · an identity field that is missing is refused, never defaulted or inferred", () => {
  assert.throws(() => questionKey(F.unkeyed[0]), /eventId is required/);
  assert.throws(() => questionKey({ ...F.reissued[0], family: "" }), /family is required/);
  assert.throws(() => questionKey({ ...F.reissued[0], subjectId: "a|b" }), /may not contain/);
  assert.throws(() => claimKey(F.unkeyed[0]), /eventId is required/, "no claim key without a question key");
});

test("Q5 · a row with no canonical identity is excluded from the aggregate and disclosed — never a loss, never zero", () => {
  const rows = [...F.unkeyed, F.reissued[1]];
  const sel = selectForecastOfRecord(rows);
  assertConserved(rows, sel);
  assert.deepEqual(sel.unkeyed, F.unkeyed, "kept intact for raw history");
  const t = recordOf(rows);
  assert.equal(t.forecasts, 1);
  assert.equal(t.excluded.unkeyed, 1);
  assert.equal(t.loss, 0, "the unkeyed row (which would have been a WIN) is not a loss either");
  const only = recordOf(F.unkeyed);
  assert.deepEqual({ forecasts: only.forecasts, decided: only.decided, unknown: only.unknown, unkeyed: only.excluded.unkeyed }, { forecasts: 0, decided: 0, unknown: 0, unkeyed: 1 });
  assert.equal(only.hitRate, null, "never 0%");
  assert.equal(formatRecord(only), null, "never 0–0");
  // No inferred identity: the matchup text on the row is never used to give it a key.
  assert.ok(F.unkeyed[0].matchup);
  assert.equal(selectForecastOfRecord([...F.unkeyed, ...F.unkeyed]).record.length, 0);
});

/* ── 2 · which copy is of record (Q1) ─────────────────────────────────────────────────────────── */

test("🔴 #999 class: a re-issued forecast in two files counts ONCE — the latest pregame copy", () => {
  for (const rows of [F.reissued, [...F.reissued].reverse()]) {
    const sel = selectForecastOfRecord(rows);
    assertConserved(rows, sel);
    assert.deepEqual(tags(sel.record), ["record"], "file/array order never decides it");
    assert.deepEqual(tags(sel.superseded), ["superseded"]);
    const t = recordOf(rows);
    assert.equal(t.win, 1, "one win, not two");
    assert.equal(t.forecasts, 1);
    assert.equal(t.excluded.superseded, 1);
  }
});

test("when the copies disagree, the latest pregame copy decides — not the one that flatters", () => {
  assert.deepEqual(tags(selectForecastOfRecord(F.reissuedDisagreeing).record), ["record"]);
  const t = recordOf(F.reissuedDisagreeing);
  assert.deepEqual({ win: t.win, loss: t.loss }, { win: 0, loss: 1 }, "the superseded copy would have been a win; it is not counted");
});

test("a copy published at or after the start is never of record, and the exclusion is disclosed", () => {
  const sel = selectForecastOfRecord(F.lateCopy);
  assert.deepEqual(tags(sel.record), ["record"]);
  assert.deepEqual(tags(sel.late), ["late"]);
  const t = recordOf(F.lateCopy);
  assert.deepEqual({ win: t.win, loss: t.loss }, { win: 0, loss: 1 }, "the late copy picked the winner; it does not count");
  const only = recordOf(F.onlyLate);
  assert.equal(only.forecasts, 0, "nothing published before the start ⇒ nothing in the record");
  assert.equal(only.excluded.late, 1);
  assert.equal(only.hitRate, null);
});

test("🔴 Q1 · postponed game: ONE rescheduled canonical start applies to every copy; counts once", () => {
  const rows = F.postponed;
  assert.notEqual(rows[0].eventStart, rows[0].canonicalStart, "fixture: the original-date copy carries the original start");
  for (const order of [rows, [...rows].reverse()]) {
    const sel = selectForecastOfRecord(order);
    assertConserved(order, sel);
    assert.deepEqual(tags(sel.record), ["record"]);
    assert.deepEqual(tags(sel.superseded), ["superseded"], "the original-date copy is kept for audit, never counted");
    assert.deepEqual(tags(sel.late), ["late"], "after the rescheduled start ⇒ late, even with no start of its own");
  }
  const t = recordOf(rows);
  assert.deepEqual({ forecasts: t.forecasts, win: t.win, superseded: t.excluded.superseded, late: t.excluded.late }, { forecasts: 1, win: 1, superseded: 1, late: 1 });
  assert.equal(t.cutoffFromEventStart, 0, "the cut-off is the canonical start, not a copy's own field");
});

test("🔴 Q1 · never the originally scheduled start: a version published between the original and the rescheduled start is valid", () => {
  const rows = F.postponedStaleStart;
  const revised = rows.find((r) => r.tag === "record");
  assert.ok(Date.parse(revised.publishedAt) >= Date.parse(revised.eventStart), "fixture: by its OWN (original) start it would look late");
  assert.ok(Date.parse(revised.publishedAt) < Date.parse(revised.canonicalStart), "…but it precedes the rescheduled start");
  const sel = selectForecastOfRecord(rows);
  assert.deepEqual(tags(sel.record), ["record"]);
  assert.equal(sel.late.length, 0);
  const t = recordOf(rows);
  assert.deepEqual({ win: t.win, loss: t.loss }, { win: 0, loss: 1 }, "the last pregame version is graded, though the earlier one would have won");
});

test("Q1 · the canonical start can come from the schedule owner (opts) instead of the rows; same answer", () => {
  const stripped = F.postponedStaleStart.map((r) => without(r, "canonicalStart"));
  const viaObj = selectForecastOfRecord(stripped, { canonicalStarts: { "MLB|555786": "2026-09-23T22:35:00Z" } });
  const viaMap = selectForecastOfRecord(stripped, { canonicalStarts: new Map([["MLB|555786", "2026-09-23T22:35:00Z"]]) });
  for (const sel of [viaObj, viaMap]) {
    assert.deepEqual(tags(sel.record), ["record"]);
    assert.equal(sel.cutoffFromEventStart, 0);
  }
  assert.throws(() => selectForecastOfRecord(stripped, { canonicalStarts: { "MLB|555786": "postponed" } }), /not an ISO time/);
});

test("Q1 · copies whose own starts disagree and no canonical start is known: a conflict, never 'take the original'", () => {
  const rows = F.postponed.slice(0, 2).map((r) => without(r, "canonicalStart"));
  const sel = selectForecastOfRecord(rows);
  assertConserved(rows, sel);
  assert.equal(sel.record.length, 0);
  assert.deepEqual(sel.conflicts.map((c) => c.reason), [CONFLICT_REASON.EVENT_START_UNRESOLVED]);
  const disagree = [F.postponed[0], { ...F.postponed[1], canonicalStart: "2026-09-24T17:05:00Z" }];
  assert.deepEqual(selectForecastOfRecord(disagree).conflicts.map((c) => c.reason), [CONFLICT_REASON.CANONICAL_START_DISAGREES]);
});

test("Q1 · with no canonical start, an agreed own start is used — and that is disclosed (the adapter owes the canonical start)", () => {
  const t = recordOf(F.reissued);
  assert.equal(t.forecasts, 1);
  assert.equal(t.cutoffFromEventStart, 1);
});

/* ── 3 · claims and revision lineage (Q2) ─────────────────────────────────────────────────────── */

test("🔴 Q2 TWO · distinct lines published together are two claims, each graded on its own line; an earlier line is superseded", () => {
  const sel = selectForecastOfRecord(F.simultaneousLines);
  assertConserved(F.simultaneousLines, sel);
  assert.deepEqual(sel.record.map((r) => r.line).sort(), [4.5, 5.5]);
  assert.equal(sel.superseded.length, 1, "the 3.5 line posted earlier was replaced, not counted");
  assert.equal(new Set(sel.record.map(claimKey)).size, 2, "two distinct claim keys");
  const t = recordOf(F.simultaneousLines);
  assert.deepEqual({ forecasts: t.forecasts, win: t.win, loss: t.loss }, { forecasts: 2, win: 1, loss: 1 });
  assert.equal(contract.SIMULTANEOUS_LINES, undefined, "Q2 is decided: there is no ONE/CONFLICT switch");
});

test("🔴 Q2 lineage · a later revision supersedes only its own claim; the other simultaneous claim stands", () => {
  for (const rows of [F.lineRevision, [...F.lineRevision].reverse()]) {
    const sel = selectForecastOfRecord(rows);
    assertConserved(rows, sel);
    assert.deepEqual(sel.record.map((r) => r.line).sort(), [4.5, 6.5]);
    assert.deepEqual(sel.superseded.map((r) => r.line), [5.5]);
  }
  const t = recordOf(F.lineRevision);
  assert.deepEqual({ forecasts: t.forecasts, win: t.win, loss: t.loss }, { forecasts: 2, win: 0, loss: 2 }, "the superseded 5.5 would have won; it is not counted");
});

/* Founder ruling 2026-10-07 00:25Z: later revisions replace earlier versions of the SAME claim only; two simultaneous
   different lines are two forecasts; no question-level latest-wins; whole-board replacement only on explicit provenance;
   no lineage ⇒ preserve or classify AMBIGUOUS_REVISION, never delete. */
const rowsOf = (set) => set.rows;
const byTag = (sel) => ({
  record: sel.record.map((r) => `${r.subjectId} ${r.frozenSide} ${r.line}`).sort(),
  superseded: sel.superseded.map((r) => `${r.subjectId} ${r.frozenSide} ${r.line}`).sort(),
  ambiguous: sel.ambiguous.map((r) => `${r.subjectId} ${r.frozenSide} ${r.line}`).sort(),
});
const expectTags = (rows) => {
  const pick = (t) => rows.filter((r) => r.tag === t).map((r) => `${r.subjectId} ${r.frozenSide} ${r.line}`).sort();
  return { record: pick("record"), superseded: pick("superseded"), ambiguous: pick("ambiguous") };
};
const orders = (rows) => [rows, [...rows].reverse(), [...rows.slice(1), rows[0]]];

test("🔴 founder ruling · Over 5.5 + Under 4.5, later Over 6.5, no lineage: Over 6.5 and Under 4.5 are of record, Over 5.5 superseded", () => {
  const rows = rowsOf(F.founderRevisionCase);
  for (const order of orders(rows)) {
    const sel = selectForecastOfRecord(order);
    assertConserved(order, sel);
    assert.deepEqual(byTag(sel), expectTags(rows), "file/array order never decides it");
    assert.ok(rows.every((r) => !hasLineage(r)), "fixture: no claimId and no board provenance");
  }
  const sel = selectForecastOfRecord(rows);
  assert.deepEqual(sel.record.map((r) => r.line).sort(), [4.5, 6.5], "two forecasts: the Over claim's latest version and the untouched Under");
  assert.ok(sel.record.some((r) => r.frozenSide === "UNDER" && r.line === 4.5), "the untouched simultaneous Under 4.5 survives");
  assert.deepEqual(sel.superseded.map((r) => r.line), [5.5], "only the Over claim's earlier version is replaced");
  assert.equal(sel.ambiguous.length, 0);
  const t = recordOf(rows);
  assert.deepEqual({ forecasts: t.forecasts, win: t.win, loss: t.loss, superseded: t.excluded.superseded }, { forecasts: 2, win: 1, loss: 1, superseded: 1 });
});

test("🔴 founder ruling · two simultaneous lines stay two forecasts while nothing later touches them", () => {
  const firstBoard = rowsOf(F.founderRevisionCase).filter((r) => r.publishedAt === "2026-05-16T12:00:00Z");
  assert.equal(firstBoard.length, 2);
  const sel = selectForecastOfRecord(firstBoard);
  assertConserved(firstBoard, sel);
  assert.equal(sel.record.length, 2);
  assert.equal(new Set(sel.record.map(claimKey)).size, 2);
});

test("🔴 founder ruling · with claimId lineage the revision replaces only the claim it links to (incl. where the fallback would be ambiguous)", () => {
  const rows = rowsOf(F.lineageResolvesAmbiguity);
  for (const order of orders(rows)) {
    const sel = selectForecastOfRecord(order);
    assertConserved(order, sel);
    assert.deepEqual(byTag(sel), expectTags(rows));
  }
  const stripped = rows.map((r) => without(r, "claimId"));
  const sel = selectForecastOfRecord(stripped);
  assertConserved(stripped, sel);
  assert.deepEqual(sel.record.map((r) => r.line), [6.5], "without lineage the same rows are not one-to-one…");
  assert.deepEqual(sel.ambiguous.map((r) => r.line).sort(), [4.5, 5.5], "…so both earlier Over lines are AMBIGUOUS_REVISION, not deleted");
});

test("🔴 founder ruling · whole-board supersession only with explicit board provenance (replacesPublicationIds), never from dates", () => {
  const rows = rowsOf(F.boardReplaced);
  for (const order of orders(rows)) {
    const sel = selectForecastOfRecord(order);
    assertConserved(order, sel);
    assert.deepEqual(byTag(sel), expectTags(rows));
    assert.equal(sel.supersededByBoard, 3, "the Under 4.5 and the dropped player go with the replaced board");
  }
  const t = recordOf(rows);
  assert.deepEqual({ forecasts: t.forecasts, superseded: t.excluded.superseded, byBoard: t.excluded.supersededByBoard }, { forecasts: 1, superseded: 3, byBoard: 3 });
  // Same rows, same dates, no replacement field ⇒ the side-slot fallback: the Under 4.5 and the dropped player survive.
  const noProv = rows.map((r) => without(r, "replacesPublicationIds"));
  const sel = selectForecastOfRecord(noProv);
  assertConserved(noProv, sel);
  assert.equal(sel.supersededByBoard, 0);
  assert.deepEqual(sel.record.map((r) => `${r.subjectId} ${r.frozenSide} ${r.line}`).sort(),
    ["mlb-player-666 OVER 6.5", "mlb-player-666 UNDER 4.5", "mlb-player-666b OVER 0.5"]);
  // A replacement published at/after the canonical start replaces nothing pregame (the replacing copy is itself late).
  const lateBoard = rows.map((r) => (r.publicationId === "board-B" ? { ...r, publishedAt: "2026-05-16T23:30:00Z" } : r));
  const selLate = selectForecastOfRecord(lateBoard);
  assertConserved(lateBoard, selLate);
  assert.equal(selLate.supersededByBoard, 0);
  assert.equal(selLate.record.length, 3, "board A's pregame copies stand");
  assert.deepEqual(BOARD_PROVENANCE_FIELDS, ["publicationId", "replacesPublicationIds"]);
});

test("🔴 founder ruling · no one-to-one mapping and no lineage ⇒ AMBIGUOUS_REVISION: kept, disclosed, excluded from W–L, never a loss", () => {
  const rows = rowsOf(F.ambiguousRevision);
  for (const order of orders(rows)) {
    const sel = selectForecastOfRecord(order);
    assertConserved(order, sel);
    assert.deepEqual(byTag(sel), expectTags(rows));
  }
  const amb = rows.filter((r) => r.tag === "ambiguous");
  assert.ok(amb.every((r) => outcomeOf(r) === OUTCOME.LOSS), "fixture: every ambiguous copy would have been a loss");
  const t = recordOf(rows);
  assert.deepEqual({ forecasts: t.forecasts, win: t.win, loss: t.loss }, { forecasts: 3, win: 2, loss: 1 }, "only the records' own outcomes count");
  assert.equal(t.excluded.ambiguousRevision, amb.length, "disclosed as a count");
  assert.ok(EXCLUSION_REASONS.includes(EXCLUSION.AMBIGUOUS_REVISION));
});

test("founder ruling · a later copy of the same line (side flipped) or a same-side line move with one candidate is a one-to-one revision", () => {
  for (const rows of [F.postponedStaleStart, F.reissuedDisagreeing, F.simultaneousLines]) {
    const sel = selectForecastOfRecord(rows);
    assertConserved(rows, sel);
    assert.equal(sel.ambiguous.length, 0);
  }
  assert.deepEqual(tags(selectForecastOfRecord(F.postponedStaleStart).superseded), ["superseded"], "UNDER 0.5 → OVER 0.5: one claim/line, restated");
  assert.deepEqual(tags(selectForecastOfRecord(F.reissuedDisagreeing).superseded), ["superseded"], "a line-less game winner has one claim");
});

test("Q2 lineage · partial lineage, or two lines at once inside ONE claim, is a conflict — never guessed", () => {
  const partial = [without(F.lineRevision[0], "claimId"), F.lineRevision[1], F.lineRevision[2]];
  assert.deepEqual(selectForecastOfRecord(partial).conflicts.map((c) => c.reason), [CONFLICT_REASON.PARTIAL_LINEAGE]);
  const oneClaimTwoLines = F.simultaneousLines.map((r) => ({ ...r, claimId: "k-x" }));
  const sel = selectForecastOfRecord(oneClaimTwoLines);
  assertConserved(oneClaimTwoLines, sel);
  assert.equal(sel.record.length, 0);
  assert.deepEqual(sel.conflicts.map((c) => c.reason), [CONFLICT_REASON.SAME_TIME_DIFFERENT_CLAIM]);
});

test("copies that cannot be ordered, or tie and disagree on the same line, are a CONFLICT: surfaced and not counted", () => {
  const sel = selectForecastOfRecord(F.conflicts);
  assertConserved(F.conflicts, sel);
  assert.equal(sel.record.length, 0);
  assert.deepEqual(sel.conflicts.map((c) => c.reason).sort(), [CONFLICT_REASON.COPIES_WITHOUT_PUBLISHED_AT, CONFLICT_REASON.SAME_TIME_DIFFERENT_CLAIM]);
  const t = recordOf(F.conflicts);
  assert.equal(t.decided, 0);
  assert.deepEqual({ conflicts: t.excluded.conflicts, conflictRows: t.excluded.conflictRows }, { conflicts: 2, conflictRows: 4 });
});

test("an exact duplicate (same time, same claim) is one forecast; so is an undated exact duplicate", () => {
  const a = recordOf(F.exactDuplicate);
  assert.deepEqual({ forecasts: a.forecasts, win: a.win, superseded: a.excluded.superseded }, { forecasts: 1, win: 1, superseded: 1 });
  const b = recordOf(F.undatedDuplicate);
  assert.deepEqual({ forecasts: b.forecasts, win: b.win, conflicts: b.excluded.conflicts }, { forecasts: 1, win: 1, conflicts: 0 });
  assert.equal(b.timingUnverified, 1, "accepted, but the missing timestamps are disclosed");
});

test("invariant · no two rows of record share a claim key, across every fixture set", () => {
  const sets = [F.reissued, F.reissuedDisagreeing, F.lateCopy, F.onlyLate, F.statuses, F.historicalNflWinner, F.postponed,
    F.postponedStaleStart, F.lineRevision, F.simultaneousLines, F.conflicts, F.undatedDuplicate, F.exactDuplicate, F.unkeyed,
    F.founderRevisionCase.rows, F.boardReplaced.rows, F.ambiguousRevision.rows, F.lineageResolvesAmbiguity.rows];
  const all = sets.flat();
  const sel = selectForecastOfRecord(all);
  assertConserved(all, sel);
  const keys = sel.record.map(claimKey);
  assert.equal(new Set(keys).size, keys.length);
});

/* ── 4 · the graded side (Q3, Q4) ─────────────────────────────────────────────────────────────── */

test("🔴 Q3 · a frozen TOO_CLOSE is an abstention: NO_PICK, never a loss, whatever the probabilities say", () => {
  const tc = F.statuses.find((r) => r.frozenSide === TOO_CLOSE);
  assert.deepEqual(sideOf(tc), { side: null, basis: SIDE_BASIS.TOO_CLOSE });
  assert.equal(outcomeOf(tc), OUTCOME.NO_PICK);
  assert.equal(outcomeOf({ ...tc, sideBasis: SIDE_BASIS.HISTORICAL_MODEL_FAVORED }), OUTCOME.NO_PICK, "the frozen abstention beats any probability rule");
  assert.equal(outcomeOf({ ...tc, frozenSide: "too_close" }), OUTCOME.NO_PICK);
  assert.equal(outcomeOf({ ...tc, state: "PENDING" }), OUTCOME.PENDING);
  assert.equal(outcomeOf({ ...tc, finalSide: "TIE" }), OUTCOME.VOID);
  const t = tally([tc]);
  assert.deepEqual({ noPick: t.noPick, tooClose: t.tooClose, decided: t.decided }, { noPick: 1, tooClose: 1, decided: 0 });
});

test("🔴 Q3 · the helper never DERIVES TOO_CLOSE (no threshold is defined in Stage 3) and never infers a forward side", () => {
  const rows = [...F.statuses, ...F.historicalNflWinner, ...F.simultaneousLines, ...F.postponed];
  for (const r of rows) {
    if (r.frozenSide !== TOO_CLOSE) assert.notEqual(sideOf(r).basis, SIDE_BASIS.TOO_CLOSE, r.case ?? r.tag);
    if (!r.frozenSide && !r.sideBasis) assert.equal(publishedSide(r), null, "no frozen side and no Q4 basis ⇒ no side");
  }
  for (const [h, a] of [[0.5, 0.5], [0.48, 0.48], [0.9, 0.1], [0.1, 0.9]]) {
    const r = { ...F.statuses[0], frozenSide: null, sideProbabilities: { HOME: h, AWAY: a } };
    assert.deepEqual(sideOf(r), { side: null, basis: SIDE_BASIS.NONE }, `${h}/${a}: a forward row without a frozen word is NO_PICK, not TOO_CLOSE`);
  }
});

/* The old rules are NOT part of the contract. They live here only to show, on fixtures, what Q4 HIGHER replaced. */
const rejectedLedgerHomeOverHalf = (p) => (p.HOME > 0.5 ? "HOME" : p.HOME < 0.5 ? "AWAY" : null);
const rejectedOverHalf = (p) => { const o = ["HOME", "AWAY"].filter((k) => p[k] > 0.5); return o.length === 1 ? o[0] : null; };
function gradeWith(rule, r) {
  if (r.state !== "SETTLED") return outcomeOf(r);
  if (r.finalSide === "TIE") return OUTCOME.VOID;
  const side = r.frozenSide || rule(r.sideProbabilities);
  if (!side) return OUTCOME.NO_PICK;
  return side === r.finalSide ? OUTCOME.WIN : OUTCOME.LOSS;
}

test("🔴 Q4 HIGHER · historical NFL winner rows grade the team with the higher frozen win probability (tie mass ignored)", () => {
  const cinPit = F.historicalNflWinner[0];
  assert.deepEqual(cinPit.sideProbabilities, { HOME: 0.4963, AWAY: 0.4747, TIE: 0.029 }, "PIT 49.63 / CIN 47.47 / tie 2.90");
  assert.equal(cinPit.homeTeam, "PIT");
  assert.deepEqual(sideOf(cinPit), { side: "HOME", basis: SIDE_BASIS.HISTORICAL_MODEL_FAVORED }, "→ PIT");
  for (const r of F.historicalNflWinner) {
    assert.equal(outcomeOf(r), r.expect.historicalModelFavored, `${r.case} · HIGHER`);
    assert.equal(outcomeOf(without(r, "sideBasis")), r.expect.frozenOnly, `${r.case} · without the Q4 basis: no inferred side`);
  }
});

test("Q4 · the rejected P(home) > 0.5 rule is not available, and on fixtures it names the LOWER-probability team", () => {
  for (const name of ["PICK_RULES", "PROPOSED_PICK_RULE", "LEDGER_HOME_OVER_HALF", "OVER_HALF"]) assert.equal(contract[name], undefined, name);
  const cinPit = F.historicalNflWinner[0];
  assert.equal(rejectedLedgerHomeOverHalf(cinPit.sideProbabilities), "AWAY", "the old rule picks CIN at 47.47%");
  for (const r of F.historicalNflWinner) {
    assert.equal(gradeWith(rejectedLedgerHomeOverHalf, r), r.expect.rejectedLedgerHomeOverHalf, `${r.case} · rejected ledger rule`);
    assert.equal(gradeWith(rejectedOverHalf, r), r.expect.rejectedOverHalf, `${r.case} · rejected OVER50`);
    const s = sideOf(r);
    if (s.basis === SIDE_BASIS.HISTORICAL_MODEL_FAVORED && s.side) {
      const p = r.sideProbabilities;
      assert.ok(p[s.side] > p[s.side === "HOME" ? "AWAY" : "HOME"], `${r.case}: HIGHER never names the lower-probability team`);
    }
  }
});

test("Q4 · exact tie or missing probability → no side; the basis is refused outside NFL game-winner rows", () => {
  const even = F.historicalNflWinner.find((r) => r.sideProbabilities.HOME === r.sideProbabilities.AWAY);
  assert.equal(outcomeOf(even), OUTCOME.NO_PICK);
  assert.equal(publishedSide({ ...F.historicalNflWinner[0], sideProbabilities: { HOME: 0.4963 } }), null);
  assert.equal(publishedSide({ ...F.historicalNflWinner[0], sideProbabilities: null }), null);
  assert.throws(() => sideOf({ ...F.historicalNflWinner[0], sport: "MLB" }), /only to NFL nfl_game_winner/);
  assert.throws(() => sideOf({ ...F.historicalNflWinner[0], family: "player_receptions" }), /only to NFL nfl_game_winner/);
  assert.throws(() => sideOf({ ...F.historicalNflWinner[0], sideBasis: "OVER_HALF" }), /unknown sideBasis/);
});

test("Q4 · a historical model-favored record is labelled as such, never as 'our pick', and never mixed silently", () => {
  assert.equal(HISTORICAL_MODEL_FAVORED_LABEL, "historical model-favored winner accuracy");
  const hist = tally(F.historicalNflWinner);
  assert.deepEqual(hist.decidedByBasis, { [SIDE_BASIS.PUBLISHED]: 1, [SIDE_BASIS.HISTORICAL_MODEL_FAVORED]: 3 });
  assert.equal(recordBasis(tally(F.historicalNflWinner.filter((r) => !r.frozenSide))), SIDE_BASIS.HISTORICAL_MODEL_FAVORED);
  assert.equal(recordBasis(tally(F.statuses)), SIDE_BASIS.PUBLISHED);
  assert.equal(recordBasis(hist), "MIXED", "a reader must split published and historical rows before labelling");
  assert.equal(recordBasis(tally([])), null);
});

test("no side is ever chosen by reading the result", () => {
  for (const r of [...F.historicalNflWinner, ...F.statuses]) {
    const flipped = { ...r, finalSide: r.finalSide === "HOME" ? "AWAY" : "HOME", ownerResult: "WIN" };
    assert.deepEqual(sideOf(r), sideOf(flipped), r.case);
  }
});

test("the owner's directional word stands in only for its own PUBLISHED side, never for a Q4 side", () => {
  const r = { ...F.historicalNflWinner[0], finalSide: null, ownerResult: "WIN" };
  assert.equal(outcomeOf(r), OUTCOME.UNKNOWN);
});

/* ── 5 · denominator states ───────────────────────────────────────────────────────────────────── */

test("🔴 denominator contract: every outcome word is either decisive or shown beside — exactly one", () => {
  assert.deepEqual([...DENOMINATOR.DECISIVE], [OUTCOME.WIN, OUTCOME.LOSS]);
  const all = [...DENOMINATOR.DECISIVE, ...DENOMINATOR.SHOWN_BESIDE];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(new Set(all), new Set(Object.values(OUTCOME)));
  assert.deepEqual(new Set(EXCLUSION_REASONS), new Set(Object.values(EXCLUSION)), "every exclusion reason is listed once");
  assert.equal(EXCLUSION_REASONS.length, Object.values(EXCLUSION).length);
  const ex = recordOf([]).excluded;
  for (const k of ["superseded", "late", "conflicts", "conflictRows", "ambiguousRevision", "unkeyed", "supersededByBoard"]) assert.equal(ex[k], 0, k);
});

test("each status maps to exactly one outcome word (pending ≠ loss, void ≠ loss, missing ≠ zero)", () => {
  for (const r of F.statuses) assert.equal(outcomeOf(r), r.expect, r.case);
});

test("🔴 the denominator: only WIN + LOSS decide; push, void, pending, no-pick and unknown sit beside it", () => {
  const t = tally(F.statuses);
  assert.deepEqual(
    { win: t.win, loss: t.loss, push: t.push, void: t.void, pending: t.pending, noPick: t.noPick, unknown: t.unknown },
    { win: 2, loss: 1, push: 1, void: 3, pending: 1, noPick: 2, unknown: 3 },
  );
  assert.equal(t.decided, 3);
  assert.equal(t.forecasts, F.statuses.length, "every row is accounted for in exactly one bucket");
  assert.equal(t.win + t.loss + t.push + t.void + t.pending + t.noPick + t.unknown, t.forecasts);
  assert.equal(t.hitRate, 2 / 3, "2 of 3 decided — not 2 of 13, not 2 of 4");
  assert.equal(formatRecord(t), "2–1–1");
});

test("nothing decided is 'no record', never 0–0 and never 0%", () => {
  const none = tally([]);
  assert.equal(none.hitRate, null);
  assert.equal(formatRecord(none), null);
  const notDecided = tally(F.statuses.filter((r) => !DENOMINATOR.DECISIVE.includes(r.expect) && r.expect !== OUTCOME.PUSH));
  assert.ok(notDecided.forecasts > 0);
  assert.equal(notDecided.decided, 0);
  assert.equal(notDecided.hitRate, null);
  assert.equal(formatRecord(notDecided), null);
});

/* ── 6 · the same game in two readers ─────────────────────────────────────────────────────────── */

/* Each reader keeps its own file shape; a thin adapter maps it into the canonical row. The contract is that the two
   adapters + recordOf agree — the #999 defect was two readers each counting in their own way. */
const fromSettlementFile = (e) => ({
  sport: "NFL", eventId: String(e.providerEventId), subjectType: "GAME", subjectId: e.canonicalEventId, family: "nfl_game_winner",
  publishedAt: e.lineage?.forecastGeneratedAt ?? null, canonicalStart: e.kickoffUtc ?? null,
  frozenSide: e.pick ?? null, state: e.actual ? "SETTLED" : "PENDING",
  finalSide: e.actual ? (e.actual.home === e.actual.away ? "TIE" : e.actual.home > e.actual.away ? "HOME" : "AWAY") : null,
});
const fromWeekReport = (g) => ({
  sport: "NFL", eventId: String(g.providerEventId), subjectType: "GAME", subjectId: `nfl-${g.providerEventId}`, family: "nfl_game_winner",
  publishedAt: g.publishedAt ?? null, canonicalStart: g.kickoff ?? null,
  frozenSide: g.published?.pickSide ? String(g.published.pickSide).toUpperCase() : null, state: g.final ? "SETTLED" : "PENDING",
  finalSide: g.final ? (g.final.home === g.final.away ? "TIE" : g.final.home > g.final.away ? "HOME" : "AWAY") : null,
});

test("🔴 the same games read by two readers give ONE record", () => {
  const tr = F.twoReaders;
  const a = recordOf(Object.values(tr.readerA_settlementFiles).flat().map(fromSettlementFile));
  const b = recordOf(tr.readerB_weekReport.games.map(fromWeekReport));
  const pick = (t) => ({ win: t.win, loss: t.loss, void: t.void, decided: t.decided });
  assert.deepEqual(pick(a), pick(b), "reader A and reader B must agree");
  assert.deepEqual(pick(a), { win: tr.expect.win, loss: tr.expect.loss, void: tr.expect.void, decided: tr.expect.decided });
  assert.equal(a.excluded.superseded, 1, "reader A saw one game twice and counted it once");
});

test("…while counting reader A's files naively reproduces the #999 over-count", () => {
  const tr = F.twoReaders;
  const naiveWins = Object.values(tr.readerA_settlementFiles).flat().map(fromSettlementFile).filter((r) => outcomeOf(r) === OUTCOME.WIN).length;
  assert.equal(naiveWins, tr.expect.naiveReaderAWins);
  assert.ok(naiveWins > tr.expect.win, "the naive reader overstates wins — the exact failure this contract exists to stop");
});

/* ── 7 · 3A scope: contract only, no reader migration ─────────────────────────────────────────── */

/* 3B: the MLB lean adapter is the one importer; MLB readers import the adapter, never the contract directly. */
const IMPORTERS_THROUGH_3B = [
  "src/lib/results/mlb-leans-of-record.mjs", "src/lib/results/mlb-leans-of-record.test.mjs",
  // 3C: the NFL winner rule and the forecast-record label
  "src/lib/results/nfl-model-favored.mjs", "src/lib/results/nfl-model-favored.test.mjs", "src/lib/results/v2/forecast-record.mjs",
  // 3D: the frozen side decision
  "src/lib/results/side-decision.mjs", "src/lib/results/side-decision.test.mjs",
];

test("scope: only the slice adapters import forecast-of-record.mjs (3B: the MLB lean adapter; 3C–3E add theirs)", () => {
  const APP = path.resolve(HERE, "..", "..", "..");
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|ts|tsx)$/.test(e.name) && !p.endsWith("forecast-of-record.test.mjs") && !p.endsWith("forecast-of-record.mjs")) {
        if (/forecast-of-record(\.mjs)?["']/.test(fs.readFileSync(p, "utf8")) && !IMPORTERS_THROUGH_3B.includes(path.relative(APP, p))) offenders.push(path.relative(APP, p));
      }
    }
  };
  for (const d of ["src", "scripts"]) walk(path.join(APP, d));
  assert.deepEqual(offenders, [], "a reader started importing the contract outside its 3B–3E slice");
  for (const p of IMPORTERS_THROUGH_3B) assert.ok(fs.existsSync(path.join(APP, p)), `${p} is listed but missing`);
});
