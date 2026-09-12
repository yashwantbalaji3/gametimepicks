import test from "node:test";
import assert from "node:assert/strict";
import { mergeCaptureRows, rowCapturedAt } from "./capture-merge.mjs";

const row = (id, kickoff, capturedAt) => ({ providerEventId: id, kickoffUtc: kickoff, capturedAt });
const EARLY = "2026-09-13T17:00Z";
const LATE = "2026-09-13T20:25Z";
const SAT = "2026-09-12T17:24:16Z";
const SUN_LATE = "2026-09-13T19:00:00Z";

test("a game priced before kickoff keeps that price when a later run no longer sees it", () => {
  /* THE DEFECT: the Sunday run happens after the 1pm games start, so its window holds only the
     late ones — and writing that wholesale deletes the prices the early games were given on
     Saturday. On an NFL slate that is most of the card. */
  const prior = [row("early", EARLY, SAT), row("late", LATE, SAT)];
  const fresh = [row("late", LATE, SUN_LATE)];
  const { rows, carried } = mergeCaptureRows(prior, fresh, { priorCapturedAt: SAT });
  assert.equal(carried, 1);
  assert.deepEqual(rows.map((r) => r.providerEventId), ["early", "late"], "both survive, ordered by kickoff");
  assert.equal(rows.find((r) => r.providerEventId === "early").capturedAt, SAT, "the carried row keeps ITS own stamp");
  assert.equal(rows.find((r) => r.providerEventId === "early").carriedForward, true);
});

test("the fresh price wins for a game both runs covered — never two rows for one game", () => {
  const { rows, carried } = mergeCaptureRows([row("late", LATE, SAT)], [row("late", LATE, SUN_LATE)], { priorCapturedAt: SAT });
  assert.equal(carried, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].capturedAt, SUN_LATE);
});

test("a row that was never pre-kickoff is not laundered into a pregame price", () => {
  const after = mergeCaptureRows([row("x", EARLY, "2026-09-13T18:00:00Z")], [], { priorCapturedAt: SAT });
  assert.equal(after.carried, 0, "captured after kickoff — not evidence of a pregame market");
  const atKickoff = mergeCaptureRows([row("x", EARLY, EARLY)], [], { priorCapturedAt: SAT });
  assert.equal(atKickoff.carried, 0, "captured AT kickoff is not before it");
  const undated = mergeCaptureRows([{ providerEventId: "x", kickoffUtc: EARLY }], [], { priorCapturedAt: null });
  assert.equal(undated.carried, 0, "a row with no stamp anywhere cannot be shown to be pregame");
});

test("a row from before rows carried a stamp inherits the document's", () => {
  const { rows, carried } = mergeCaptureRows([{ providerEventId: "x", kickoffUtc: EARLY }], [], { priorCapturedAt: SAT });
  assert.equal(carried, 1);
  assert.equal(rows[0].capturedAt, SAT);
  assert.equal(rowCapturedAt({ capturedAt: SUN_LATE }, { capturedAt: SAT }), SUN_LATE, "the row's own stamp wins");
  assert.equal(rowCapturedAt({}, { capturedAt: SAT }), SAT, "and the document's is the fallback");
  assert.equal(rowCapturedAt(null, null), null);
});

test("nothing prior, nothing carried — and an empty run carries everything it can", () => {
  assert.deepEqual(mergeCaptureRows([], [row("a", EARLY, SAT)], {}).rows.map((r) => r.providerEventId), ["a"]);
  assert.equal(mergeCaptureRows(null, null, {}).rows.length, 0);
  // An empty capture is refused elsewhere, but if it ever reached here the prices must survive it.
  assert.equal(mergeCaptureRows([row("a", EARLY, SAT)], [], { priorCapturedAt: SAT }).carried, 1);
});
