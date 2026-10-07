/**
 * Methodology page content contract (2026-07-30 public cleanup — supersedes the June 15 rebuild
 * contract). /methodology is the research-terminal explainer: no-vig → model probability → the
 * model–market DIFFERENCE (never "edge") → calibration, with per-sport coverage stated truthfully
 * from the capability registry (MLB is the only live model). Product mechanics moved off this page
 * with the cleanup; the Bank Builder completed-record guarantee migrated to
 * src/lib/bank-builder/crown-record-visibility.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);
const registry = fs.readFileSync(
  new URL("../../lib/sport-capability-registry.ts", import.meta.url),
  "utf8",
);
const registryState = (key) =>
  new RegExp(`key: "${key}",\\s*label: "[^"]+",\\s*state: "(\\w+)"`).exec(registry)?.[1] ?? null;

test("covers every sport TRUTHFULLY per the capability registry (one live model, the rest labelled honestly)", () => {
  // The page must still name every sport a reader can meet on the site…
  for (const kw of ["MLB", "NBA", "UFC", "World Cup"]) {
    assert.ok(src.includes(kw), `methodology must mention ${kw}`);
  }
  // …but each card's stage must match what the registry says is true TODAY, not celebrate a legacy product.
  assert.equal(registryState("mlb"), "FULL_MODEL", "registry: MLB is the live model");
  assert.match(src, /stage="live model[^"]*"/, "MLB card is staged as the live model");
  assert.equal(registryState("nba"), "HISTORICAL_ONLY", "registry: NBA is history only");
  assert.match(src, /stage="history only[^"]*"/, "NBA card is staged as history only");
  assert.equal(registryState("ufc"), "SCAFFOLD_ONLY", "registry: UFC has no model");
  assert.match(src, /stage="market-implied only · no fight model"/, "UFC card is staged as market-implied, no model");
  assert.match(src, /stage="closed · archive only"/, "World Cup card is staged as a closed archive");
  // The coverage intro and the standing limitations name exactly the registry's states: one FULL_MODEL sport,
  // and every EXPERIMENTAL_PUBLIC sport named as experimental (2026-10-05: the old "only MLB produces output"
  // line went stale once the NFL, Premier League and Ligue 1 published).
  const full = ["mlb", "nba", "ufc", "epl", "nfl", "ligue-1"].filter((k) => registryState(k) === "FULL_MODEL");
  assert.deepEqual(full, ["mlb"], "registry: MLB is the one full model");
  assert.equal(registryState("epl"), "EXPERIMENTAL_PUBLIC");
  assert.equal(registryState("nfl"), "EXPERIMENTAL_PUBLIC");
  assert.equal(registryState("ligue-1"), "EXPERIMENTAL_PUBLIC");
  // UFC is named explicitly: its registry row describes the old market path (products), while the fight-winner
  // forecasts come from ufc-fight-model, which takes no market input (Results, 2026-10-05).
  assert.match(src, /MLB has the full live model\. The NFL, the Premier League, Ligue 1 and UFC \(fight winners\) publish\s+experimental/, "coverage intro");
  assert.match(src, /MLB is the only sport with the full live model\. NFL, Premier League, Ligue 1 and UFC fight-winner forecasts are experimental/, "limitations repeat it");
  assert.doesNotMatch(src, /MLB is the only sport producing model output|One sport has a live model/, "the stale claim is gone");
});

test("distinguishes priced vs unpriced markets (the surviving odds-backed / model-only guarantee)", () => {
  // The June framing was "odds-backed vs model-only"; the terminal framing is Priced vs Unpriced.
  // Same guarantee: the reader can always tell whether a number has a market price to check it against.
  assert.match(src, /label="Priced"/, "Priced concept card");
  assert.match(src, /label="Unpriced"/, "Unpriced concept card");
  assert.match(src, /No market price in the feed/, "unpriced is defined by the missing feed price");
  assert.match(src, /nothing to check it against/, "unpriced numbers are flagged as standing alone");
  // The parlay-eligibility half survives as the missing-odds refusal: no priced slip without every price.
  assert.match(src, /A combined price is never shown if any leg is missing odds/, "no combined price with a missing leg");
  assert.match(src, /null if any leg lacks a price/, "paper return is null, never fabricated");
});

test("states official-settlement-only integrity", () => {
  assert.ok(/official settlement only/i.test(src), "official settlement only");
  assert.ok(/never from screenshots|never from .*user reports|not.*screenshots/i.test(src),
    "settles from official sources, not screenshots/user reports");
});

test("includes the universal math (implied, no-vig, model probability, DIFFERENCE, calibration, data quality, parlay)", () => {
  assert.match(src, /p = 100 \/ \(odds \+ 100\)/, "American → implied probability");
  assert.match(src, /No-vig \(two-sided\) probability/, "no-vig block");
  assert.match(src, /p_novig_side = p_raw_side/, "proportional de-vig formula");
  assert.match(src, /P\(over\) = 1 − Φ/, "model probability from the projection distribution");
  assert.match(src, /The model–market difference/, "the difference block");
  assert.match(src, /difference_pp/, "difference in percentage points");
  assert.match(src, /disagreement measure, not an[\s\S]{0,40}advantage/,
    "the difference is framed as disagreement, never advantage");
  assert.match(src, /Calibration/, "calibration block");
  assert.match(src, /run systematically hot/, "calibration states the honest direction of the correction");
  assert.match(src, /Data-quality grade/, "data-quality block");
  assert.match(src, /Parlay odds \+ paper return/, "parlay block");
  // The OLD framing is retired: the page never reaches for "edge" for the model–market gap.
  assert.ok(!/\bedge\b/i.test(src), "no 'edge' framing anywhere on the page");
  assert.ok(!/edge_pp/.test(src), "the old edge_pp formula is gone");
});

test("carries the first-slate concentration lesson (the lesson, not the celebratory chip row)", () => {
  // The June contract pinned a chip row (Topuria / Hokit / +320). The cleanup removed the chips —
  // a four-figure record from one settled event reads as a track record — but the LESSON is
  // methodology and must survive: individually winning legs still lose together on a shared anchor.
  assert.match(src, /concentration/i, "names concentration risk");
  assert.ok(src.includes("6–1") || src.includes("6-1"), "the winning individual-moneyline grade");
  assert.ok(src.includes("0–4") || src.includes("0-4"), "the losing card grade");
  assert.match(src, /anchored on the same\s+favourite/, "the shared-anchor cause");
  for (const chip of [/Topuria/i, /Hokit/i, /\+320/]) {
    assert.ok(!chip.test(src), `no celebratory chip content: ${chip}`);
  }
});

test("explains parlay concentration risk inside the parlay math", () => {
  assert.match(src, /Multiplying legs also multiplies exposure to a shared result/,
    "the parlay block states the concentration mechanic");
  assert.match(src, /repeats one anchor across every card/, "warns against one anchor across every card");
});

test("no banned public copy", () => {
  // Whole-word matches only — avoids false hits like 'unsafe' substring etc.
  const banned = [
    /\block\b/i, /\bsafe\b/i, /\bsafest\b/i, /\bguaranteed\b/i, /\bguarantee\b/i,
    /\bsure thing\b/i, /\bfree money\b/i, /\brisk-free\b/i, /\bcan't miss\b/i,
    /\bcant miss\b/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(src), `banned copy present: ${re}`);
  }
});
