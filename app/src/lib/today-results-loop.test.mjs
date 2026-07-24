/**
 * RESULTS ↔ TODAY return loop (Sprint 003, Phase 7). Pins both directions of the daily journey's loop and
 * proves the added navigation never merges the settlement record-families. Source-grep style (runs pre-build).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

const statusMods = read("src/components/today/status-modules.tsx");
const resultsPage = read("src/app/results/page.tsx");

test("backward: /today → yesterday's recap (ResultsReminder links /results with recap framing)", () => {
  // The ResultsReminder is the /today results affordance; its CTA now names the recap destination.
  assert.match(statusMods, /href="\/results"/, "ResultsReminder links to /results");
  assert.match(statusMods, /Review yesterday(&rsquo;|')s recap/, "explicit 'Review yesterday's recap' backward action");
});

test("forward: /results → today's slate (results page links /today)", () => {
  assert.match(resultsPage, /href="\/today\/?"/, "results page links to /today");
  assert.match(resultsPage, /See today(&apos;|')s slate/, "explicit 'See today's slate' forward action");
});

test("the loop is a navigation link only — it never counts a pending card as a loss", () => {
  // The /today results affordance keeps the honest pending-vs-loss discipline in its own copy.
  assert.match(statusMods, /Pending cards are never counted as losses/, "pending is not a loss (honest recap copy preserved)");
});

test("family separation: the /today recap affordance shows the OFFICIAL record only, not sim-accuracy", () => {
  // The ResultsReminder must not mix the official paper record with public-sim-accuracy vocabulary
  // (hit rate / comparison report / Brier). Those live on /results, cleanly separated there.
  const reminder = statusMods.slice(statusMods.indexOf("ResultsReminder"));
  assert.doesNotMatch(reminder, /hit ?rate|comparison_report|brier|logloss/i, "no sim-accuracy family vocabulary on the /today recap affordance");
});
