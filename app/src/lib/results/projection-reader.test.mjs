/**
 * THE ONE READER — lib/results/projection.ts over the committed artifact (v1.8 · C1, V19 §2 rule 6).
 *
 * Run: npx tsx --test src/lib/results/projection-reader.test.mjs
 *
 * What it pins: a missing artifact reads as null (no figure, never a fallback); the committed
 * latest.json is shape-valid, its headlines resolve, and every headline is a non-legacy era; the label
 * helpers behave the C9 way through the TypeScript surface. It does NOT pin the committed cells to the
 * live owners — the builder is not scheduled in C1, so that comparison would go red on the first bot
 * commit; the parity test compares owner to owner instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  loadResultsProjection, headlineFor, headlineForProduct, headlineForSport, cellForEra, cellsByFamily, cellsBySport, cellById,
  recordLabelOrNull, pendingLabelOrNull, formatRecordLabel, sumSameEra,
  FAMILIES, ERAS, LEGACY_ERAS, PROJECTION_REL, PROJECTION_SCHEMA,
} from "./projection.ts";

const APP = process.cwd();
const ROOT = path.join(APP, "public", "data");
const ARTIFACT = path.join(ROOT, PROJECTION_REL, "latest.json");

test("C9 · a missing artifact reads as null — no figure, no fallback, no throw", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-proj-reader-"));
  assert.equal(loadResultsProjection(empty), null);
  assert.equal(headlineFor(null, FAMILIES.PRODUCT), null);
  assert.equal(headlineForProduct(null, "bank-builder"), null);
  assert.equal(headlineForSport(null, "mlb"), null);
  assert.equal(recordLabelOrNull(headlineFor(null, FAMILIES.PRODUCT)), null);
  assert.equal(pendingLabelOrNull(null), null);
  assert.deepEqual(cellsByFamily(null, FAMILIES.PRODUCT), []);
  assert.deepEqual(cellsBySport(null, "mlb"), []);
  assert.equal(cellById(null, "x"), null);
  assert.equal(sumSameEra([]), null);
  // a malformed artifact is also null, never a partial read
  fs.mkdirSync(path.join(empty, PROJECTION_REL), { recursive: true });
  fs.writeFileSync(path.join(empty, PROJECTION_REL, "latest.json"), JSON.stringify({ schema: "other", cells: [] }));
  assert.equal(loadResultsProjection(empty), null);
  fs.writeFileSync(path.join(empty, PROJECTION_REL, "latest.json"), "{ nope");
  assert.equal(loadResultsProjection(empty), null);
});

test("the committed artifact loads, is shape-valid, and its headlines resolve to non-legacy cells", () => {
  assert.ok(fs.existsSync(ARTIFACT), `seed artifact committed at ${path.relative(APP, ARTIFACT)}`);
  const p = loadResultsProjection(ROOT);
  assert.ok(p, "loads");
  assert.equal(p.schema, PROJECTION_SCHEMA);
  assert.ok(p.cells.length > 0);
  const product = headlineFor(p, FAMILIES.PRODUCT);
  assert.ok(product && product.product === "bank-builder" && product.era === ERAS.COMPOSITE, "the product headline is the composite protected record");
  assert.ok(Array.isArray(product.composition) && product.composition.length === 2, "…with its era composition beside it");
  assert.match(recordLabelOrNull(product), /^\d+–\d+/);
  assert.equal(pendingLabelOrNull(product), "0 pending");
  const forecast = headlineFor(p, FAMILIES.FORECAST);
  assert.ok(forecast && forecast.sport === "mlb");
  const lab = headlineFor(p, FAMILIES.LAB);
  assert.ok(lab && lab.product === "parlay-lab");
  assert.equal(headlineFor(p, FAMILIES.CYCLE), null);
  assert.equal(headlineFor(p, FAMILIES.MODEL_FAMILY), null);
  for (const c of [product, forecast, lab]) assert.ok(!LEGACY_ERAS.includes(c.era));
  const moonshot = headlineForProduct(p, "moonshot");
  assert.ok(moonshot && moonshot.era === ERAS.RECEIPT_ERA, "the Moonshot headline is the receipt era, never the June ledger");
  const june = cellForEra(p, { family: FAMILIES.PRODUCT, product: "moonshot", era: ERAS.LEGACY_PRODUCT_LEDGER });
  assert.ok(june, "…which is reachable by explicit era request");
  assert.notEqual(june.cellId, moonshot.cellId);
  assert.throws(() => sumSameEra([moonshot, june]), /across eras/);
  // every headline cell has an owner and a window the surface can print
  for (const c of [product, forecast, lab, moonshot]) { assert.ok(c.owner.path); assert.ok(c.window.to || c.window.from || c.segment === "graded-picks"); }
});

test("the committed artifact carries the disclosed gap, both Moonshot eras, the two June ladders and the Lab's two policy windows", () => {
  const p = loadResultsProjection(ROOT);
  const gap = cellForEra(p, { family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.UNRECEIPTED_GAP });
  assert.ok(gap); assert.deepEqual(gap.counts, { won: null, lost: null, pending: null, push: null, void: null });
  assert.equal(recordLabelOrNull(gap), null);
  assert.ok(cellForEra(p, { family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.LEDGER_ONLY, segment: "ladder-1" }));
  assert.ok(cellForEra(p, { family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.LEDGER_ONLY, segment: "ladder-2" }));
  assert.ok(cellForEra(p, { family: FAMILIES.LAB, era: ERAS.POLICY_V1 }));
  assert.ok(cellForEra(p, { family: FAMILIES.LAB, era: ERAS.POLICY_V2, sport: "mlb" }));
  for (const c of p.cells) assert.notEqual(recordLabelOrNull(c), "0–0");
});

test("formatRecordLabel through the TS surface: pending never inside, push/void appended", () => {
  assert.equal(formatRecordLabel({ won: 36, lost: 35, pending: 4, push: 0, void: 0 }), "36–35");
  assert.equal(formatRecordLabel({ won: 36, lost: 35, pending: 4, push: 1, void: 3 }), "36–35 · 1 push · 3 voids");
  assert.equal(formatRecordLabel({ won: null, lost: 35, pending: 0, push: null, void: null }), null);
  assert.equal(formatRecordLabel(null), null);
});
