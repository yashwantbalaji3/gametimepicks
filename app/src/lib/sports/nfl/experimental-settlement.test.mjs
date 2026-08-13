/**
 * Release G guards (Program 174): the experimental ledger grades a distribution as a
 * distribution, keeps itself separate from every product record, grades the forecast readers
 * actually saw, and settles exactly once.
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
const receipt = read(`data/internal/nfl/experimental-settlement/${DATE}.json`);
const summary = read("data/internal/nfl/experimental-settlement/summary.json");
const src = fs.readFileSync(path.join(APP, "scripts/nfl/settle-nfl-experimental.mjs"), "utf8");

test("the ledger is its own lane and can never move money", () => {
  assert.equal(receipt.dataClass, "PRIVATE_PAPER_RECORD");
  assert.equal(receipt.ledger, "experimental-forecast");
  assert.match(receipt.scope, /separate from validated picks/);
  for (const forbidden of ["mr-dub", "portfolio.json", "bank-builder", "moonshot", "settled_leans", "bankroll"]) {
    assert.ok(!src.includes(forbidden), `the experimental settler must never name ${forbidden}`);
  }
  // and protected money is byte-identical
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json"))).digest("hex"), "affe6b21071f2b3be96bb2774eb347c3");
  assert.equal(crypto.createHash("md5").update(fs.readFileSync(path.join(APP, "public/data/mr-dub/bank-builder-locks.json"))).digest("hex"), "cb80473f88f3cb5f67208fa568925295");
});

test("a forecast is graded as a DISTRIBUTION — there is no W-L or ROI here", () => {
  assert.match(receipt.whatIsGraded, /not a wager/);
  const blob = JSON.stringify(receipt);
  // JSON KEYS, not substrings: a bare "roi" scan flags "Det-roi-t Lions", and renaming a real
  // team to satisfy a guard is exactly the wrong repair.
  for (const bannedKey of ["roi", "stake", "wins", "losses", "payout", "exposure"]) {
    assert.doesNotMatch(blob, new RegExp(`"${bannedKey}"\\s*:`, "i"), `an accuracy ledger must not carry a "${bannedKey}" field`);
  }
  for (const k of ["marginMAE", "totalMAE", "marginInterval80Coverage", "brier", "logLoss"]) {
    assert.ok(k in receipt.metrics, `metrics must include ${k}`);
  }
});

test("THE FORECAST OF RECORD is the latest PRE-KICKOFF revision — the defect this caught", () => {
  // λ changed mid-programme: the original receipt held 50.0% while the published page held 47.9%.
  // Grading the first file would have graded numbers no reader ever saw.
  assert.match(src, /latest PRE-KICKOFF revision, not the first file written/);
  assert.match(src, /post-start files are never of record/);
  assert.match(src, /revisionChain/, "the superseded versions are preserved as lineage, never deleted");
  // the published forecast and the receipt of record must agree TODAY
  const pub = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));
  const dir = path.join(ROOT, "data/internal/nfl/forecast-receipts", DATE);
  for (const f of pub.forecasts) {
    const versions = fs.readdirSync(dir).map((x) => read(`data/internal/nfl/forecast-receipts/${DATE}/${x}`))
      .filter((r) => r.providerEventId === f.providerEventId && Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc))
      .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
    const ofRecord = versions[versions.length - 1];
    assert.equal(ofRecord.model.inputHash, f.model.inputHash,
      `${f.matchup}: the receipt of record must be the forecast that was published`);
    assert.equal(ofRecord.forecastSummary.winProbability.home, f.forecastSummary.winProbability.home);
  }
});

test("population reconciles and a malformed event never throws the slate", () => {
  const a = receipt.accounting;
  assert.equal(a.reconciles, true);
  assert.equal(a.settled + a.pending + a.quarantined, a.receipts);
  assert.match(src, /never throws the slate/);
  assert.match(src, /process\.exit\(2\)/, "a population gap refuses rather than writing a partial record");
});

test("the market benchmark stays in its own lane and is never merged into the model record", () => {
  assert.match(src, /kept in its own lane and never merged/);
  // metrics and marketBenchmark are separate top-level blocks
  assert.ok("metrics" in receipt && "marketBenchmark" in receipt);
  assert.ok(!("marketBrier" in receipt.metrics), "the model's metrics never absorb the benchmark");
});

test("the public summary is honest before anything settles", () => {
  assert.equal(summary.dataClass, "PUBLIC_DERIVED");
  assert.equal(summary.ledger, "experimental-forecast");
  if (summary.settledForecasts === 0) {
    assert.match(summary.note, /No experimental forecast has been settled yet/);
    assert.equal(summary.winnerAccuracy, null, "no accuracy is claimed before any result exists");
  } else {
    assert.match(summary.note, /not a betting record/);
  }
});

test("pending is never a loss, and pre-kickoff events stay pending", () => {
  for (const p of receipt.pending) {
    assert.ok(["PRE_KICKOFF", "AWAITING_OFFICIAL_RESULT"].includes(p.state));
    assert.ok(p.kickoffUtc, "a pending row names the kickoff it waits on");
  }
  assert.ok(!JSON.stringify(receipt.pending).includes("LOSS"));
});
