/**
 * NFL shadow-run guards (Program 167 · Release E): every rung of the decision ladder, plus the
 * REAL next event through the real committed artifacts.
 * Run: npx tsx --test src/lib/sports/nfl/shadow-run.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runNflShadow } from "./shadow-run.mjs";
import { fitNflV1 } from "./model-v1.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const FIT = fitNflV1(corpus.rows.filter((r) => [2023, 2024].includes(r.season)));
const ROWS = corpus.rows;

const REGULAR_EVENT = { providerEventId: "999001", dateUtc: "2026-09-13T17:00:00Z", seasonType: 2, home: { abbr: "KC", name: "Kansas City Chiefs" }, away: { abbr: "LV", name: "Las Vegas Raiders" }, capturedAt: "2026-09-10T13:00:00Z" };
const FRESH_ODDS = {
  capturedAt: "2026-09-13T14:00:00Z",
  rows: [{ bookmaker: "bookx", marketType: "h2h", sourceAsOf: "2026-09-13T13:55:00Z", outcomes: [{ name: "Kansas City Chiefs", price: -180 }, { name: "Las Vegas Raiders", price: 155 }] }],
};

test("post-start run REFUSES outright", () => {
  const out = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T17:00:00Z", strengthRows: ROWS, fit: FIT });
  assert.equal(out.state, "REFUSED_POST_START");
});

test("preseason event ABSTAINS even with perfect inputs — the model card's policy in code", () => {
  const preseason = { ...REGULAR_EVENT, providerEventId: "401873272", dateUtc: "2026-08-13T23:00:00Z", seasonType: 1, home: { abbr: "CIN", name: "Cincinnati Bengals" }, away: { abbr: "DET", name: "Detroit Lions" } };
  const out = runNflShadow({ event: preseason, nowIso: "2026-08-12T19:00:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: { capturedAt: "2026-08-12T18:00:00Z", rows: FRESH_ODDS.rows } });
  assert.equal(out.state, "ABSTAIN");
  assert.match(out.reason, /preseason/i);
  assert.equal(out.publicActivation, "OFF");
});

test("no odds → READY_EXCEPT_ODDS with assembly evidence and NO probabilities anywhere", () => {
  const out = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T12:00:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: null });
  assert.equal(out.state, "READY_EXCEPT_ODDS");
  assert.ok(out.assembly?.evidence, "the refusal carries its evidence");
  assert.ok(!JSON.stringify(out).includes('"probs"'), "no probability leaks through a refusal");
});

test("stale or post-start odds → READY_EXCEPT_ODDS, never CURRENT", () => {
  const stale = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T12:00:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: { capturedAt: "2026-09-12T12:00:00Z", rows: FRESH_ODDS.rows } });
  assert.equal(stale.state, "READY_EXCEPT_ODDS");
  const postStart = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T16:59:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: { capturedAt: "2026-09-13T17:30:00Z", rows: FRESH_ODDS.rows } });
  assert.ok(["READY_EXCEPT_ODDS", "REFUSED_POST_START"].includes(postStart.state));
});

test("all inputs qualify → CURRENT_PRE_EVENT that passes validateShadowRun; model and market never blend", () => {
  const out = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T15:00:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: FRESH_ODDS });
  assert.equal(out.state, "CURRENT_PRE_EVENT");
  const check = validateShadowRun(out.artifact);
  assert.deepEqual(check.errors, []);
  assert.equal(out.artifact.publicActivation, "OFF");
  assert.equal(out.artifact.evaluationEligible, false);
  const model = out.artifact.model.probs.home;
  const market = out.artifact.market.bookmakers[0].noVig.find((o) => o.name === "Kansas City Chiefs").prob;
  assert.notEqual(model, market, "model and market are two different numbers, reported side by side");
  assert.ok(out.artifact.market.bookmakers[0].impliedSum > 1, "the vig stays visible");
});

test("corrupt market rows refuse de-vig and the run falls back to READY_EXCEPT_ODDS", () => {
  const corrupt = { capturedAt: "2026-09-13T14:00:00Z", rows: [{ bookmaker: "bookx", marketType: "h2h", outcomes: [{ name: "Kansas City Chiefs", price: -180 }] }] };
  const out = runNflShadow({ event: REGULAR_EVENT, nowIso: "2026-09-13T15:00:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: corrupt });
  assert.equal(out.state, "READY_EXCEPT_ODDS");
  assert.match(out.reason, /refused de-vig|one-sided/i);
});

test("REAL ARTIFACTS · the actual next scheduled event (DET@CIN) runs the real ladder end-to-end", () => {
  const sched = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  const next = (sched.rows ?? []).filter((r) => r.statusRaw === "STATUS_SCHEDULED").sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))[0];
  assert.ok(next, "a scheduled event exists in the committed capture");
  const out = runNflShadow({ event: next, nowIso: "2026-08-12T19:30:00Z", strengthRows: ROWS, fit: FIT, oddsSnapshot: null });
  // Aug 13 DET@CIN is preseason: the model policy must abstain BEFORE the odds gate is even
  // consulted — a refusal with the reason in the model's own words, and zero probabilities.
  assert.equal(out.state, "ABSTAIN");
  assert.match(out.reason, /preseason/i);
  assert.ok(!JSON.stringify(out).includes('"probs"'));
});
