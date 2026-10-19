/**
 * Founder decision 2026-10-19 (option B): a game an owner re-publishes on a later slate after a postponement.
 * Real case: Homer Nukes put ALCS game 849817 (TB @ CLE) on the 10-16 board; it did not play that day and the 10-18
 * board published it again at different probabilities (Martínez 0.1548 → 0.1229, Hoskins 0.1466 → 0.1163).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { forecastIdFor, identityKey } from "./identity.mjs";
import { homerNukesRows, POSTPONED_REPUBLISHED } from "./adapters/mlb.mjs";
import { composeLedger } from "./compose.mjs";
import { compareLedgers } from "./append-only.mjs";

const TUPLE = { sport: "MLB", eventId: "849817", subjectType: "PLAYER", subjectId: "mlb-player-682657", family: "mlb_homer_nukes", forecastKind: "BINARY_PROBABILITY" };

test("identity: no qualifier → the committed id is unchanged; a slate qualifier mints a distinct id; anything else throws", () => {
  assert.equal(forecastIdFor(TUPLE), "fl1-950e5a5e82cd88ab", "Martínez's committed 10-16 id (data/internal/forecast-ledger/v1/mlb.jsonl)");
  assert.equal(identityKey({ ...TUPLE, identityQualifier: null }), identityKey(TUPLE));
  const q = forecastIdFor({ ...TUPLE, identityQualifier: "slate:2026-10-18" });
  assert.notEqual(q, forecastIdFor(TUPLE));
  assert.equal(q, forecastIdFor({ ...TUPLE, identityQualifier: "slate:2026-10-18" }), "deterministic");
  for (const bad of ["2026-10-18", "slate:20261018", "slate:2026-10-18|x", 7, ""]) assert.throws(() => forecastIdFor({ ...TUPLE, identityQualifier: bad }), /identityQualifier/);
});

const pick = (playerId, probability, result, extra = {}) => ({ gamePk: 849817, playerId, player: `P${playerId}`, probability, result, matchup: "TB @ CLE", ...extra });
const file = (date, picks) => ({ file: `mlb/homer-nukes/settled-${date}.json`, doc: { date, settledAt: `${date}T09:00:00Z`, modelId: "mlb-homer-nukes-v1", picks } });

test("adapter: every pending pick on the earlier slate is VOID (never a miss); the re-picked player's later publication is its own graded forecast", () => {
  const rows = homerNukesRows([
    file("2026-10-16", [pick(682657, 0.1548, "pending"), pick(663993, 0.1458, "pending")]),
    file("2026-10-18", [pick(682657, 0.1229, "miss", { homeRuns: 0 }), pick(691406, 0.1717, "miss", { homeRuns: 0 })]),
  ]);
  const by = (pid, slate) => rows.find((r) => r.subjectId === `mlb-player-${pid}` && r.receiptId.includes(slate));
  for (const pid of [682657, 663993]) {
    const r = by(pid, "10-16");
    assert.equal(r.settlement.state, "VOID");
    assert.equal(r.settlement.reason, POSTPONED_REPUBLISHED);
    assert.equal(r.measurement.brier, null, "a VOID row is never measured");
    assert.equal(r.forecastId, forecastIdFor({ ...TUPLE, subjectId: `mlb-player-${pid}` }), "the earlier publication keeps its plain (committed) id");
  }
  const again = by(682657, "10-18");
  assert.equal(again.settlement.state, "SETTLED");
  assert.equal(again.probability, 0.1229, "graded on the probability shown on game day");
  assert.equal(again.forecastId, forecastIdFor({ ...TUPLE, identityQualifier: "slate:2026-10-18" }));
  assert.match(again.provenance.notes.join(" "), /re-publication on the 2026-10-18 slate/);
  assert.equal(by(691406, "10-18").forecastId, forecastIdFor({ ...TUPLE, subjectId: "mlb-player-691406" }), "a player first picked on the later slate keeps a plain id");
  assert.doesNotThrow(() => composeLedger([{ source: "mlb-homer-nukes-settled", rows }]));
});

test("adapter: a game on ONE slate is untouched (no qualifier, no void) — the rule fires only on re-publication", () => {
  const rows = homerNukesRows([file("2026-10-17", [pick(682657, 0.15, "pending"), pick(663993, 0.14, "hit", { homeRuns: 1 })])]);
  assert.deepEqual(rows.map((r) => r.settlement.state), ["PENDING", "SETTLED"]);
  assert.ok(rows.every((r) => r.provenance == null || !(r.provenance.notes ?? []).length));
});

test("an earlier pick the owner already GRADED is never voided — and a graded game re-picked stays a duplicate the build refuses", () => {
  const rows = homerNukesRows([
    file("2026-10-16", [pick(682657, 0.1548, "miss", { homeRuns: 0 }), pick(663993, 0.14, "hit", { homeRuns: 1 })]),
    file("2026-10-18", [pick(663993, 0.13, "miss", { homeRuns: 0 })]),
  ]);
  assert.equal(rows.find((r) => r.subjectId === "mlb-player-682657").settlement.state, "SETTLED", "graded rows keep their grade");
  // The re-picked player gets a qualified id, so no collision here — but a graded earlier row is not voided either.
  assert.equal(rows.filter((r) => r.settlement.reason === POSTPONED_REPUBLISHED).length, 0);
  // Same player twice on ONE slate is still an owner defect: same id twice → refused.
  const dup = homerNukesRows([file("2026-10-16", [pick(682657, 0.15, "pending"), pick(682657, 0.16, "pending")])]);
  assert.throws(() => composeLedger([{ source: "mlb-homer-nukes-settled", rows: dup }]), /duplicate forecastId/);
});

test("append-only: PENDING → VOID on the committed rows is allowed; the re-publication is a NEW row; nothing else moves", () => {
  const before = homerNukesRows([file("2026-10-16", [pick(682657, 0.1548, "pending"), pick(663993, 0.1458, "pending")])]);
  const after = homerNukesRows([
    file("2026-10-16", [pick(682657, 0.1548, "pending"), pick(663993, 0.1458, "pending")]),
    file("2026-10-18", [pick(682657, 0.1229, "miss", { homeRuns: 0 })]),
  ]);
  const prev = composeLedger([{ source: "mlb-homer-nukes-settled", rows: before }]);
  const next = composeLedger([{ source: "mlb-homer-nukes-settled", rows: after }]);
  assert.deepEqual(compareLedgers(prev, next), []);
  assert.equal(next.length, prev.length + 1);
  // The reverse (VOID → PENDING) is a violation — a voided postponed pick never comes back.
  assert.ok(compareLedgers(next, composeLedger([{ source: "mlb-homer-nukes-settled", rows: before }])).length > 0);
});
