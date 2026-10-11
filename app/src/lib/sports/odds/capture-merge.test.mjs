import test from "node:test";
import assert from "node:assert/strict";
import { mergeCaptureRows, rowCapturedAt, carryPropsForward, carryUnreachedProps, unreachedTargets } from "./capture-merge.mjs";

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

/* ── a sweep cut short (2026-10-11: the credit gate refused BUF @ LAR, the 14th of 14) ───────────────────────── */
const SAT_SWEEP = "2026-10-10T17:32:23Z";
const SUN_SWEEP = "2026-10-11T11:41:55Z";
const pev = (id) => ({ canonicalEventId: id, matchup: id, offeredMarkets: ["player_anytime_td"], absentMarkets: [] });
const prow = (id, at, odds = -110) => ({ canonicalEventId: id, playerId: `p-${id}`, family: "anytime_td", yesOdds: odds, sportsbook: "draftkings", capturedAt: at });
const capture = (at, ids, rows) => ({
  capturedAt: at,
  propMarkets: { state: "PROBED", probedEventIds: ids, eventsProbed: ids.length, offeredMarkets: ["player_anytime_td"], absentMarkets: [], perEvent: ids.map(pev) },
  propPrices: { referenceBook: "draftkings", probedEventIds: ids, capturedAt: at, rows },
});
const SAT_CAP = capture(SAT_SWEEP, ["sun-1", "mnf"], [prow("sun-1", SAT_SWEEP, -120), prow("mnf", SAT_SWEEP, 105)]);
const SUN_CAP = capture(SUN_SWEEP, ["sun-1"], [prow("sun-1", SUN_SWEEP, -130)]);

test("an event the sweep targeted and never reached keeps the prior sweep's answer, at the prior sweep's time", () => {
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, ["mnf"]);
  assert.deepEqual(out.carriedEventIds, ["mnf"]);
  assert.deepEqual(out.propMarkets.probedEventIds, ["sun-1", "mnf"], "it reads PROBED (by the run that probed it), not NOT_PROBED");
  assert.equal(out.propMarkets.eventsProbed, 2);
  const mnfEvent = out.propMarkets.perEvent.find((e) => e.canonicalEventId === "mnf");
  assert.equal(mnfEvent.carriedForward, true);
  assert.equal(mnfEvent.probedAt, SAT_SWEEP, "the carried answer names WHEN it was asked");
  const mnfRow = out.propPrices.rows.find((r) => r.canonicalEventId === "mnf");
  assert.equal(mnfRow.capturedAt, SAT_SWEEP, "a carried price keeps its OWN stamp — never re-dated to this run");
  assert.equal(mnfRow.yesOdds, 105);
  assert.equal(mnfRow.carriedForward, true);
  assert.deepEqual(out.propPrices.probedEventIds, ["sun-1", "mnf"]);
});

test("an event the sweep DID reach keeps only its fresh answer — the prior price is never mixed back in", () => {
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, ["mnf"]);
  const sun1 = out.propPrices.rows.filter((r) => r.canonicalEventId === "sun-1");
  assert.equal(sun1.length, 1);
  assert.equal(sun1[0].capturedAt, SUN_SWEEP);
  assert.equal(sun1[0].yesOdds, -130);
  /* Even if the caller wrongly lists a reached event as unreached, the fresh answer wins. */
  const wrong = carryUnreachedProps(SAT_CAP, SUN_CAP, ["sun-1", "mnf"]);
  assert.deepEqual(wrong.carriedEventIds, ["mnf"]);
  assert.equal(wrong.propPrices.rows.filter((r) => r.canonicalEventId === "sun-1").length, 1);
});

test("an unreached event the prior run never probed stays NOT_PROBED — nothing is invented", () => {
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, ["never-asked"]);
  assert.deepEqual(out.carriedEventIds, []);
  assert.deepEqual(out.propMarkets.probedEventIds, ["sun-1"]);
  assert.equal(out.propMarkets, SUN_CAP.propMarkets, "returns this run's own block untouched");
});

test("a completed sweep, a prior that never probed, or a run that did not probe carries nothing", () => {
  assert.deepEqual(carryUnreachedProps(SAT_CAP, SUN_CAP, []).carriedEventIds, []);
  assert.deepEqual(carryUnreachedProps(null, SUN_CAP, ["mnf"]).carriedEventIds, []);
  assert.deepEqual(carryUnreachedProps({ propMarkets: { state: "NOT_PROBED", probedEventIds: [] } }, SUN_CAP, ["mnf"]).carriedEventIds, []);
  assert.deepEqual(carryUnreachedProps(SAT_CAP, { propMarkets: { state: "REFUSED_BUDGET" }, propPrices: null }, ["mnf"]).carriedEventIds, [],
    "a run with no answer of its own is carryPropsForward's case, not this one");
});

test("a prior row without its own capture stamp is not a price and is not carried", () => {
  const prior = capture(SAT_SWEEP, ["sun-1", "mnf"], [prow("mnf", SAT_SWEEP), { ...prow("mnf", SAT_SWEEP), playerId: "unstamped", capturedAt: null }]);
  const out = carryUnreachedProps(prior, SUN_CAP, ["mnf"]);
  assert.deepEqual(out.propPrices.rows.filter((r) => r.canonicalEventId === "mnf").map((r) => r.playerId), ["p-mnf"]);
});

test("the capture script records the unreached targets and applies the carry before it writes", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../../../scripts/nfl/capture-nfl-odds.mjs", import.meta.url), "utf8");
  assert.match(src, /unreachedEventIds:\s*unreachedTargets\(targets, perEvent/, "a cut-short sweep names the events it never reached");
  assert.match(src, /carryUnreachedProps\(priorPublic, publicArtifact, propProbe\?\.unreachedEventIds/, "and the write carries their prior answer");
  assert.ok(src.indexOf("carryUnreachedProps(priorPublic") < src.indexOf("// leak-guard every artifact, then write"), "before the artifact is written");
  assert.match(src, /::warning::prop sweep stopped early/, "a truncated sweep is loud, not a quiet green job");
});

/* ── the eight cases (founder D2, 2026-10-11). Invariant: a partial capture never destroys valid earlier data for an
   unreached event, and a freshly reached event is never overwritten with stale data. ─────────────────────────── */
const T = (id) => ({ providerEventId: `odds-${id}` });
const canon = (oddsId) => oddsId.replace(/^odds-/, "");
const sweep = (reachedIds) => reachedIds.map((id) => ({ oddsEventId: `odds-${id}` }));

test("(a) every requested event reached: nothing is unreached and nothing is carried", () => {
  const un = unreachedTargets([T("sun-1"), T("mnf")], sweep(["sun-1", "mnf"]), canon);
  assert.deepEqual(un, []);
  const fresh = capture(SUN_SWEEP, ["sun-1", "mnf"], [prow("sun-1", SUN_SWEEP), prow("mnf", SUN_SWEEP, 120)]);
  const out = carryUnreachedProps(SAT_CAP, fresh, un);
  assert.deepEqual(out.carriedEventIds, []);
  assert.ok(out.propPrices.rows.every((r) => r.capturedAt === SUN_SWEEP), "only this run's prices");
});

test("(b) the sweep ends early: exactly the targets after the stop are unreached, in request order", () => {
  assert.deepEqual(unreachedTargets([T("a"), T("b"), T("c"), T("d")], sweep(["a", "b"]), canon), ["c", "d"]);
});

test("(c) the credit ceiling is exhausted: before the first event the whole prior answer stands; mid-sweep, the unreached keep theirs", () => {
  /* Refused before any event: the run has no answer of its own — carryPropsForward keeps the prior block whole. */
  const kept = carryPropsForward(SAT_CAP, { state: "REFUSED_BUDGET", reason: "ceiling" });
  assert.equal(kept.propMarkets, SAT_CAP.propMarkets);
  assert.equal(kept.propPrices, SAT_CAP.propPrices);
  /* Refused on the 14th of 14 (the 2026-10-11 shape): 13 fresh, 1 carried, and the two are reported apart. */
  const un = unreachedTargets([T("sun-1"), T("mnf")], sweep(["sun-1"]), canon);
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, un);
  assert.deepEqual(out.propMarkets.freshlyProbedEventIds, ["sun-1"]);
  assert.deepEqual(out.propMarkets.carriedEventIds, ["mnf"]);
  assert.equal(out.propMarkets.carriedFrom, SAT_SWEEP);
});

test("(d) an event never probed before stays NOT_PROBED — the carry invents nothing", () => {
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, ["new-game"]);
  assert.deepEqual(out.carriedEventIds, []);
  assert.ok(!out.propMarkets.probedEventIds.includes("new-game"));
});

test("(e) a fresh capture that legitimately reports NO offers wins — the stale prices are not brought back", () => {
  /* The provider answered 422 / no markets for mnf this run: it was REACHED, so it is not unreached. */
  const fresh = capture(SUN_SWEEP, ["sun-1", "mnf"], [prow("sun-1", SUN_SWEEP)]);
  fresh.propMarkets.perEvent = [pev("sun-1"), { canonicalEventId: "mnf", offeredMarkets: [], absentMarkets: ["player_anytime_td"] }];
  const un = unreachedTargets([T("sun-1"), T("mnf")], sweep(["sun-1", "mnf"]), canon);
  assert.deepEqual(un, []);
  const out = carryUnreachedProps(SAT_CAP, fresh, un);
  assert.equal(out.propPrices.rows.filter((r) => r.canonicalEventId === "mnf").length, 0, "NOT_OFFERED now — Saturday's price is not resurrected");
  /* Even if a caller listed it as unreached, the fresh NOT_OFFERED answer wins. */
  assert.deepEqual(carryUnreachedProps(SAT_CAP, fresh, ["mnf"]).carriedEventIds, []);
});

test("(f) previously captured prices for an unreached event are carried, unchanged, with their own provenance", () => {
  const out = carryUnreachedProps(SAT_CAP, SUN_CAP, ["mnf"]);
  const before = SAT_CAP.propPrices.rows.filter((r) => r.canonicalEventId === "mnf");
  const after = out.propPrices.rows.filter((r) => r.canonicalEventId === "mnf");
  assert.deepEqual(after.map(({ carriedForward, ...r }) => r), before, "values, identities and capturedAt identical; only the carried mark is added");
  assert.ok(after.every((r) => r.carriedForward === true));
});

test("(g) a previous capture with missing timestamps: unstamped rows are not carried, and an unstamped answer is not carried at all", () => {
  const noRowStamp = capture(SAT_SWEEP, ["sun-1", "mnf"], [{ ...prow("mnf", SAT_SWEEP), capturedAt: null }]);
  const a = carryUnreachedProps(noRowStamp, SUN_CAP, ["mnf"]);
  assert.equal(a.propPrices.rows.filter((r) => r.canonicalEventId === "mnf").length, 0, "an unstamped row is not a price");
  const noStampAtAll = capture(SAT_SWEEP, ["sun-1", "mnf"], [prow("mnf", SAT_SWEEP)]);
  noStampAtAll.capturedAt = null; noStampAtAll.propPrices.capturedAt = null;
  assert.deepEqual(carryUnreachedProps(noStampAtAll, SUN_CAP, ["mnf"]).carriedEventIds, [], "no time ⇒ no claim that it was asked");
});

test("(h) the previous artifact is unavailable: nothing is carried and this run's answer is written as-is", () => {
  for (const prior of [null, undefined, {}]) {
    const out = carryUnreachedProps(prior, SUN_CAP, ["mnf"]);
    assert.deepEqual(out.carriedEventIds, []);
    assert.equal(out.propMarkets, SUN_CAP.propMarkets);
  }
  assert.equal(carryPropsForward(null, { state: "REFUSED_BUDGET" }), null);
});
