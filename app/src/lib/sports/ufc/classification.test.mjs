/**
 * UFC RECORD CLASSIFICATION — VOID, WITHDRAWN, PENDING and DECIDED, on whatever data is committed (2026-10-14).
 *
 * Invariants, not fixed numbers, so this holds on a branch AND on CI's merge with main as new cards land:
 *   · every ledger row is exactly one of DECIDED (hit boolean + winner) or VOID (void, no winner, no hit);
 *   · a VOID row is never scored and never a loss, through the Forecast Ledger adapter too;
 *   · a WITHDRAWN bout is never in the ledger, and every card reconciles frozen = graded + void + pending + withdrawn;
 *   · the published decided count equals the ledger's decided rows (pending/void/withdrawn never inflate n).
 *
 * The synthetic fixtures at the bottom test the CONTRACT before real data exercises it. The first real void row
 * (2026-10-10 Kareckaite–Gatto, appended 2026-10-14T13:27Z) broke a parity test that had only ever seen decided
 * rows — the shape existed in the code for days and no test had fed it in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ufcWinnerRows } from "../../forecast-ledger/adapters/ufc.mjs";
import { reconcileCard } from "./reconcile-card.mjs";

const REPO = path.join(process.cwd(), "..");
const DIR = path.join(REPO, "data/internal/research/ufc/model-vs-market");
const ledger = fs.readFileSync(path.join(DIR, "graded.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const summary = JSON.parse(fs.readFileSync(path.join(DIR, "summary.json"), "utf8"));

const isDecided = (g) => typeof g.hit === "boolean" && typeof g.winner === "string" && g.winner.length > 0 && g.void !== true;
const isVoid = (g) => g.void === true && g.winner == null && g.hit == null;

test("every ledger row is exactly one of DECIDED or VOID — nothing in between, nothing both", () => {
  for (const g of ledger) {
    assert.ok(isDecided(g) !== isVoid(g), `${g.boutId} is ${isDecided(g) ? "both" : "neither"} decided and void`);
    if (isVoid(g)) assert.ok(typeof g.voidReason === "string" && g.voidReason.length > 0, `${g.boutId}: a void names its reason`);
  }
  const ids = ledger.map((g) => g.boutId);
  assert.equal(new Set(ids).size, ids.length, "a bout is recorded once (append-only, exactly once)");
});

test("VOID rows reach the Forecast Ledger as VOID: never scored, never a win or a loss", () => {
  for (const r of ufcWinnerRows(ledger.filter(isVoid))) {
    assert.equal(r.settlement.state, "VOID");
    assert.equal(r.measurement.brier, null);
    assert.equal(r.measurement.logLoss, null);
    assert.equal(r.measurement.directionalResult, null);
  }
  for (const r of ufcWinnerRows(ledger.filter(isDecided))) {
    assert.equal(r.settlement.state, "SETTLED");
    assert.ok(["WIN", "LOSS"].includes(r.measurement.directionalResult));
  }
});

test("the published decided count is the ledger's decided rows — void, withdrawn and pending never enter n", () => {
  assert.equal(summary.cumulative.n, ledger.filter(isDecided).length);
});

test("every card reconciles, and a WITHDRAWN bout is never in the ledger", () => {
  const inLedger = new Set(ledger.map((g) => g.boutId));
  for (const c of summary.reconciliation ?? []) {
    assert.ok(c.reconciles, `${c.slateDate} does not reconcile`);
    assert.equal(c.frozen, c.graded + c.void + c.pending + (c.withdrawn ?? 0), `${c.slateDate} frozen ≠ graded + void + pending + withdrawn`);
    for (const id of c.withdrawnBoutIds ?? []) assert.ok(!inLedger.has(id), `${id} is withdrawn yet recorded`);
  }
});

/* ── Synthetic contract fixtures (independent of committed data) ─────────────────────────────────────── */

const row = (o) => ({ boutId: "2026-01-01:a|b", providerBoutId: "9", eventDate: "2026-01-01", eventName: "UFC X", pick: "A", opponent: "B", modelProbability: 0.6, marketProbability: 0.55, ...o });

test("fixture: a draw/no-contest row is VOID through the adapter, with null scores", () => {
  const [r] = ufcWinnerRows([row({ void: true, voidReason: "draw or no contest — no winner to score", winner: null, hit: null, gradedAt: "2026-01-02T00:00:00Z" })]);
  assert.equal(r.settlement.state, "VOID");
  assert.equal(r.settlement.reason, "NO_WINNER");
  assert.equal(r.measurement.brier, null);
  assert.equal(r.measurement.directionalResult, null);
});

test("fixture: an ungraded row is PENDING, never VOID and never scored", () => {
  const [r] = ufcWinnerRows([row({})]);
  assert.equal(r.settlement.state, "PENDING");
  assert.equal(r.measurement.brier, null);
});

test("fixture: a decided loss is SETTLED LOSS with a score; a decided win is SETTLED WIN", () => {
  const [lost] = ufcWinnerRows([row({ winner: "B", hit: false, gradedAt: "2026-01-02T00:00:00Z" })]);
  assert.equal(lost.settlement.state, "SETTLED");
  assert.equal(lost.measurement.directionalResult, "LOSS");
  assert.ok(lost.measurement.brier > 0);
  const [won] = ufcWinnerRows([row({ winner: "A", hit: true, gradedAt: "2026-01-02T00:00:00Z" })]);
  assert.equal(won.measurement.directionalResult, "WIN");
});

test("fixture: reconcile-card puts a withdrawn bout in WITHDRAWN, not PENDING, and the card still reconciles", () => {
  const start = "2026-01-01T21:00:00Z";
  const k = (n) => `2026-01-01:${n}`;
  const base = {
    slateDate: "2026-01-01", boutIds: new Set([k("a|b"), k("c|d"), k("e|f"), k("g|h")]), startUtc: start,
    finalPreStart: new Set([k("a|b"), k("c|d"), k("g|h")]), // e|f was dropped before the card started
    ledgerById: new Map([[k("a|b"), { hit: true, winner: "A" }], [k("c|d"), { void: true }]]),
    resultsByBout: new Map([[k("a|b"), { winner: "A" }]]), // the card has official results
  };
  const out = reconcileCard({ ...base, nowMs: Date.parse(start) + 48 * 3_600_000 });
  assert.deepEqual(out.withdrawnBoutIds, [k("e|f")], "dropped before the start + card has results + past 24h");
  assert.deepEqual(out.pendingBoutIds, [k("g|h")], "fought but ungraded stays PENDING — never withdrawn, never a loss");
  assert.equal(out.graded, 1); assert.equal(out.void, 1);
  assert.ok(out.reconciles);
  const early = reconcileCard({ ...base, nowMs: Date.parse(start) + 3_600_000 });
  assert.equal(early.withdrawn, 0, "inside the 24h window nothing is called withdrawn yet");
});
