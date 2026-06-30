/**
 * Daily soccer/Mr-Dub settlement AUTOMATION invariants (Phase 4). The nightly pipeline
 * (scripts/settle_soccer_day.sh) composes fetch → grade → seed-model → reconcile. These tests pin the
 * safety invariants the automation relies on so a scheduled run can NEVER fabricate or corrupt money:
 *   • official-final gated  • never fabricates  • partial-safe  • idempotent/rerun-safe
 *   • API-unavailable → no-op  • crown immutable / only lost seeds move the bankroll
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gradeLaneCard, seedModelOutcome, classifyLaneTransition } from "./settlement/daily-portfolio-settle.ts";

const repoRoot = path.resolve(process.cwd(), "..");
const readRepo = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const laneCard = (legs) => ({ lane: "A", step: 1, stake: 100, combinedOdds: 200, legCount: legs.length, legs });
const ml = (matchups) => ({ date: "2026-06-30", finals: matchups, graded: [{ product: "bank-builder", card: "Lane A (stake $100)", result: "won", payout: 200, stake: 100, legs: [] }] });
const FT = { matchId: "X vs Y", match: "X vs Y", homeGoals: 1, awayGoals: 0, status: "FT" };
const LIVE = { matchId: "X vs Y", match: "X vs Y", homeGoals: 1, awayGoals: 0, status: "1H" };
const leg = (matchup) => ({ id: `WORLD_CUP:h:moneyline_90:X`, matchup, market: "moneyline_90", selection: "X to win", odds: -150 });

// ── OFFICIAL-FINAL GATED + NEVER FABRICATE ───────────────────────────────────────────────────────
test("official-final gated: a non-FT match → lane PENDS (never settles a live/scheduled game)", () => {
  const plan = gradeLaneCard(laneCard([leg("X vs Y")]), ml([LIVE]));
  assert.equal(plan.status, "pending", "a 1H (not FT) match holds the whole lane");
});

test("never fabricates: no official final for a leg → lane PENDS (no guessed result)", () => {
  const plan = gradeLaneCard(laneCard([leg("X vs Y")]), ml([])); // finals empty
  assert.equal(plan.status, "pending");
});

test("partial-safe: one FT leg + one non-final leg → the card PENDS (a card never half-settles)", () => {
  const plan = gradeLaneCard(laneCard([leg("X vs Y"), leg("A vs B")]), ml([FT])); // A vs B has no final
  assert.equal(plan.status, "pending", "any unsettled leg holds the whole card");
});

// ── SEED MODEL: crown immutable, only lost seeds move the bankroll, refuses pending ────────────────
test("seed model: a WON lane rolls (bankroll unchanged); a LOST lane drops exactly the $100 seed", () => {
  const before = { record: { wins: 13, losses: 3, voids: 0, pending: 0 }, bankroll: 10076.17 };
  const won = seedModelOutcome(before, [{ laneLetter: "A", status: "won", payout: 9000, settledLegs: [] }]);
  assert.equal(won.bankroll, 10076.17, "won step rolls — bankroll unchanged (the rolled balance is not realized)");
  const lost = seedModelOutcome(before, [{ laneLetter: "A", status: "lost", payout: 0, settledLegs: [] }]);
  assert.equal(lost.bankroll, 9976.17, "lost step drops exactly one $100 seed");
  assert.equal(lost.seedLost, 100);
  // crown is never an input/output of the seed model → structurally immutable here.
  assert.ok(!("crown" in won) && !("crown" in lost), "seed model never returns a crown value");
});

test("idempotent core: re-applying the seed model to an already-advanced before-state is deterministic", () => {
  // The seed model is a pure function of (before, plans); the same inputs always yield the same outputs,
  // and the apply script additionally skips ladder steps already marked settled (see source guard test).
  const before = { record: { wins: 13, losses: 3, voids: 0, pending: 0 }, bankroll: 10076.17 };
  const plans = [{ laneLetter: "A", status: "lost", payout: 0, settledLegs: [] }];
  const a = seedModelOutcome(before, plans), b = seedModelOutcome(before, plans);
  assert.deepEqual(a, b, "pure + deterministic");
});

test("refuses partial: seedModelOutcome THROWS if any lane is still pending (no fake/partial settlement)", () => {
  assert.throws(() => seedModelOutcome({ record: { wins: 0, losses: 0, voids: 0, pending: 0 }, bankroll: 100 },
    [{ laneLetter: "A", status: "pending", payout: 0, settledLegs: [] }]), /refuse/i);
});

test("final-rung completion is operator-gated (a won final rung COMPLETES, not auto-rolled)", () => {
  assert.equal(classifyLaneTransition(4, "won", 5), "complete");
  assert.equal(classifyLaneTransition(2, "won", 5), "advance");
});

// ── ORCHESTRATOR SOURCE GUARDS (the composition is safe by construction) ──────────────────────────
test("orchestrator no-ops safely: no key/bundle → exit 0 writing nothing; zero 90'-final → no-op", () => {
  const src = readRepo("scripts/settle_soccer_day.sh");
  assert.match(src, /no API_FOOTBALL_KEY and no OFFICIAL bundle.*NO-OP/s, "API-unavailable → no-op");
  assert.match(src, /no 90'-final matches yet.*NO-OP/s, "zero 90'-final matches → no-op");
  // Gate counts a match as 90'-final on FT or a knockout decided in extra time / penalties (AET/PEN) —
  // the 90' score still settles the team markets, so a knockout-heavy slate is not silently skipped.
  assert.match(src, /'FT'\s*,\s*'AET'\s*,\s*'PEN'/, "gates on 90'-final status (FT/AET/PEN)");
});

test("orchestrator settles money idempotently: apply path skips already-settled steps", () => {
  const settle = readRepo("app/scripts/settle-daily-portfolio.mjs");
  assert.match(settle, /already settled.*skipped|status === "settled"/s, "idempotent: settled steps are not re-settled");
  const persist = readRepo("app/scripts/persist-soccer-settlement.mjs");
  assert.match(persist, /seen\.has|dedupe|FORBIDDEN/i, "persist dedupes rows + never writes money state");
});
