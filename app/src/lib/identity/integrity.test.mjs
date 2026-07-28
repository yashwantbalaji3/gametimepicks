/**
 * SPRINT 044 — provenance + settlement lineage, with mutation proofs.
 *
 * The cases are drawn from the real Sprint 044 audit rather than invented: the 2026-07-22 PIT@NYY
 * doubleheader whose game-1 predictions were settled against game 2's box score, the UFC artifacts
 * that carry no capture timestamp at all, and the NBA boards that store tip-off as "8:30 PM ET".
 *
 * The mutation tests at the bottom rewrite the shipped source on disk, confirm the guard stops
 * catching what it exists to catch, restore, and assert SHA-256 byte-identity. A guard never observed
 * failing is not a guard.
 *
 * Run: npx tsx --test src/lib/identity/integrity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateProvenance, partitionForResearch, summarizeProvenance } from "./provenance.ts";
import {
  assertSettlementPublishable,
  validateAgainstKnownEvents,
  validateSettlementLineage,
} from "./settlement-lineage.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The real 2026-07-22 PIT @ NYY doubleheader.
const GAME_1 = "2026-07-22T17:05:00Z";
const GAME_2 = "2026-07-22T23:05:00Z";

const provRow = (over = {}) => ({
  eventId: "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t1705",
  provider: "odds-api",
  marketType: "batter_hits",
  capturedAt: "2026-07-22T15:00:00Z",
  eventStart: GAME_1,
  ...over,
});

// ── provenance ─────────────────────────────────────────────────────────────────

test("a capture before first pitch is research eligible", () => {
  const r = evaluateProvenance(provRow());
  assert.equal(r.eligibility, "ELIGIBLE");
  assert.equal(r.researchEligible, true);
  assert.match(r.reason, /before event start/);
});

test("a capture after first pitch is POST_EVENT_CAPTURE", () => {
  const r = evaluateProvenance(provRow({ capturedAt: "2026-07-22T19:00:00Z" }));
  assert.equal(r.eligibility, "POST_EVENT_CAPTURE");
  assert.equal(r.researchEligible, false);
  assert.match(r.reason, /may encode its own outcome/);
});

test("a capture exactly at first pitch is not provably pregame", () => {
  const r = evaluateProvenance(provRow({ capturedAt: GAME_1 }));
  assert.equal(r.eligibility, "POST_EVENT_CAPTURE");
});

test("availableAt later than capturedAt governs the verdict", () => {
  // Captured early, but the value only became knowable after first pitch.
  const r = evaluateProvenance(
    provRow({ capturedAt: "2026-07-22T10:00:00Z", availableAt: "2026-07-22T19:00:00Z" }),
  );
  assert.equal(r.eligibility, "POST_EVENT_CAPTURE");
});

test("the UFC case — no capture timestamp at all → NO_PROVENANCE", () => {
  const r = evaluateProvenance(provRow({ capturedAt: null }));
  assert.equal(r.eligibility, "NO_PROVENANCE");
  assert.match(r.reason, /describes the build, not this row/);
});

test("the NBA case — tip-off stored as display text → UNPROVABLE_TIMING", () => {
  const r = evaluateProvenance(provRow({ eventStart: "8:30 PM ET" }));
  assert.equal(r.eligibility, "UNPROVABLE_TIMING");
  assert.match(r.reason, /not a machine-readable instant/);
  assert.equal(evaluateProvenance(provRow({ eventStart: null })).eligibility, "UNPROVABLE_TIMING");
});

test("structural problems are reported before timing problems", () => {
  // A row with no eventId AND a bad time must read MALFORMED, not merely late.
  const r = evaluateProvenance(provRow({ eventId: "", capturedAt: "2026-07-22T23:00:00Z" }));
  assert.equal(r.eligibility, "MALFORMED");
});

test("eligibility is derived, not accepted from the caller", () => {
  // A row asserting it is eligible must still be judged on its timestamps.
  const r = evaluateProvenance({ ...provRow({ capturedAt: "2026-07-22T19:00:00Z" }), researchEligible: true });
  assert.equal(r.researchEligible, false, "a row cannot declare itself research-safe");
});

test("summarize reports every bucket including the empty ones", () => {
  const s = summarizeProvenance([evaluateProvenance(provRow())]);
  assert.deepEqual(Object.keys(s.byEligibility).sort(), [
    "ELIGIBLE", "MALFORMED", "NO_PROVENANCE", "POST_EVENT_CAPTURE", "UNPROVABLE_TIMING",
  ]);
  assert.equal(s.eligibleRate, 1);
  assert.equal(summarizeProvenance([]).eligibleRate, 0, "an empty set is 0%, never 100%");
});

test("partitioning retains excluded rows rather than dropping them", () => {
  const rows = [
    evaluateProvenance(provRow()),
    evaluateProvenance(provRow({ capturedAt: null })),
    evaluateProvenance(provRow({ eventStart: "8:30 PM ET" })),
  ].map((r) => r);
  const { eligible, excluded } = partitionForResearch(rows);
  assert.equal(eligible.length, 1);
  assert.equal(excluded.length, 2, "excluded rows must survive — the count is part of an honest n");
  assert.equal(eligible.length + excluded.length, rows.length);
});

// ── settlement lineage ─────────────────────────────────────────────────────────

const lineageRow = (over = {}) => ({
  predictionId: "pred-1",
  eventId: "mlb:new-york-yankees-v-pittsburgh-pirates:20260722t1705",
  marketId: "batter_hits:592450:0.5",
  outcome: "Win",
  settlementSource: "mlb-statsapi-boxscore",
  settledAt: "2026-07-23T04:00:00Z",
  eventStart: GAME_1,
  joinedProviderId: "8291188eca889695",
  ...over,
});

test("a complete lineage passes", () => {
  assert.deepEqual(validateSettlementLineage([lineageRow()]), []);
});

test("THE 49-BAD-LEGS CASE — one provider id settled against two events", () => {
  // Exactly what happened: both halves of the doubleheader carried gamePk 823519.
  const violations = validateSettlementLineage([
    lineageRow({ predictionId: "pred-game1", eventId: "mlb:nyy-v-pit:20260722t1705", joinedProviderId: "823519" }),
    lineageRow({ predictionId: "pred-game2", eventId: "mlb:nyy-v-pit:20260722t2305", joinedProviderId: "823519", eventStart: GAME_2 }),
  ]);
  const dup = violations.filter((v) => v.code === "DUPLICATE_MAPPING");
  assert.equal(dup.length, 1, `expected DUPLICATE_MAPPING, got ${JSON.stringify(violations)}`);
  assert.match(dup[0].message, /823519/);
  assert.match(dup[0].message, /graded against the wrong event/);
});

test("each missing link is named individually", () => {
  const v = validateSettlementLineage([
    lineageRow({ predictionId: "pred-x", settlementSource: "", settledAt: "" }),
  ]);
  assert.equal(v.length, 1);
  assert.equal(v[0].code, "MISSING_LINEAGE");
  assert.match(v[0].message, /settlementSource/);
  assert.match(v[0].message, /settledAt/);
});

test("a prediction settled twice is caught", () => {
  const v = validateSettlementLineage([lineageRow(), lineageRow({ outcome: "Loss" })]);
  assert.ok(v.some((x) => x.code === "DUPLICATE_PREDICTION"));
});

test("settling before the event started is impossible, not merely odd", () => {
  const v = validateSettlementLineage([lineageRow({ settledAt: "2026-07-22T12:00:00Z" })]);
  const imp = v.filter((x) => x.code === "IMPOSSIBLE_RELATIONSHIP");
  assert.equal(imp.length, 1);
  assert.match(imp[0].message, /the outcome did not exist yet/);
});

test("a non-official settlement source is rejected", () => {
  const v = validateSettlementLineage([lineageRow({ settlementSource: "web-search-snippet" })]);
  assert.ok(v.some((x) => x.code === "UNTRUSTED_SOURCE"));
  // And the allowlist really is an allowlist.
  assert.ok(validateSettlementLineage([lineageRow({ settlementSource: "some-new-provider" })]).length > 0);
});

test("a settled row pointing at an unknown event is caught", () => {
  const v = validateAgainstKnownEvents([lineageRow()], ["mlb:some-other-game:20260722t1705"]);
  assert.equal(v.length, 1);
  assert.equal(v[0].code, "UNRESOLVED_PROVIDER");
});

test("a malformed row does not crash the relational checks", () => {
  const v = validateSettlementLineage([
    lineageRow({ predictionId: "", eventId: "" }),
    lineageRow(),
  ]);
  assert.ok(v.some((x) => x.code === "MISSING_LINEAGE"));
  assert.ok(!v.some((x) => x.code === "DUPLICATE_PREDICTION"), "the well-formed row must not be blamed");
});

test("assertSettlementPublishable throws with actionable detail", () => {
  assert.doesNotThrow(() => assertSettlementPublishable([]));
  assert.throws(
    () => assertSettlementPublishable(validateSettlementLineage([lineageRow({ settledAt: "2026-07-22T12:00:00Z" })])),
    /refusing to publish[\s\S]*outcome did not exist yet/,
  );
});

// ── mutation proofs ────────────────────────────────────────────────────────────

/**
 * Mutate a shipped source file, run a probe that MUST fail while mutated, restore, and prove the file
 * is byte-identical afterwards.
 *
 * The probe runs in a CHILD PROCESS. An in-process `await import(...?cachebust)` looks like it works
 * and does not: tsx caches transpiled `.ts` by path, so the re-import silently returns the UNMUTATED
 * module and the test reports success without ever exercising the mutation. A guard test that can pass
 * for the wrong reason is worse than no guard test, so this pays a process spawn to be certain.
 */
function mutating(file, find, replace, probeSource) {
  const target = path.join(HERE, file);
  const original = fs.readFileSync(target);
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const text = original.toString();
  assert.ok(text.includes(find), `mutation anchor not found in ${file} — the source changed shape`);

  const probePath = path.join(os.tmpdir(), `gtp-mutation-probe-${digest.slice(0, 8)}-${file}.mjs`);
  let out = "";
  try {
    fs.writeFileSync(target, text.replace(find, replace));
    fs.writeFileSync(probePath, probeSource(target));
    out = execFileSync("npx", ["tsx", probePath], { encoding: "utf8", cwd: process.cwd() }).trim();
  } finally {
    fs.writeFileSync(target, original);
    fs.rmSync(probePath, { force: true });
  }

  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    digest,
    `${file} was NOT restored byte-for-byte`,
  );
  return out;
}

test("MUTATION — removing the post-event check makes leaked data look eligible", () => {
  const out = mutating(
    "provenance.ts",
    "  if (!isLeakageSafe(provenance)) {",
    "  if (false && !isLeakageSafe(provenance)) {",
    (t) => `import { evaluateProvenance } from ${JSON.stringify(t)};
const r = evaluateProvenance({ eventId: "e", provider: "p", marketType: "m",
  capturedAt: "2026-07-22T19:00:00Z", eventStart: "2026-07-22T17:05:00Z" });
console.log(r.researchEligible ? "MISSED" : "CAUGHT");`,
  );
  assert.equal(out, "MISSED", "the mutation must actually defeat the guard, or the test proves nothing");
  // Restored, the same leaked row is rejected.
  assert.equal(evaluateProvenance(provRow({ capturedAt: "2026-07-22T19:00:00Z" })).researchEligible, false);
});

test("MUTATION — removing the duplicate-mapping check lets the 49-bad-legs defect through", () => {
  const rows = JSON.stringify([
    { predictionId: "a", eventId: "e1", marketId: "m", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStart: GAME_1, joinedProviderId: "823519" },
    { predictionId: "b", eventId: "e2", marketId: "m", outcome: "Win", settlementSource: "mlb-statsapi-boxscore", settledAt: "2026-07-23T04:00:00Z", eventStart: GAME_2, joinedProviderId: "823519" },
  ]);
  const out = mutating(
    "settlement-lineage.ts",
    "  for (const providerId of index.ambiguousAliases) {",
    "  for (const providerId of []) {",
    (t) => `import { validateSettlementLineage } from ${JSON.stringify(t)};
const v = validateSettlementLineage(${rows});
console.log(v.some((x) => x.code === "DUPLICATE_MAPPING") ? "CAUGHT" : "MISSED");`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the guard");
  // Restored, the identical input is caught.
  assert.ok(
    validateSettlementLineage(JSON.parse(rows)).some((x) => x.code === "DUPLICATE_MAPPING"),
  );
});

test("MUTATION — removing the required-field check hides missing lineage", () => {
  const out = mutating(
    "settlement-lineage.ts",
    "    if (missing.length > 0) {",
    "    if (missing.length > 99) {",
    (t) => `import { validateSettlementLineage } from ${JSON.stringify(t)};
const v = validateSettlementLineage([{ predictionId: "p", eventId: "", marketId: "",
  outcome: "", settlementSource: "", settledAt: "" }]);
console.log(v.some((x) => x.code === "MISSING_LINEAGE") ? "CAUGHT" : "MISSED");`,
  );
  assert.equal(out, "MISSED", "the mutation must defeat the guard");
  assert.ok(
    validateSettlementLineage([lineageRow({ eventId: "", marketId: "" })]).some(
      (x) => x.code === "MISSING_LINEAGE",
    ),
  );
});
