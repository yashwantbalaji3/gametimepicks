/**
 * THE MERGED LIFECYCLE HISTORY (P241 · A19).
 *
 * latest.json's cards[] is one run's story: the night after a card settled, its applying run
 * rotated out and the row became a bare hold — so /moonshot watched a settled card fall back to
 * "awaiting official results" and /bank-builder's Won/Lost rows vanished. The dated files are the
 * append-only receipts; loadLifecycleHistory unions them (applied rows win). These pin the
 * invariant on the REAL committed store, shape-based and dateless: whatever the settled index
 * says is settled must have a full detail row in the history, and the open-card derivation must
 * exclude every settled source card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadLifecycleLedger, loadLifecycleHistory, settledCardIds, settledCardsFor } from "./lifecycle-view.ts";

const DIR = path.join(process.cwd(), "public", "data", "products", "lifecycle");
const hasStore = fs.existsSync(path.join(DIR, "latest.json"));

test("every identity in latest's settledIndex has a detail row in the merged history", () => {
  if (!hasStore) return;
  const latest = JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8"));
  const history = loadLifecycleHistory();
  assert.ok(history, "history loads whenever latest exists");
  const byId = new Map(history.cards.map((c) => [c.id, c]));
  for (const id of Object.keys(latest.settledIndex ?? {})) {
    const row = byId.get(id);
    assert.ok(row, `settled identity ${id} has no card row in the merged history`);
    assert.ok(row.applied, `${id}: the history keeps the APPLIED row, not the later hold`);
    assert.ok(row.legs.length > 0, `${id}: the applied row carries its graded legs`);
    assert.notEqual(row.result, "pending", `${id}: a settled identity cannot read pending`);
  }
});

test("latest alone is NOT the history — the regression this loader exists for", () => {
  if (!hasStore) return;
  const latest = loadLifecycleLedger();
  const history = loadLifecycleHistory();
  const latestApplied = latest.cards.filter((c) => c.applied).length;
  const settledIdentities = Object.keys(
    JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8")).settledIndex ?? {},
  ).length;
  // On any day after the first partial-apply night, latest's applied subset is smaller than the
  // settled record. The guard is directional, not pinned to a count: history must cover the index.
  assert.ok(history.settled >= latestApplied);
  assert.equal(history.settled, settledIdentities, "history settles exactly what the index settles");
});

test("settledCardIds from history covers every product's settled source cards", () => {
  if (!hasStore) return;
  const history = loadLifecycleHistory();
  for (const product of ["moonshot", "bank-builder"]) {
    const applied = history.cards.filter((c) => c.product === product && c.applied);
    const ids = settledCardIds(history, product);
    for (const c of applied) {
      if (c.sourceCardId) assert.ok(ids.includes(c.sourceCardId), `${product}: ${c.sourceCardId} missing from settled ids`);
    }
    assert.equal(settledCardsFor(history, product).length, applied.length);
  }
});
