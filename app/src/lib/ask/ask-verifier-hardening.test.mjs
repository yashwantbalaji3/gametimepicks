/**
 * Phase E · E-2 — the verifier false negatives the Ask audit PROBED, each now refused, and the honest sentences
 * the old rules were written to protect, each still allowed. Every probe here once passed verification.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { verifyAnswer, forbiddenCopyIn, clarificationCopyIn } from "./verifier.mjs";

const evidenceFor = (texts, numbers = []) => ({
  facts: texts.map((text, i) => ({ id: `E1.${i + 1}`, source: "t", text })),
  numbers: new Set(numbers.map(String)), identifiers: new Set(), links: [], unsupported: [], items: [],
});
const NONE = evidenceFor([]);

test("🔴 a negation IDIOM intensifies a claim; it no longer clears it", () => {
  assert.equal(verifyAnswer("No doubt about it: GameTime picks Arsenal tonight.", NONE).ok, false, "unsourced pick behind 'no doubt'");
  assert.ok(forbiddenCopyIn("There is no question this is a sure thing.").length > 0, "'no question' does not negate 'sure thing'");
  const status = verifyAnswer("Not surprisingly, Lamar Jackson is out with an ankle injury.", NONE);
  assert.equal(status.ok, false, "'not surprisingly' does not negate an injury status no tool sourced");
});

test("the honest negated sentences the old rules protect still pass", () => {
  assert.deepEqual(forbiddenCopyIn("GameTime does not publish a price-aware expected value and publishes no guarantees and no locks."), []);
  assert.deepEqual(forbiddenCopyIn("Ask will not tell you which candidate is the highest-EV or the most profitable."), []);
  assert.equal(verifyAnswer("GameTime's pick is none — the market is paused.", NONE).ok, true);
});

test("🔴 other directional verbs are pick claims too — sourced only by a pick the evidence holds", () => {
  assert.equal(verifyAnswer("The model favors Arsenal against Leeds.", NONE).ok, false);
  assert.equal(verifyAnswer("GameTime expects the Steelers to win.", NONE).ok, false);
  assert.equal(verifyAnswer("Arsenal is the pick.", NONE).ok, false);
  const ev = evidenceFor(["NYM @ WSH · Moneyline: GameTime's pick is NYM, model probability 56%, market-implied 53%, confidence lean"], [0.56, 0.53, 56, 53]);
  assert.equal(verifyAnswer("The model favors NYM in the moneyline.", ev).ok, true, "a restated evidence pick passes");
  assert.equal(verifyAnswer("The model projects 20 points for Pittsburgh.", evidenceFor(["projected score: PIT 20"], [20])).ok, true, "a projected SCORE is not a pick claim");
});

test("🔴 a record belongs to its owner: numbers pooled across evidence can no longer be swapped", () => {
  const ev = evidenceFor(["Bank Builder's current record is 37–36", "Moonshot's current record is 4–35"], [37, 36, 4, 35]);
  assert.equal(verifyAnswer("Bank Builder is 4–35.", ev).ok, false, "Moonshot's record on Bank Builder");
  assert.equal(verifyAnswer("Bank Builder is 37–36.", ev).ok, true);
  assert.equal(verifyAnswer("Bank Builder is 37–36 and Moonshot is 4–35.", ev).ok, true, "each record binds to its own clause");
  assert.equal(verifyAnswer("The record is 37–36.", ev).ok, true, "a clause that names no owner is not bound");
});

test("🔴 a clarification cannot carry an in-flight settlement claim or an unsourced status", () => {
  assert.ok(clarificationCopyIn("Before I answer — Lamar Jackson has been ruled out; which game did you mean?").length > 0);
  assert.deepEqual(clarificationCopyIn("Which Allen did you mean — Josh Allen (BUF) or Keenan Allen (LAC)?"), []);
});
