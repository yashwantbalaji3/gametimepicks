/**
 * Locks the June-12 product-header + status-vocabulary rebrand:
 *   - the global strip must NEVER show the old internal "$100 paper" bank label
 *     (it confused the ladder BASE with the real current bankroll);
 *   - the Bank Builder chip shows the REAL public summary;
 *   - the loud "Pre-lineup" badge vocabulary is replaced by the calmer statuses.
 * Source-level checks (the suite runs pre-build); built-HTML checks live in CI greps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("global header: no hardcoded bank label, no bankroll figure at all (P208)", () => {
  // The Today chip moved into the client chips component (real-clock hydration) — check both files.
  const src = fs.readFileSync("src/components/slate-status-bar.tsx", "utf8")
    + fs.readFileSync("src/components/slate-status-chips.tsx", "utf8");
  assert.ok(!src.includes('"$100 paper"'), "old internal bank label must be gone");
  // P208 F3: the strip carries date/phase/freshness only. Bankroll figures render at their owners
  // (/results, the homepage Recent-results strip, the product pages), never in the global header.
  assert.ok(!src.includes("loadPublicBankBuilderSummary") && !src.includes("loadActiveBankroll"), "no bankroll loader in the strip");
  assert.ok(src.includes("/results") && src.includes("/today"), "chips still link the freshness routes");
});

test("lineup-status vocabulary: calm labels, no shouting PRE-LINEUP", async () => {
  const { friendlyStatusLabel } = await import("./public-visibility.ts");
  assert.equal(friendlyStatusLabel("pre_lineup_likely"), "Projected starter");
  assert.equal(friendlyStatusLabel("pre_lineup_public_projection"), "Lineup pending");
  assert.equal(friendlyStatusLabel("pre_lineup_market_view"), "Lineup pending");
  assert.equal(friendlyStatusLabel("pre_lineup_unknown"), "Player evidence pending");
  assert.equal(friendlyStatusLabel("confirmed_starter"), "Confirmed starter");
  for (const s of ["pre_lineup_likely", "pre_lineup_public_projection", "waiting_on_lineups"]) {
    assert.ok(!friendlyStatusLabel(s).toUpperCase().includes("PRE-LINEUP") || friendlyStatusLabel(s) !== friendlyStatusLabel(s).toUpperCase(),
      "no all-caps PRE-LINEUP labels");
  }
});

test("step-4 candidate: settled WON, original legs + odds retained as historical evidence", () => {
  const c = JSON.parse(fs.readFileSync("public/data/bank-builder/official-step4-candidate.json", "utf8"));
  assert.equal(c.status, "won");
  assert.equal(c.result, "win");
  // Legs are never rewritten by settlement — the original card is preserved as evidence.
  assert.deepEqual(
    c.legs.map((l) => l.label).sort(),
    ["Luinder Avila Strikeouts Under 3.5", "United States or Paraguay"].sort(),
  );
  assert.equal(c.combinedAmericanOdds, 155);
});
