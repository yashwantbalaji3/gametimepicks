import test from "node:test";
import assert from "node:assert/strict";
import { traceGame, foldTraces, familyStateOf, LIVE_GRACE_MS, GAME_DURATION_MS } from "./lifecycle-trace.mjs";
import { RECONCILIATION_WINDOW_MS } from "./live-prop-state.mjs";

const KICK = "2026-09-27T17:00:00Z";
const kickMs = Date.parse(KICK);
const at = (ms) => new Date(kickMs + ms).toISOString();

const board = (families = { player_rush_yds: { state: "PUBLISHED" }, player_pass_yds: { state: "ESTIMATE" } }) =>
  ({ providerEventId: "E1", matchup: "A @ B", kickoffUtc: KICK, generatedAt: at(-3600_000), families });

const live = (o = {}) => ({
  providerEventId: "E1", matchup: "A @ B", kickoffUtc: KICK,
  phase: "IN_PROGRESS", frozenFrom: at(-3600_000), observedAt: at(30 * 60_000),
  counts: { rows: 2, withLiveStat: 1 }, rows: [], ...o,
});

const stageOf = (t, name) => t.stages.find((s) => s.stage === name);

const trace = (o) => traceGame({ providerEventId: "E1", kickoffUtc: KICK, settlementRows: [], inResults: false, ...o });

test("BOTH board family shapes are read — a string state and a {state} object", () => {
  assert.equal(familyStateOf("PUBLISHED"), "PUBLISHED");
  assert.equal(familyStateOf({ state: "PUBLISHED" }), "PUBLISHED");
  assert.equal(familyStateOf(null), null);

  // ⚠ THE VACUOUS-GUARD PROBE. The first draft compared the OBJECT to "PUBLISHED" and reported "no
  // family cleared its bar" on all sixteen games of a healthy slate. Both shapes must name the family.
  for (const families of [{ f: "PUBLISHED" }, { f: { state: "PUBLISHED" } }]) {
    const t = trace({ board: { ...board(families), families }, now: at(-3600_000) });
    assert.equal(stageOf(t, "BOARD").state, "OK");
    assert.match(stageOf(t, "BOARD").note, /1 published family/);
  }
});

test("a healthy Sunday morning is IN_FLIGHT, never ATTENTION — an empty stage before its time is NOT_YET", () => {
  const t = trace({ board: board(), live: live({ phase: "PRE", counts: { rows: 2, withLiveStat: 0 } }), now: at(-7200_000) });
  assert.equal(t.verdict, "IN_FLIGHT");
  assert.equal(stageOf(t, "LIVE_OBSERVATION").state, "NOT_YET");
  assert.equal(stageOf(t, "FINAL_PROVISIONAL").state, "NOT_YET");
  assert.equal(stageOf(t, "RESULTS").state, "NOT_YET");
});

test("a game with no board at all is MISSING once it has kicked off, and NOT_YET before", () => {
  assert.equal(stageOf(trace({ board: null, now: at(-60_000) }), "BOARD").state, "NOT_YET");
  assert.equal(stageOf(trace({ board: null, now: at(60_000) }), "BOARD").state, "MISSING");
});

test("a board generated AT OR AFTER kickoff is INCONSISTENT — it is not a pregame record", () => {
  const b = { ...board(), generatedAt: at(60_000) };
  assert.equal(stageOf(trace({ board: b, now: at(120_000) }), "BOARD").state, "INCONSISTENT");
});

test("an artifact still saying PRE past the grace period is MISSING, not merely late", () => {
  const stale = live({ phase: "PRE", counts: { rows: 2, withLiveStat: 0 } });
  assert.equal(stageOf(trace({ board: board(), live: stale, now: at(LIVE_GRACE_MS - 60_000) }), "LIVE_ARTIFACT").state, "OK");
  assert.equal(stageOf(trace({ board: board(), live: stale, now: at(LIVE_GRACE_MS + 60_000) }), "LIVE_ARTIFACT").state, "MISSING");
});

test("an artifact with no frozenFrom is INCONSISTENT — unstamped pregame provenance", () => {
  assert.equal(stageOf(trace({ board: board(), live: live({ frozenFrom: null }), now: at(600_000) }), "LIVE_ARTIFACT").state, "INCONSISTENT");
});

test("a GRADED FORECAST on an unpublished family is INCONSISTENT; a live VALUE on one is not", () => {
  const valueOnly = live({ rows: [{ family: "player_pass_yds", familyState: "ESTIMATE", live: { statValue: 256 }, settlement: { forecastResult: null } }] });
  assert.equal(stageOf(trace({ board: board(), live: valueOnly, now: at(600_000) }), "LIVE_ARTIFACT").state, "OK",
    "the public board already carries every family's projection with its state label — repeating the number claims nothing new");

  const gradedOnUnpublished = live({ rows: [{ family: "player_pass_yds", familyState: "ESTIMATE", live: { statValue: 256 }, settlement: { forecastResult: "WIN" } }] });
  assert.equal(stageOf(trace({ board: board(), live: gradedOnUnpublished, now: at(600_000) }), "LIVE_ARTIFACT").state, "INCONSISTENT");

  // NOT_PUBLISHED is the refusal itself and must never read as a grade.
  const refused = live({ rows: [{ family: "player_pass_yds", familyState: "ESTIMATE", settlement: { forecastResult: "NOT_PUBLISHED" } }] });
  assert.equal(stageOf(trace({ board: board(), live: refused, now: at(600_000) }), "LIVE_ARTIFACT").state, "OK");
});

test("an observedAt BEFORE kickoff is a pregame read presented as live — INCONSISTENT", () => {
  const t = trace({ board: board(), live: live({ observedAt: at(-600_000) }), now: at(1800_000) });
  assert.equal(stageOf(t, "LIVE_OBSERVATION").state, "INCONSISTENT");
});

test("kicked off, refreshed, and not one live value landed is MISSING — the healthiest-looking failure", () => {
  const none = live({ phase: "IN_PROGRESS", counts: { rows: 2, withLiveStat: 0 } });
  assert.equal(stageOf(trace({ board: board(), live: none, now: at(LIVE_GRACE_MS + 60_000) }), "LIVE_OBSERVATION").state, "MISSING");
});

test("a board with NO published family makes zero live values correct, not a gap", () => {
  const b = board({ player_pass_yds: { state: "ESTIMATE" } });
  const none = live({ phase: "IN_PROGRESS", counts: { rows: 2, withLiveStat: 0 } });
  assert.equal(stageOf(trace({ board: b, live: none, now: at(GAME_DURATION_MS - 60_000) }), "LIVE_OBSERVATION").state, "OK");
});

test("settlement rows while the artifact still says IN_PROGRESS is INCONSISTENT", () => {
  const rows = [{ finality: "PROVISIONAL", frozenIdentity: "x" }];
  const t = trace({ board: board(), live: live({ phase: "IN_PROGRESS" }), settlementRows: rows, now: at(3600_000) });
  assert.equal(stageOf(t, "FINAL_PROVISIONAL").state, "INCONSISTENT");
});

test("⚠ CANONICAL: still provisional is NOT_YET while the window is open and MISSING once it closes", () => {
  const ffo = at(3 * 3600_000);
  const fin = live({ phase: "FINAL", finalFirstObservedAt: ffo, finality: "PROVISIONAL", counts: { rows: 2, withLiveStat: 2 } });
  const rows = [{ finality: "PROVISIONAL", frozenIdentity: "x" }];
  const open = traceGame({ providerEventId: "E1", kickoffUtc: KICK, board: board(), live: fin, settlementRows: rows, inResults: true,
    now: new Date(Date.parse(ffo) + RECONCILIATION_WINDOW_MS - 60_000).toISOString() });
  assert.equal(stageOf(open, "FINAL_CANONICAL").state, "NOT_YET");

  const closed = traceGame({ providerEventId: "E1", kickoffUtc: KICK, board: board(), live: fin, settlementRows: rows, inResults: true,
    now: new Date(Date.parse(ffo) + RECONCILIATION_WINDOW_MS + 60_000).toISOString() });
  assert.equal(stageOf(closed, "FINAL_CANONICAL").state, "MISSING");
  assert.equal(closed.verdict, "ATTENTION");
});

test("every stage OK is CLEAN — the whole lifecycle, end to end", () => {
  const ffo = at(3 * 3600_000);
  const t = traceGame({
    providerEventId: "E1", kickoffUtc: KICK, board: board(),
    live: live({ phase: "FINAL", finalFirstObservedAt: ffo, finality: "CANONICAL", observedAt: ffo, counts: { rows: 2, withLiveStat: 2 } }),
    settlementRows: [{ finality: "CANONICAL", frozenIdentity: "x" }],
    inResults: true,
    now: new Date(Date.parse(ffo) + RECONCILIATION_WINDOW_MS + 60_000).toISOString(),
  });
  assert.equal(t.verdict, "CLEAN", JSON.stringify(t.stages, null, 1));
});

test("⚠ NO_GAMES is a result — an empty slate must not read as a failure", () => {
  const f = foldTraces([]);
  assert.equal(f.state, "NO_GAMES");
  assert.equal(f.games, 0);
});

test("a slate folds to ATTENTION if ANY game needs it, and never hides it behind clean ones", () => {
  const ok = trace({ board: board(), live: live({ phase: "PRE", counts: { rows: 1, withLiveStat: 0 } }), now: at(-7200_000) });
  const bad = trace({ board: null, now: at(600_000) });
  const f = foldTraces([ok, bad]);
  assert.equal(f.state, "ATTENTION");
  assert.equal(f.attention, 1);
  assert.equal(f.inFlight, 1);
});

test("⚠ a board/schedule kickoff disagreement is INCONSISTENT for THAT game, and only that game", () => {
  const contested = { ...board(), kickoffUtc: "2026-09-27T17:05:00Z" };   // schedule says 17:00
  const t = traceGame({ providerEventId: "E1", kickoffUtc: KICK, board: contested, live: null, settlementRows: [], inResults: false, now: at(-7200_000) });
  const s = stageOf(t, "BOARD");
  assert.equal(s.state, "INCONSISTENT");
  assert.match(s.note, /EXCLUDED from live tracking/);

  // The same instant written two ways is NOT a disagreement — boards write the short form.
  const short = { ...board(), kickoffUtc: "2026-09-27T17:00Z" };
  assert.equal(stageOf(traceGame({ providerEventId: "E1", kickoffUtc: KICK, board: short, settlementRows: [], inResults: false, now: at(-7200_000) }), "BOARD").state, "OK");

  // And it does not spread: a healthy game beside it still folds as IN_FLIGHT, not ATTENTION.
  const healthy = trace({ board: board(), live: live({ phase: "PRE", counts: { rows: 1, withLiveStat: 0 } }), now: at(-7200_000) });
  const f = foldTraces([t, healthy]);
  assert.equal(f.attention, 1);
  assert.equal(f.inFlight, 1);
});

test("an UNCOMMITTED live artifact is INCONSISTENT — a local shadow is not committed evidence", () => {
  /*
   * ⚠ THE DEFECT THIS PINS, measured on 2026-09-26. Sixteen live-props artifacts sat untracked in a
   * working tree; NO commit in the repository's history had ever touched that path. The trace read
   * them off the filesystem and reported `✓ LIVE_ARTIFACT ... frozen 2026-09-25T18:25:54Z` for all
   * fourteen Sunday games, and the handoff recorded that as slate health. A clean checkout of the
   * same commit said `not kicked off yet` for all fourteen.
   */
  const shadow = live({ phase: "PRE", counts: { rows: 2, withLiveStat: 0 } });
  const t = trace({ board: board(), live: shadow, liveCommitted: false, now: at(-7200_000) });
  assert.equal(stageOf(t, "LIVE_ARTIFACT").state, "INCONSISTENT");
  assert.match(stageOf(t, "LIVE_ARTIFACT").note, /NOT COMMITTED/);
  assert.equal(t.verdict, "ATTENTION", "a shadow must reach the operator, not sit inside an IN_FLIGHT line");

  // And the same artifact, committed, is the healthy pregame state it claims to be.
  const committed = trace({ board: board(), live: shadow, liveCommitted: true, now: at(-7200_000) });
  assert.equal(stageOf(committed, "LIVE_ARTIFACT").state, "OK");
  assert.equal(committed.verdict, "IN_FLIGHT");
});

test("`liveCommitted: null` means NOT DETERMINED and must accuse nothing", () => {
  /*
   * Null is not false. Where git cannot answer — a tarball, no git binary, a non-repository — an
   * unanswerable question must leave the stage exactly as it was before this check existed, or the
   * guard invents a defect on every machine that cannot run `git ls-files`.
   */
  const l = live({ phase: "PRE", counts: { rows: 2, withLiveStat: 0 } });
  for (const liveCommitted of [null, undefined]) {
    const t = trace({ board: board(), live: l, liveCommitted, now: at(-7200_000) });
    assert.equal(stageOf(t, "LIVE_ARTIFACT").state, "OK");
    assert.equal(t.verdict, "IN_FLIGHT");
  }
});
