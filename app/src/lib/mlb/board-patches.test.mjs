/**
 * Mutation proofs for append-only event coverage (Program 096-099 §12). Every §12 patch rule is
 * exercised: started-event refusal, overwrite refusal, idempotence, movement/official separation,
 * upstream-identity requirement, restamp refusal, forward-only, gap-zero accounting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rowIdentity,
  validatePatch,
  materialize,
  settlementPopulation,
  PATCH_KINDS,
  PATCH_SCHEMA_VERSION,
} from "./board-patches.mjs";

const NOW = "2026-08-01T19:30:00.000Z";
const later = (min) => new Date(Date.parse(NOW) + min * 60_000).toISOString();

const baseBoard = () => ({
  date: "2026-08-01",
  games: [
    { gamePk: 900, gameDate: later(-60) }, // early game, already started
    { gamePk: 901, gameDate: later(240) }, // evening, uncovered on base
  ],
  leans: [
    { gameId: "evA", gamePk: 900, marketKey: "batter_hits", playerId: 11, line: 1.5, side: "Over", capturedAt: later(-300) },
  ],
});

const patch = (over = {}) => ({
  schemaVersion: PATCH_SCHEMA_VERSION,
  patchId: "p1",
  seq: 1,
  kind: PATCH_KINDS.OFFICIAL_ADDITION,
  eventId: "evB",
  gamePk: 901,
  scheduledStart: later(240),
  capturedAt: NOW,
  requestWindowStart: later(-1),
  requestFingerprint: "oddsapi|mlb|evB|props|w1",
  rows: [
    { gameId: "evB", gamePk: 901, marketKey: "batter_hits", playerId: 22, line: 0.5, side: "Over", capturedAt: NOW },
  ],
  ...over,
});

test("IDENTITY · different players with null playerId must not collapse (real 2026-08-03 rows)", () => {
  // Caught on the live board before wiring patches into production: production rows often carry
  // playerId: null AND player: null — the participant exists only inside the canonical `id`.
  // The old composite fell back to the literal "team", collapsing genuinely different players
  // (211 rows → 206 identities). Under the patch contract that would have refused a legitimate
  // official addition as a "duplicate identity" and silently dropped a prediction.
  const realRows = [
    { id: "d5f05941c82f5ea7de7ee32d879c0d59-Jose_Tena-batter_hits-0.5", gameId: "d5f05941c82f5ea7de7ee32d879c0d59", marketKey: "batter_hits", playerId: null, player: null, line: 0.5, lean: "Pass" },
    { id: "d5f05941c82f5ea7de7ee32d879c0d59-Nasim_Nunez-batter_hits-0.5", gameId: "d5f05941c82f5ea7de7ee32d879c0d59", marketKey: "batter_hits", playerId: null, player: null, line: 0.5, lean: "Pass" },
    { id: "74ae10226cb75552e9cb91f8488d161e-Ivan_Herrera-batter_hits-0.5", gameId: "74ae10226cb75552e9cb91f8488d161e", marketKey: "batter_hits", playerId: null, player: null, line: 0.5, lean: "Pass" },
    { id: "74ae10226cb75552e9cb91f8488d161e-Jose_Caballero-batter_hits-0.5", gameId: "74ae10226cb75552e9cb91f8488d161e", marketKey: "batter_hits", playerId: null, player: null, line: 0.5, lean: "Pass" },
  ];
  const ids = realRows.map(rowIdentity);
  assert.equal(new Set(ids).size, realRows.length, "each distinct player must hold a distinct identity");
  assert.ok(ids.every((i) => i && !i.includes("|team|")), "the 'team' fallback must not swallow a named participant");

  // And the fallback still works when a row genuinely has no `id`.
  const noId = { gameId: "evX", marketKey: "batter_hits", player: "Someone", line: 1.5, lean: "Over" };
  assert.match(rowIdentity(noId), /^evX\|batter_hits\|Someone\|/);
  assert.equal(rowIdentity({ marketKey: "x" }), null, "identity still requires an event");
});

test("a valid future-event official addition is accepted and joins the population", () => {
  const m = materialize(baseBoard(), [patch()], NOW);
  assert.equal(m.accepted.length, 1);
  assert.equal(m.accounting.baseRows, 1);
  assert.equal(m.accounting.appendedOfficialRows, 1);
  assert.equal(m.accounting.publishedPopulation, 2);
  assert.equal(m.view.patchProvenance.length, 1, "patch provenance is exposed");
});

test("base board rows are byte-identical after materialization (immutability)", () => {
  const b = baseBoard();
  const before = JSON.stringify(b.leans);
  materialize(b, [patch()], NOW);
  assert.equal(JSON.stringify(b.leans), before, "materialize must never mutate the base");
});

test("MUTATION · patch targeting a started event is rejected", () => {
  const p = patch({ eventId: "evA", gamePk: 900, scheduledStart: later(-60), rows: [
    { gameId: "evA", gamePk: 900, marketKey: "pitcher_strikeouts", playerId: 33, line: 5.5, side: "Over", capturedAt: later(-90) },
  ] });
  const v = validatePatch(p, baseBoard(), [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.refusal, /already started/);
});

test("MUTATION · overwriting an existing row identity is refused, never last-write-wins", () => {
  const dup = patch({ eventId: "evA", gamePk: 901, rows: [
    // Same identity as the base row, but pointed at the future event's patch: identity check
    // still catches it because identity is event+market+participant+line+side.
    { gameId: "evA", gamePk: 900, marketKey: "batter_hits", playerId: 11, line: 1.5, side: "Over", capturedAt: NOW },
  ] });
  const v = validatePatch(dup, baseBoard(), [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.refusal, /eventId differs|identity already published/);
  // And an exact same-event duplicate against an ACCEPTED patch:
  const first = patch();
  const second = patch({ patchId: "p2", seq: 2 });
  const m = materialize(baseBoard(), [first, second], NOW);
  assert.equal(m.accepted.length, 1);
  assert.match(m.refused[0].refusal, /identity already published/);
});

test("MUTATION · duplicate patch application is idempotent", () => {
  const p = patch();
  const m = materialize(baseBoard(), [p, { ...p }], NOW);
  assert.equal(m.accepted.length, 1);
  assert.equal(m.accounting.publishedPopulation, 2, "re-applying cannot duplicate rows");
  assert.match(m.refused[0].refusal, /duplicate patchId/);
});

test("MUTATION · movement snapshot never enters the official population or settlement", () => {
  const mv = patch({ patchId: "mv1", seq: 3, kind: PATCH_KINDS.MOVEMENT_SNAPSHOT, rows: [
    { gameId: "evB", gamePk: 901, marketKey: "batter_hits", playerId: 22, line: 0.5, side: "Over", capturedAt: later(1) },
  ] });
  const m = materialize(baseBoard(), [patch(), mv], NOW);
  assert.equal(m.accounting.appendedOfficialRows, 1, "movement rows not appended");
  assert.equal(m.accounting.movementSnapshotRows, 1, "but they are counted separately");
  const s = settlementPopulation(baseBoard(), [patch(), mv], NOW);
  assert.equal(s.rows.length, 2, "settlement = base + official additions ONLY");
});

test("MUTATION · remove upstream event identity → patch fails", () => {
  const b = baseBoard();
  b.games = b.games.filter((g) => g.gamePk !== 901);
  assert.equal(b.games.length, 1, "mutation must actually apply");
  const v = validatePatch(patch(), b, [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.refusal, /not on the base board schedule/);
});

test("MUTATION · cached provider payload cannot be restamped as a new capture", () => {
  const stale = patch({ capturedAt: later(-30), requestWindowStart: NOW });
  const v = validatePatch(stale, baseBoard(), [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.refusal, /cached data cannot be restamped/);
  const postStart = patch({ rows: [{ gameId: "evB", gamePk: 901, marketKey: "batter_hits", playerId: 22, line: 0.5, side: "Over", capturedAt: later(300) }] });
  assert.match(validatePatch(postStart, baseBoard(), [], NOW).refusal, /at\/after scheduled start/);
});

test("MUTATION · forward-only: a pre-rollout board refuses all patches", () => {
  const b = { ...baseBoard(), date: "2026-07-31" };
  const v = validatePatch(patch(), b, [], NOW);
  assert.equal(v.ok, false);
  assert.match(v.refusal, /forward-only/);
});

test("materialization is deterministic regardless of input order", () => {
  const p1 = patch();
  const p2 = patch({ patchId: "p2", seq: 2, rows: [
    { gameId: "evB", gamePk: 901, marketKey: "pitcher_strikeouts", playerId: 44, line: 4.5, side: "Under", capturedAt: NOW },
  ] });
  const a = materialize(baseBoard(), [p1, p2], NOW);
  const b = materialize(baseBoard(), [p2, p1], NOW);
  assert.deepEqual(a.view.leans, b.view.leans);
  assert.equal(a.accounting.publishedPopulation, 3);
});

test("gap-zero: base + patch accounting always reconciles", () => {
  const m = materialize(baseBoard(), [patch()], NOW);
  assert.equal(
    m.accounting.publishedPopulation,
    m.accounting.baseRows + m.accounting.appendedOfficialRows,
    "population must close gap-zero",
  );
  assert.equal(m.view.leans.length, m.accounting.publishedPopulation);
});
