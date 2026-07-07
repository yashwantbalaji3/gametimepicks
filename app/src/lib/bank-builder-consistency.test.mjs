/**
 * BANK BUILDER CONSISTENCY (2026-07-07). The product must tell ONE truth everywhere:
 *   • no survival / value / aggressive / safest risk-mode labels — Lane A and Lane B are neutral, two
 *     independent attempts at the SAME ladder;
 *   • the LIVE ladder is 5 steps (the 7-step profit-locking ladder is a methodology-only preview);
 *   • Bank Builder open exposure is its OWN exposure (0 when no active card), never the Moonshot/total;
 *   • a candidate/proposal is never a placed card; homepage + /bank-builder gate on status "active".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const proposalLib = read("src/lib/world-cup/bank-builder-proposal.ts");
const proposalCard = read("src/components/bank-builder/bank-builder-proposal-card.tsx");
const bbPage = read("src/app/bank-builder/page.tsx");
const todayPage = read("src/app/today/page.tsx");

test("proposal LABELS are neutral 'Lane A' / 'Lane B' — no survival/value/safest risk-mode text", () => {
  // The rendered lane label must be neutral (the internal `kind` union may remain for selection logic).
  assert.match(proposalLib, /label:\s*lane === "A" \? "Lane A" : "Lane B"/, "neutral Lane A / Lane B labels");
  assert.ok(!/Lane A · Survival|Lane B · Value|\(safest\)/.test(proposalLib), "no 'Survival (safest)' / 'Value' labels");
  // The proposal card must not color-code lanes by a survival/value distinction anymore.
  assert.ok(!/lane\.kind === "survival"/.test(proposalCard), "the card no longer branches styling on survival vs value");
});

test("the produced proposal lanes carry only neutral labels (functional check)", async () => {
  const { buildBankBuilderProposal } = await import("./world-cup/bank-builder-proposal.ts");
  const p = buildBankBuilderProposal(path.join(app, "public", "data"), "2026-07-07", "2026-07-07T14:00:00Z");
  for (const l of p.lanes ?? []) {
    assert.ok(l.label === "Lane A" || l.label === "Lane B", `neutral label, got "${l.label}"`);
    assert.ok(!/survival|value|safest|aggressive/i.test(l.label), "no risk-mode word in the label");
  }
});

test("the LIVE Bank Builder ladder is 5 steps (7-step is preview only)", async () => {
  const { BANK_BUILDER_STEP_COUNT } = await import("./bank-builder-ladder.ts");
  assert.equal(BANK_BUILDER_STEP_COUNT, 5, "the implemented/live ladder has 5 steps");
});

test("Bank Builder open exposure uses its OWN exposure (exposure.core), never the total/Moonshot", () => {
  assert.match(bbPage, /openExposure=\{dailyPortfolio\.exposure\.core\}/, "hero shows Bank-Builder-specific exposure");
  assert.ok(!/openExposure=\{dailyPortfolio\.openExposure\}/.test(bbPage), "not the total (which includes Moonshot's $25)");
});

test("candidate ≠ placed: homepage + /bank-builder both gate the placed card/ladder on status 'active'", () => {
  assert.match(bbPage, /c\.status === "active" && c\.legs\.length > 0/, "/bank-builder proposal/no-play gate is active-only");
  assert.match(todayPage, /product === "bank-builder" && c\.status === "active"/, "/today lane-ladder is active-only");
});

test("exposure.core is 0 today (no active Bank Builder card) — exposure must reflect that", async () => {
  const { buildDailyPortfolio } = await import("./mr-dub/daily-portfolio.ts");
  const dp = buildDailyPortfolio(path.join(app, "public", "data"), new Date("2026-07-07T14:00:00Z").toISOString(), "2026-07-07");
  const activeBB = (dp.cards ?? []).filter((c) => c.product === "bank-builder" && c.status === "active" && (c.legs ?? []).length > 0);
  if (activeBB.length === 0) assert.equal(dp.exposure.core, 0, "no active BB card ⇒ core exposure is $0");
});
