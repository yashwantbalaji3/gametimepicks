/**
 * Release E guards (Program 183): every lane RAN and published a receipt, and "nothing qualified"
 * is backed by a taxonomy that accounts for the whole pool.
 *
 * The distinction this holds: a product publishing only a verdict is indistinguishable from a
 * product that never ran. A receipt with counted rejection doors is the working that separates them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const receipt = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/product-receipts.json"), "utf8"));
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/nfl/product-receipts/ledger.json"), "utf8"));
const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-product-receipts.mjs"), "utf8");
const STATES = ["ACTIVE", "NO_PLAY", "REFUSED"];

test("EVERY LANE RAN and published exactly one outcome from the closed set", () => {
  const products = receipt.lanes.map((l) => l.product);
  for (const required of ["bank-builder", "moonshot", "build-inventory", "end-zone-vault"]) {
    assert.ok(products.includes(required), `${required} published a receipt`);
  }
  for (const l of receipt.lanes) {
    assert.ok(STATES.includes(l.state), `${l.product}: ${l.state} is outside the closed set`);
    assert.ok(l.stateReason && l.stateReason.length > 30, `${l.product} explains its state`);
  }
  // "paused", a stale prior card, and an absent run are defects, never states
  assert.ok(!/paused/i.test(JSON.stringify(receipt)));
  assert.match(src, /`paused`, a stale prior card, or an absent\s*\n? \* run are all defects, never states/);
});

test("THE TAXONOMY ACCOUNTS FOR THE WHOLE POOL — no candidate leaves unexplained", () => {
  for (const l of receipt.lanes) {
    assert.equal(l.reconciles, true, `${l.product}: rejection counts must sum to the pool`);
    const accounted = l.rejections.reduce((s, r) => s + r.count, 0);
    assert.equal(accounted, l.candidatesConsidered, `${l.product}: ${accounted} accounted vs ${l.candidatesConsidered} considered`);
    for (const r of l.rejections) {
      assert.ok(r.reason && r.label && r.detail, `${l.product}: every door is named and explained`);
      assert.ok(r.count > 0);
    }
  }
  // and the script refuses rather than publishing an unaccounted pool
  assert.match(src, /REFUSED: a rejection taxonomy does not account for its whole pool/);
});

test("NO_PLAY IS OVER-DETERMINED — and says so, rather than naming one fixable reason", () => {
  assert.ok(receipt.overDetermined.gates.length >= 3);
  assert.match(receipt.overDetermined.note, /no single small change would open a lane/);
  /*
   * P224: this asserted every lane is NO_PLAY, which only holds while there is something to
   * evaluate. Between a settled slate and the next window the index carries zero pre-kickoff
   * events, and the builder correctly answers REFUSED — "no pre-kickoff NFL event was available to
   * evaluate: an operational blocker, not a finding about the model". That distinction is this
   * workflow's own stated rule, so the test now PINS it instead of flattening the two states.
   */
  for (const l of receipt.lanes) {
    assert.ok(["NO_PLAY", "REFUSED"].includes(l.state), `${l.product}: ${l.state} outside the no-card states`);
    assert.equal(l.card, null, `${l.product}: a lane without a play publishes no card`);
    assert.equal(l.exposure, 0, `${l.product}: and no exposure`);
    // The claim that matters: you cannot report "nothing qualified" having looked at nothing.
    if (l.candidatesConsidered === 0) {
      assert.equal(l.state, "REFUSED", `${l.product}: zero candidates is a REFUSAL, never a finding about the model`);
      assert.match(l.stateReason, /blocker|available to evaluate/i, `${l.product}: and it names the blocker`);
    }
    if (l.state === "NO_PLAY") {
      assert.ok(l.candidatesConsidered > 0, `${l.product}: NO_PLAY means candidates were actually examined`);
    }
  }
  // the Vault names its second blocking door explicitly rather than hiding it behind the first
  const vault = receipt.lanes.find((l) => l.product === "end-zone-vault");
  if (vault.state === "NO_PLAY") {
    assert.ok(vault.alsoBlocking?.length >= 1, "a second independently-sufficient gate is named");
  }
});

test("A RUN RECEIPT CARRIES WHAT MAKES IT A RUN — id, as-of, next run, linkage", () => {
  assert.ok(/^[0-9a-f]{12}$/.test(receipt.runId), "a deterministic run id derived from the inputs");
  assert.ok(receipt.asOf.index && receipt.asOf.eligibility, "the inputs it read are stamped");
  assert.ok(Number.isFinite(Date.parse(receipt.nextRunUtc)), "the next scheduled run is named");
  assert.ok(Date.parse(receipt.nextRunUtc) > Date.parse(receipt.generatedAt), "and it is in the future");
  for (const l of receipt.lanes) assert.ok(l.settlementLinkage, `${l.product} states its settlement linkage`);
});

test("RECORD SEPARATION · an NFL no-play touches no money and no other sport", () => {
  assert.match(receipt.recordSeparation, /entirely separate from MLB's settled record/);
  assert.match(receipt.recordSeparation, /touches no money/);
  for (const forbidden of ["mr-dub", "portfolio.json", "bankroll", "settled_leans"]) {
    assert.ok(!src.includes(forbidden), `the receipt builder must never name ${forbidden}`);
  }
});

test("APPEND-ONLY LEDGER · one entry per run, never rewritten", () => {
  assert.ok(ledger.entries.length >= 1);
  const ids = ledger.entries.map((e) => e.runId);
  assert.equal(new Set(ids).size, ids.length, "no duplicate run ids");
  assert.ok(ids.includes(receipt.runId), "the published receipt's run is in the ledger");
  assert.match(src, /if \(!ledger\.entries\.some\(\(e\) => e\.runId === runId\)\)/);
});

test("REFUSES ON ABSENT INPUTS — a receipt is never written from nothing", () => {
  assert.match(src, /REFUSED: canonical index or product-eligibility artifact unreadable/);
  assert.match(src, /a finding about the products drawn from no data\s*\n?\/\/ about the products|drawn from no data/);
});

test("PUBLIC · plain words, no product language, no research payload", () => {
  assert.equal(receipt.dataClass, "PUBLIC_DERIVED");
  assert.match(receipt.plainEnglish, /All four NFL lanes ran and none produced a card/);
  assert.match(receipt.plainEnglish, /result of the checks working/);
  const blob = JSON.stringify(receipt);
  for (const banned of ["edge", "lock", "guaranteed", "profitable", "best bet"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"), `must not say "${banned}"`);
  }
  for (const leak of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "playerId"]) {
    assert.ok(!blob.includes(leak), `no research payload: "${leak}"`);
  }
});
