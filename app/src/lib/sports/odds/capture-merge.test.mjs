import test from "node:test";
import assert from "node:assert/strict";
import { mergeCaptureRows, rowCapturedAt, carryPropsForward } from "./capture-merge.mjs";

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

/**
 * PROPS SURVIVE A RUN THAT DID NOT ASK ABOUT THEM.
 *
 * ⚠ CAUGHT BEFORE IT FIRED, 2026-09-25. A full-week sweep published 775 prop prices. Props are
 * swept on six crons; the three ordinary NFL windows buy only the 3-credit team call. The capture
 * rebuilt `propMarkets`/`propPrices` from THIS run's probe unconditionally, so the first ordinary
 * window a few hours later would have published `NOT_PROBED` and `null` — every board, game report
 * and Vault row back to "Not checked", with a green job and a valid artifact.
 */
test("a run that did not probe carries the prior prop block forward, unchanged", () => {
  const prior = {
    propMarkets: { state: "PROBED", probedEventIds: ["nfl-401872953"], offeredMarkets: ["player_anytime_td"] },
    propPrices: { capturedAt: "2026-09-25T04:58:57Z", rows: [{ canonicalEventId: "nfl-401872953", playerId: "nfl-athlete-1", family: "anytime_td", yesOdds: -135, sportsbook: "draftkings", capturedAt: "2026-09-25T04:58:57Z" }] },
  };
  const carried = carryPropsForward(prior, null);
  assert.ok(carried, "a team-only run must not publish an empty prop block over a real one");
  assert.deepEqual(carried.propMarkets, prior.propMarkets);
  assert.deepEqual(carried.propPrices, prior.propPrices);
  assert.equal(carried.propPrices.rows[0].capturedAt, "2026-09-25T04:58:57Z",
    "a carried price keeps its OWN instant — re-dating it to now would launder a stale price as fresh");
  /* Same answer whatever shape "did not probe" took. */
  for (const probe of [undefined, { state: "NO_TARGET" }, { state: "NO_MARKET" }, { state: "REFUSED_BUDGET" }]) {
    assert.ok(carryPropsForward(prior, probe), `state ${JSON.stringify(probe)} must still carry`);
  }
});

test("a run that DID probe keeps its own answer — a carry must never beat a fresh measurement", () => {
  const prior = { propMarkets: { state: "PROBED", probedEventIds: ["nfl-401872953"] }, propPrices: { rows: [{}] } };
  assert.equal(carryPropsForward(prior, { state: "PROBED", events: [] }), null,
    "this run asked; its answer wins, including when the answer is that nothing is offered now");
});

test("nothing worth carrying is not carried", () => {
  assert.equal(carryPropsForward(null, null), null);
  assert.equal(carryPropsForward({}, null), null);
  assert.equal(carryPropsForward({ propMarkets: { state: "NOT_PROBED", probedEventIds: [] } }, null), null,
    "a prior that never probed carries nothing — an empty block must not be laundered into evidence");
});
