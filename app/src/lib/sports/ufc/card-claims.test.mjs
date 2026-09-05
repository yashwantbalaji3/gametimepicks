/**
 * THE CARD ARTIFACT MAY NOT MAKE A CLAIM ABOUT POLICY — Program 234 · Release I.
 *
 * Run: npx tsx --test src/lib/sports/ufc/card-claims.test.mjs
 *
 * `card-latest.json` carried "our authorisation to buy odds covers NFL only, so there is no captured
 * UFC line to show" long after a UFC odds receipt existed and prices were being captured beside it.
 * `/ufc` had already been corrected for printing that sentence directly above the prices it denied —
 * but the correction was made on the PAGE, and the producer went on emitting it, so every consumer
 * that trusted the artifact inherited a contradiction the page had shed.
 *
 * The general rule this pins: a data artifact may state what IT contains; it may not state what the
 * project is permitted to buy. A sentence about contents stays true as long as the contents do. A
 * sentence about policy expires silently the moment the policy changes, and nothing in the pipeline
 * is watching for that.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const CARD = path.join(APP, "public/data/ufc/card-latest.json");
const card = fs.existsSync(CARD) ? JSON.parse(fs.readFileSync(CARD, "utf8")) : null;

/** Claims about what the project may purchase, rather than about what this file holds. */
const POLICY_CLAIM = /\bauthoris|\bauthoriz|\bcovers (NFL|MLB|EPL|UFC) only\b|\bnot (?:yet )?(?:permitted|allowed) to (?:buy|purchase)\b|\bbudget\b|\bcredits?\b/i;

test("the artifact exists — otherwise this proves nothing", () => {
  assert.ok(card, "no card artifact; the scan below would be vacuous");
  assert.ok(card.model?.notModelled, "the card declares what it does not model");
});

test("NO POLICY CLAIM IN ANY notModelled SENTENCE", () => {
  if (!card) return;
  for (const [market, sentence] of Object.entries(card.model?.notModelled ?? {})) {
    assert.doesNotMatch(
      String(sentence),
      POLICY_CLAIM,
      `notModelled.${market} states a purchasing policy: "${sentence}". State what this file contains instead — a policy sentence expires the moment the policy does, and nothing here notices.`,
    );
  }
});

test("AND THE CLAIM IS REFUTED BY THE FILES SITTING NEXT TO IT", () => {
  if (!card) return;
  const beside = ["odds-latest.json", "graded-moneylines-latest.json"]
    .filter((f) => fs.existsSync(path.join(APP, "public/data/ufc", f)));
  if (!beside.length) return;
  /* If prices are captured, no sentence in this artifact may say they are not obtainable. */
  const all = JSON.stringify(card.model?.notModelled ?? {});
  assert.doesNotMatch(
    all, /no captured UFC line|cannot capture|unable to capture/i,
    `${beside.join(" and ")} exist beside this card, so it must not claim no UFC price can be captured`,
  );
});

test("the sentence still says the useful thing — that THIS card carries no price", () => {
  if (!card) return;
  const ml = String(card.model?.notModelled?.moneyline ?? "");
  assert.ok(ml.length > 40, "the market is still declared unmodelled, with a reason");
  assert.match(ml, /no price beside them|carries no price/i, "a reader must still learn that this document has no price in it");
});
