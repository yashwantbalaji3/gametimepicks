/**
 * Guards for the paid-run gate.
 *
 * These are money proofs, not style proofs. Every SKIP below is a credit this repo does not spend
 * twice, and the failing direction of each one is a real charge against a real balance — so the
 * fail-closed cases are asserted as hard as the happy path.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PAID_RUN_STATES, decidePaidRun, formatDecision } from "./paid-run-gate.mjs";

const TODAY = "2026-09-10";

test("a clean day runs", () => {
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 0, newestBoardDate: "2026-09-09" });
  assert.equal(d.run, true);
  assert.equal(d.state, PAID_RUN_STATES.RUN_SCHEDULED);
});

test("a second trigger on the same day does NOT spend", () => {
  // This is the case P253's chain creates: nightly-settle completes and fires morning-projections,
  // and later the 13:30 backstop cron fires it again. Exactly one of them may pay.
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 1, newestBoardDate: "2026-09-09" });
  assert.equal(d.run, false);
  assert.equal(d.state, PAID_RUN_STATES.SKIP_ALREADY_RAN);
});

test("today's board on disk stops a spend even when run history shows nothing", () => {
  // A recovery path can commit a board without a morning-projections success ever appearing.
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 0, newestBoardDate: TODAY });
  assert.equal(d.run, false);
  assert.equal(d.state, PAID_RUN_STATES.SKIP_BOARD_PRESENT);
});

test("a board from the FUTURE also stops a spend", () => {
  // A next-day board exists on late-evening ET runs. Today's work is not owed twice because the
  // clock rolled; `>=` is the comparison, not `===`.
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 0, newestBoardDate: "2026-09-11" });
  assert.equal(d.run, false);
  assert.equal(d.state, PAID_RUN_STATES.SKIP_BOARD_PRESENT);
});

test("a stale board does NOT stop a spend", () => {
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 0, newestBoardDate: "2026-09-08" });
  assert.equal(d.run, true, "yesterday's board is not today's work product");
});

test("'none' is treated as no board, not as a date", () => {
  const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: 0, newestBoardDate: "none" });
  assert.equal(d.run, true);
  assert.equal(d.state, PAID_RUN_STATES.RUN_SCHEDULED);
  // The failure this guards: "none" >= "2026-09-10" is TRUE in JavaScript string comparison, so a
  // naive compare would refuse to run on the one day there is nothing at all.
});

test("unknown run history fails CLOSED", () => {
  for (const unknown of [null, undefined, NaN, "3"]) {
    const d = decidePaidRun({ etDate: TODAY, successfulRunsToday: unknown, newestBoardDate: null });
    assert.equal(d.run, false, `history=${String(unknown)} must not spend`);
    assert.equal(d.state, PAID_RUN_STATES.SKIP_UNKNOWN_HISTORY);
  }
});

test("a missing ET date fails CLOSED", () => {
  const d = decidePaidRun({ etDate: "", successfulRunsToday: 0, newestBoardDate: null });
  assert.equal(d.run, false);
});

test("force overrides every skip — but only force", () => {
  const d = decidePaidRun({ forced: true, etDate: TODAY, successfulRunsToday: 5, newestBoardDate: TODAY });
  assert.equal(d.run, true);
  assert.equal(d.state, PAID_RUN_STATES.RUN_FORCED);
  // And force is never inferred: only an explicit true reaches it.
  for (const notForced of [false, undefined, null, 0, ""]) {
    const s = decidePaidRun({ forced: notForced, etDate: TODAY, successfulRunsToday: 5, newestBoardDate: TODAY });
    assert.equal(s.run, false, `forced=${String(notForced)} must not be read as force`);
  }
});

test("the decision line puts the verdict first", () => {
  // The workflow parses `head -1`, and every caller in this repo reads the first token.
  assert.match(formatDecision(decidePaidRun({ etDate: TODAY, successfulRunsToday: 0 })), /^RUN /);
  assert.match(formatDecision(decidePaidRun({ etDate: TODAY, successfulRunsToday: 2 })), /^SKIP /);
});

/* MUTATION PROBE — the gate is only worth its comment if the unsafe direction actually fails. */
test("probe: a gate that defaulted to RUN would break these guards", () => {
  const unsafe = ({ forced = false }) => ({ run: true, state: "RUN_SCHEDULED", reason: "always" });
  // Stand-in for a regression where the gate stops consulting its evidence.
  assert.equal(unsafe({}).run, true);
  assert.notEqual(
    unsafe({}).run,
    decidePaidRun({ etDate: TODAY, successfulRunsToday: 1 }).run,
    "the real gate must disagree with an always-run gate on the duplicate case",
  );
});
