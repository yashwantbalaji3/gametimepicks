/**
 * NCAAF ledger-adapter PROPOSAL guards (NCAAF-006.8): SHADOW receipts produce no ledger rows; a hypothetical
 * PUBLISHED receipt produces rows that the ledger's own validateRow accepts EXCEPT for the sport allowlist —
 * which is exactly the one shared change the proposal asks for; identities are distinct and never collide
 * with an NFL row for the same provider event id; pending rows carry no measurement. PRIVATE_RESEARCH.
 *
 * Receipts and grades are SYNTHETIC TEST FIXTURES.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/ledger-proposal.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateRow } from "../../forecast-ledger/contract.mjs";
import { forecastIdFor } from "../../forecast-ledger/identity.mjs";
import { ncaafLedgerRows } from "./ledger-proposal.mjs";

const RECEIPT = {
  publicationStatus: "SHADOW",
  capturedAt: "2026-10-09T21:42:09.641Z",
  event: { eventId: "900006001", season: 2026, startUtcAtCapture: "2026-10-10T19:30Z", homeAbbreviation: "HOM", awayAbbreviation: "AWY", homeTeamId: "ncaaf-team-9001", awayTeamId: "ncaaf-team-9002" },
  models: { winner: { spec: { id: "C1" } }, score: { spec: { id: "C2" } } },
  forecast: { winner: { pHome: 0.62 }, score: { pHome: 0.6, homeMean: 30, awayMean: 25, marginMean: 5, marginSd: 15, totalMean: 55, totalSd: 14, rho: 0.25 } },
  market: { provider: "SYNTH", capturedAt: "2026-10-09T21:42:09.641Z", homeSpread: -4.5, homeMoneyline: -190, awayMoneyline: 160 },
};
const GRADE = { settlement: { state: "SETTLED", finalHome: 31, finalAway: 24, gradedAt: "2026-10-11T08:00:00Z", source: "ESPN scoreboard" }, corrections: 0 };

test("SHADOW, RESEARCH_ONLY and WITHHELD receipts never become ledger rows", () => {
  for (const status of ["SHADOW", "RESEARCH_ONLY", "WITHHELD", "UNAVAILABLE", undefined]) {
    assert.deepEqual(ncaafLedgerRows({ ...RECEIPT, publicationStatus: status }, GRADE), []);
  }
});

test("a PUBLISHED receipt validates against the ledger contract except for the sport allowlist", () => {
  const rows = ncaafLedgerRows({ ...RECEIPT, publicationStatus: "PUBLISHED" }, GRADE);
  assert.equal(rows.length, 5);
  for (const r of rows) assert.deepEqual(validateRow(r), ["sport NCAAF"], `${r.family}: only the shared allowlist blocks it`);
  const winner = rows.find((r) => r.family === "ncaaf_winner");
  assert.equal(winner.measurement.brier, (0.62 - 1) ** 2);
  assert.ok(!("probability" in winner.market), "market carries impliedProbability, never a model probability");
  assert.equal(new Set(rows.map((r) => r.forecastId)).size, 5, "five distinct forecast identities");
});

test("NCAAF identities never collide with an NFL row on the same provider event id", () => {
  const [w] = ncaafLedgerRows({ ...RECEIPT, publicationStatus: "PUBLISHED" }, GRADE);
  const nfl = forecastIdFor({ sport: "NFL", eventId: "900006001", subjectType: "GAME", subjectId: "900006001", family: "ncaaf_winner", forecastKind: "BINARY_PROBABILITY" });
  assert.notEqual(w.forecastId, nfl);
});

test("pending rows carry no measurement; void rows are VOID", () => {
  const pending = ncaafLedgerRows({ ...RECEIPT, publicationStatus: "PUBLISHED" }, null);
  assert.ok(pending.every((r) => r.settlement.state === "PENDING" && r.measurement.brier == null && r.measurement.absoluteError == null));
  const voided = ncaafLedgerRows({ ...RECEIPT, publicationStatus: "PUBLISHED" }, { settlement: { state: "VOID" }, corrections: 0 });
  assert.ok(voided.every((r) => r.settlement.state === "VOID" && r.settlement.finalValue === null));
});
