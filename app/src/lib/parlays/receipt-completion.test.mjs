/**
 * COMPLETING A SETTLEMENT IS NOT REWRITING ONE.
 *
 * Run: npx tsx --test src/lib/parlays/receipt-completion.test.mjs
 *
 * The settler refused to overwrite a receipt that differed from the one on disk. That refusal is
 * load-bearing — a settled day must never be silently restated — but it also refused a card moving
 * out of pending because its result had finally arrived, which closed the day to correction
 * permanently: no scheduled run revisits anything but ET-yesterday.
 *
 * The 2026-08-22 UFC cards settled pending at 05:53 against a results source that was days behind.
 * They would have sat pending forever while the Lab's published record computed over only the cards
 * that happened to settle on time — a record flattering itself without anyone lying.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyReceiptChange, RECEIPT_CHANGE } from "./receipt-completion.mjs";

const card = (id, result, legs, extra = {}) => ({ slipId: id, sport: "ufc", tier: "medium", combinedDecimal: 3.35, result, legs, ...extra });

test("identical receipts are NO_CHANGE", () => {
  const a = [card("x", "pending", ["pending", "pending"])];
  assert.equal(classifyReceiptChange(a, [card("x", "pending", ["pending", "pending"])]).state, RECEIPT_CHANGE.NO_CHANGE);
});

test("pending → decided is a COMPLETION, on the card AND on its legs", () => {
  const out = classifyReceiptChange(
    [card("x", "pending", ["pending", "pending"])],
    [card("x", "loss", ["loss", "win"])],
  );
  assert.equal(out.state, RECEIPT_CHANGE.COMPLETION_ONLY);
  assert.equal(out.completed.length, 3, "the card and both legs each moved");
  assert.ok(out.completed.some((c) => c.label === "the card"));
  assert.ok(out.completed.some((c) => c.label === "leg 2" && c.to === "win"));
});

test("A DECIDED OUTCOME NEVER MOVES — not to another outcome, and not back to pending", () => {
  /*
   * The second half matters as much as the first: a source that stops answering must not be able to
   * un-settle a card that was already graded.
   */
  for (const [from, to] of [["loss", "win"], ["win", "loss"], ["win", "pending"], ["loss", "pending"]]) {
    const out = classifyReceiptChange([card("x", from, ["x"])], [card("x", to, ["x"])]);
    assert.equal(out.state, RECEIPT_CHANGE.REWRITE, `${from} -> ${to} must be refused`);
    assert.match(out.reasons.join(" "), /was settled/);
  }
});

test("a decided LEG never moves either, even when the card's own result may still complete", () => {
  const out = classifyReceiptChange(
    [card("x", "pending", ["win", "pending"])],
    [card("x", "loss", ["loss", "loss"])],
  );
  assert.equal(out.state, RECEIPT_CHANGE.REWRITE, "leg 1 was already graded win and must not be re-graded");
});

test("anything other than an outcome moving is a REWRITE", () => {
  const base = [card("x", "pending", ["pending"])];
  assert.equal(classifyReceiptChange(base, [card("x", "pending", ["pending"], { combinedDecimal: 9.99 })]).state, RECEIPT_CHANGE.REWRITE);
  assert.equal(classifyReceiptChange(base, [card("x", "pending", ["pending", "pending"])]).state, RECEIPT_CHANGE.REWRITE);
  assert.equal(classifyReceiptChange(base, []).state, RECEIPT_CHANGE.REWRITE);
  assert.equal(classifyReceiptChange(base, [...base, card("y", "pending", ["pending"])]).state, RECEIPT_CHANGE.REWRITE);
});

test("every refusal NAMES the card and what moved", () => {
  // A refusal on a settlement path is only useful if a human can act on it without re-deriving it.
  const out = classifyReceiptChange([card("x", "win", ["win"])], [card("x", "loss", ["loss"])]);
  assert.ok(out.reasons.every((r) => r.includes("x")), "each reason must name the card it is about");
});

test("the settler routes through this and cannot go back to a byte compare", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/parlays/settle-lab-cards.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /classifyReceiptChange\(prior\.cards, receipt\.cards\)/);
  assert.doesNotMatch(code, /JSON\.stringify\(prior\.cards\) === JSON\.stringify\(receipt\.cards\)/,
    "a byte compare cannot tell a completion from a rewrite");
  // Scoped to the REWRITE branch itself rather than a fixed character window — the reasons loop
  // sits between the check and the exit, and a window is just a guess about how long that stays.
  const branch = code.slice(code.indexOf("RECEIPT_CHANGE.REWRITE"));
  // Terminated on the branch's own closing brace at its indentation, not the first "}" in the
  // slice — the refusal message is a template literal, so it contains braces of its own.
  assert.match(branch.slice(0, branch.indexOf("\n  }")), /process\.exit\(1\)/,
    "a rewrite must still fail the run");
});
