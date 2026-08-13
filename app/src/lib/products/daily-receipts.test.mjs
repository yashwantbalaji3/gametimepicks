/**
 * Release E/F/G guards (Program 172): the daily product receipt tells the operational truth,
 * the closed state machine holds, no product invents a reason, one authority owns each fact,
 * and the receipt never touches money.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const DATE = "2026-08-13";
const receipt = read(`data/internal/products/receipts/${DATE}.json`);

test("the receipt is dated, private, and covers all three signature products", () => {
  assert.equal(receipt.date, DATE);
  assert.equal(receipt.dataClass, "PRIVATE_OPERATING_RECORD");
  assert.deepEqual(receipt.products.map((p) => p.product).sort(), ["bank-builder", "end-zone-vault", "moonshot"]);
  for (const p of receipt.products) assert.ok(receipt.states.includes(p.state), `${p.product} state ${p.state} outside the closed set`);
});

test("MISSING INPUTS ARE NOT A NO-PLAY — the distinction the whole receipt exists for", () => {
  const board = receipt.inputs.mlbBoard;
  for (const p of receipt.products.filter((x) => x.product !== "end-zone-vault")) {
    if (!board.present) {
      assert.equal(p.state, "INPUTS_MISSING", `${p.product}: with no board for ${DATE} the only honest state is INPUTS_MISSING`);
      assert.match(p.reason, /operational gap, not a model decision/);
      assert.equal(p.candidatesEvaluated, 0, "nothing can have been evaluated without a slate");
    } else {
      assert.notEqual(p.state, "INPUTS_MISSING", "a present board must produce a real evaluation state");
    }
  }
});

test("a NO_PLAY always carries a completed evaluation and a stated reason", () => {
  for (const p of receipt.products.filter((x) => x.state === "NO_PLAY")) {
    assert.ok(p.reason && p.reason.length > 20, `${p.product}: NO_PLAY needs a real reason`);
    assert.equal(p.card, null, "a no-play never carries a card");
  }
  // and an ACTIVE always carries one
  for (const p of receipt.products.filter((x) => x.state === "ACTIVE")) {
    assert.ok(Array.isArray(p.card) && p.card.length > 0, `${p.product}: ACTIVE must carry its card`);
  }
});

test("rejection reasons are copied from the live policy, never invented here", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/products/build-daily-product-receipts.mjs"), "utf8");
  assert.match(src, /l\.activationEligibility\?\.reason/, "reasons are read off the policy's own field");
  assert.match(src, /buildPersistedDailyPortfolio/, "the receipt calls the live authority rather than re-implementing it");
  // the writer may NAME the live authority (that is documentation); it may not DEFINE a threshold
  assert.doesNotMatch(src, /^\s*(const|let)\s+\w*(MIN_COMBINED|MAX_COMBINED|IDEAL_BAND|TARGET_LEGS|CUTOFF)\w*\s*=/m,
    "no policy threshold may be defined in the writer — thresholds live in the policy modules");
});

test("NFL cannot qualify a leg on sportsbook prices alone", () => {
  assert.match(receipt.inputs.nflNote, /sportsbook prices are not a GameTimePicks pick/);
  const status = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-status.json"), "utf8"));
  assert.equal(receipt.inputs.nflModelEligible, status.teamSimulation.state === "LIVE");
  if (!receipt.inputs.nflModelEligible) {
    for (const p of receipt.products) assert.ok(!JSON.stringify(p.card ?? []).includes("nfl-"), "no NFL leg may appear while the NFL model is held");
  }
});

test("PROTECTED · the receipt writer reads no money artifact for state and writes none", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/products/build-daily-product-receipts.mjs"), "utf8");
  const writes = [...src.matchAll(/writeFileSync\(([^,]+)/g)].map((m) => m[1]);
  assert.equal(writes.length, 1, "exactly one write");
  assert.match(writes[0], /outPath/);
  assert.match(src, /data\/internal\/products\/receipts/, "it writes only its own receipt path");
  assert.doesNotMatch(src, /writeFileSync[^\n]*(mr-dub|portfolio\.json|bankroll|bank-builder-locks)/, "no money write");
  // and the protected files are still byte-identical
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex"), "affe6b21071f2b3be96bb2774eb347c3");
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/bank-builder-locks.json"))).digest("hex"), "cb80473f88f3cb5f67208fa568925295");
});

test("MOONSHOT POLICY FORK · the dormant band is labelled and the live authority is named", () => {
  const dormant = fs.readFileSync(path.join(APP, "src/lib/moonshot/activation-rules.ts"), "utf8");
  assert.match(dormant, /NOT THE LIVE ACTIVATION AUTHORITY/, "the dormant module must say so at the top");
  assert.match(dormant, /daily-portfolio\/accounting\.ts/, "it must name what actually runs");
  // pin BOTH sides so a silent drift fails here
  const dormantMin = Number(dormant.match(/MOONSHOT_MIN_COMBINED\s*=\s*(\d+)/)[1]);
  const live = fs.readFileSync(path.join(APP, "src/lib/world-cup/model-qualified-picks.ts"), "utf8");
  const liveMin = Number(live.match(/MOONSHOT_MIN_COMBINED_ODDS\s*=\s*(\d+)/)[1]);
  assert.equal(dormantMin, 600, "dormant band unchanged");
  assert.equal(liveMin, 700, "live floor unchanged");
  assert.notEqual(dormantMin, liveMin, "the fork is real and recorded — resolving it is a deliberate change, not a drift");
  assert.match(receipt.authorities.moonshot, /MOONSHOT_MIN_COMBINED_ODDS/, "the receipt names the live band");
});
