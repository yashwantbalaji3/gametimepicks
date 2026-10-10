/**
 * TRUTH-001 — every public sentence about Moonshot's money matches the implemented accounting.
 *
 * Run: npx tsx --test src/lib/mr-dub/moonshot-bankroll-truth.test.mjs
 *
 * The rule (founder 2026-09-10, Rule S; completion C1 2026-10-02; lib/mr-dub/protected-fold.mjs): Moonshot's
 * settled results move the CORE paper bankroll — a lost run costs the lane its $25 seed, a won step rolls.
 * Public copy said the opposite in three places ("never touches the protected bankroll", "each with its own
 * bankroll", "separate flat-stake paper"), and /mr-dub labelled the core bankroll "Bank Builder" while its only
 * Moonshot row was the retired Jun–Jul single-card lane (0–7).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { moonshotInCore, coreBankrollNote, productLabelOf } from "./flagship.ts";
import { MOONSHOT_BANKROLL_RULE } from "../products/moonshot-state.mjs";
import { SEED } from "./protected-fold.mjs";

const APP = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8"));
const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the money owner's own fold: Moonshot seeds are inside the core bankroll", () => {
  const p = read("mr-dub/portfolio.json");
  assert.equal(p.moonshot.separateFromCore, false, "the artifact says Moonshot is not separate");
  const f = p.protectedFold;
  let bbLost = 0, msLost = 0;
  for (const d of f.days) { bbLost += d.bankBuilder.lost; msLost += d.moonshot.lost; }
  // Rule S reconciles exactly: every lost step costs its lane's seed, nothing else moved the bankroll.
  assert.equal(f.bankrollDelta, -(bbLost * SEED["bank-builder"]) - (msLost * SEED.moonshot));
  const m = moonshotInCore(p);
  assert.equal(m.lost, msLost);
  assert.equal(m.seedCost, msLost * 25);
  assert.ok(m.seedCost > 0, "Moonshot losses demonstrably moved the core bankroll");
});

test("the shared note names Moonshot inside the core bankroll and its seed cost", () => {
  const m = moonshotInCore(read("mr-dub/portfolio.json"));
  const note = coreBankrollNote(m);
  assert.match(note, /core paper bankroll: Bank Builder and, since the Sep 10 reconciliation, Moonshot/);
  assert.ok(note.includes(`${m.lost} so far, −$${m.seedCost.toLocaleString("en-US")}`));
  assert.doesNotMatch(note, /Moonshot (is|are|&|and World Cup Specials are) separate flat-stake/);
});

test("attribution labels: the canonical row is the core bankroll; the master ledger's Moonshot row is the retired lane, dated", () => {
  const ml = read("mr-dub/master-ledger.json");
  const canon = ml.products.find((x) => x.canonical);
  assert.equal(productLabelOf(canon), "Core bankroll (Bank Builder + Moonshot)");
  const ms = ml.products.find((x) => x.productId === "moonshot");
  assert.ok(ms.history.every((h) => h.date < "2026-09-10"), "premise: this row predates the ladder era");
  assert.match(productLabelOf(ms), /^Moonshot single-card lane \(Jun 23 – Jul 6\)$/);
});

test("no public surface says Moonshot is outside the core bankroll", () => {
  const files = [
    "src/lib/products/moonshot-state.mjs", "src/components/results/results-explorer.tsx", "src/app/mr-dub/page.tsx",
    "src/components/mr-dub/flagship/product-attribution.tsx", "src/components/mr-dub/flagship/analytics-charts.tsx",
  ];
  for (const f of files) {
    const code = src(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""); // comments may quote the old copy
    assert.doesNotMatch(code, /never touches the protected bankroll/, f);
    assert.doesNotMatch(code, /each with its own bankroll/, f);
    assert.doesNotMatch(code, /Moonshot (&amp;|&) World Cup Specials are separate flat-stake/, f);
    assert.doesNotMatch(code, /side lanes are (separate )?flat-stake paper/, f);
  }
  assert.match(MOONSHOT_BANKROLL_RULE, /move the core paper bankroll: a lost run costs the lane its \$25 seed/);
});
