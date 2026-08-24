/**
 * Signature-product audit guards (Program 202 · Release E).
 *
 * The committed audit must classify EVERY signature lane in the closed taxonomy — an audit that
 * shrugs (UNKNOWN/MISSING) is not an audit — with a full owner chain per product, counts that
 * recount from the rows, and the P201 UFC quarantine carried, never silently dropped.
 *
 * Run: npx tsx --test src/lib/audits/signature-products.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CLASSES = ["PROVEN", "TYPED_NO_PLAY", "TYPED_LANE_CLOSED", "DORMANT_BY_DESIGN", "NAMED_QUARANTINE", "FOUNDER_BLOCKED", "REALITY_BLOCKED"];
const audit = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "audits", "signature-products-v1.json"), "utf8"));

test("every signature lane is classified in the closed taxonomy — no UNKNOWN, no MISSING", () => {
  assert.ok(audit.products.length >= 11, "all signature lanes present");
  for (const p of audit.products) {
    assert.ok(CLASSES.includes(p.classification), `${p.product}: ${p.classification} is typed`);
    assert.ok(p.stateDetail && p.stateDetail.length > 5, `${p.product}: state carries detail`);
    for (const [k, v] of Object.entries(p.chain)) {
      assert.ok(v && !/UNKNOWN|MISSING/i.test(String(v)), `${p.product}.chain.${k}: named owner`);
    }
    assert.equal(p.conservation.verdict, "GUARDED", `${p.product}: conservation cites a guard owner`);
    assert.ok(p.conservation.owner.length > 10, `${p.product}: the guard owner is named`);
  }
});

test("counts recount from the rows — never hand-kept", () => {
  const counts = {};
  for (const p of audit.products) counts[p.classification] = (counts[p.classification] ?? 0) + 1;
  for (const c of CLASSES) assert.equal(audit.counts[c] ?? 0, counts[c] ?? 0, `${c} recounts`);
});

test("the P201 UFC quarantine is carried, never silently dropped", () => {
  const ufc = audit.products.find((p) => p.lane === "ufc");
  assert.match(ufc.conservation.note ?? "", /2026-08-18.*quarantine|quarantine.*2026-08-18/,
    "the adjudicated build-day quarantine travels with the lane's audit row");
});

test("the expected signature lanes are all present by name", () => {
  const lanes = new Set(audit.products.map((p) => p.lane));
  for (const lane of ["mlb", "epl", "ufc", "nfl", "multi", "bank-builder", "moonshot", "mr-dub", "homer-nukes", "end-zone-vault", "nba"]) {
    assert.ok(lanes.has(lane), `${lane} audited`);
  }
});
