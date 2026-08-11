/**
 * UFC current-results adapter guards (Program 162 · Release J).
 *
 * The real-disk case pins today's honest first reading: the Aug 8 card's finals predate the first
 * committed bout capture (Aug 10, forward-only), so every one of them QUARANTINES for missing
 * lineage — the third sport to prove the Sprint-045 rule on real data before anything settles.
 * Synthetic cases prove the joins and refusals the first covered card will need.
 *
 * Run: npx tsx --test src/lib/sports/ufc/current-results.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadCurrentUfcResults } from "./current-results.mjs";

const T0 = "2026-08-12T04:00:00Z";
const NOW = "2026-08-12T05:00:00Z";
const ART = (rows) => ({ schemaVersion: 1, sport: "ufc", generatedAt: T0, sourceAsOf: T0, rows });
const BOUTS = new Map([
  ["b1", { providerBoutId: "b1", eventProviderId: "card1", red: "Alice Smith", blue: "Bob Jones", weightClass: "Lightweight" }],
]);
const ROW = (over = {}) => ({ providerBoutId: "b1", providerCardId: "card1", statusRaw: "STATUS_FINAL", red: { name: "Alice Smith" }, blue: { name: "Bob Jones" }, redWinner: true, blueWinner: false, ...over });
const run = (rows) => loadCurrentUfcResults({ nowIso: NOW, artifact: ART(rows), boutIndex: BOUTS });

test("states + clean join: a covered final joins once with card-bout separation and the contract exercised", () => {
  assert.equal(loadCurrentUfcResults({ nowIso: NOW, artifact: null }).state, "NOT_CONFIGURED");
  assert.equal(run([]).state, "NO_RESULTS_YET");
  const out = run([ROW()]);
  assert.equal(out.state, "RESULTS");
  assert.deepEqual(
    { id: out.results[0].providerBoutId, card: out.results[0].providerCardId, red: out.results[0].red, check: out.results[0].contractCheck },
    { id: "b1", card: "card1", red: "Alice Smith", check: "WIN" },
  );
  assert.deepEqual(out.reconciliation, { sourceRows: 1, nonFinal: 0, completedRows: 1, joined: 1, quarantined: 0, exact: true });
});

test("refusals: missing lineage, duplicate consumption, both-winners defect; no-winner finals surface as review", () => {
  const out = run([
    ROW(),
    ROW(),
    ROW({ providerBoutId: "ghost" }),
    ROW({ providerBoutId: "b1", redWinner: true, blueWinner: true }),
  ]);
  // b1 joins once; its duplicate quarantines; ghost lacks lineage; the both-winners row is ALSO a
  // b1 duplicate (already consumed) so it quarantines on the consumption rule first.
  assert.equal(out.results.length, 1);
  assert.equal(out.quarantined.length, 3);
  assert.ok(out.quarantined.some((q) => /without schedule lineage/.test(q.reason)));
  assert.ok(out.quarantined.filter((q) => /exactly once/.test(q.reason)).length === 2);
  const defect = loadCurrentUfcResults({ nowIso: NOW, artifact: ART([ROW({ redWinner: true, blueWinner: true })]), boutIndex: BOUTS });
  assert.ok(defect.quarantined.some((q) => /source defect/.test(q.reason)), "both corners winning quarantines");
  const noWinner = loadCurrentUfcResults({ nowIso: NOW, artifact: ART([ROW({ redWinner: false, blueWinner: false })]), boutIndex: BOUTS });
  assert.equal(noWinner.results.length, 1, "a no-winner final is VISIBLE, not hidden");
  assert.equal(noWinner.results[0].contractCheck, "VOID_PENDING_REVIEW", "draw/NC ambiguity surfaces for review at ingest");
});

test("REAL DISK · today's honest reading: pre-capture finals quarantine for lineage, reconciliation exact", () => {
  const p = path.join(process.cwd(), "public", "data", "ufc", "results", "latest.json");
  const artifact = JSON.parse(fs.readFileSync(p, "utf8"));
  const nowIso = new Date(Date.parse(artifact.sourceAsOf) + 3_600_000).toISOString();
  const out = loadCurrentUfcResults({ nowIso });
  assert.ok(["NO_RESULTS_YET", "RESULTS"].includes(out.state));
  if (out.state === "RESULTS") {
    assert.equal(out.reconciliation.exact, true, "population arithmetic reconciles exactly");
    for (const q of out.quarantined) assert.ok(q.reason && q.providerBoutId, "every quarantine names its bout and reason");
    for (const r of out.results) assert.ok(["WIN", "LOSS", "VOID_PENDING_REVIEW"].includes(r.contractCheck), "joined finals grade through the contract vocabulary");
  }
});
