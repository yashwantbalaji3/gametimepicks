/**
 * June-16 late slate: started/final games (kickoff passed) are not presented as active pregame
 * picks (status flag + UI label + Bank Builder gated off), and the V2 verdict honestly reflects the
 * thin upcoming slate. Source + data checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("curated games carry a started/upcoming status and gate Bank Builder for started games", () => {
  const lib = read("src/lib/curated-picks.ts");
  assert.ok(/status:\s*"upcoming"\s*\|\s*"started"/.test(lib), "CuratedGame has a status union");
  assert.ok(/const started = .*kickoffUtc.*<=\s*nowMs/.test(lib), "started = kickoff <= now");
  assert.ok(/started \?\s*\{ \.\.\.p, eligibility: \{ \.\.\.p\.eligibility, bankBuilder: false/.test(lib),
    "started games are not Bank Builder eligible");
  assert.ok(/status === "upcoming" \? -1 : 1/.test(lib), "upcoming games sort first");
});

test("curated component labels started vs upcoming games", () => {
  const c = read("src/components/world-cup/curated-picks.tsx");
  assert.ok(/started · for reference/.test(c), "started games labelled for reference");
  assert.ok(/>upcoming<|upcoming</.test(c), "upcoming games labelled");
});

test("Today World Cup focus marks started games + surfaces the upcoming count", () => {
  const page = read("src/app/today/page.tsx");
  assert.ok(/started: m\.kickoffUtc \? new Date\(m\.kickoffUtc\)\.getTime\(\) <= Date\.now\(\)/.test(page),
    "focus matches compute started from kickoff");
  assert.ok(/upcoming = matches\.filter\(\(m\) => !m\.started\)/.test(page), "computes upcoming count");
  assert.ok(/upcoming · \$\{inFocus\} World Cup games in focus/.test(page), "headline shows upcoming when some started");
});

test("V2 late-slate verdict: no launch, Argentina moneyline evaluated, thin-slate blocker", () => {
  const v2 = JSON.parse(read("public/data/bank-builder/v2-evaluation-latest.json"));
  assert.notEqual(v2.decision, "launch", "no Run #3 launched on the thin late slate");
  const argNote = (v2.notes || []).find((n) => /argentina moneyline/i.test(n));
  assert.ok(argNote, "Argentina moneyline explicitly evaluated");
  assert.ok((v2.blockers || []).length > 0, "blockers surfaced");
  // every eligible leg genuinely cleared the bar (no rigging)
  for (const leg of v2.eligibleLegs || []) {
    assert.ok(leg.survivalScore >= v2.eligibleThreshold, `${leg.pick} >= threshold`);
  }
  // Run #2 still the latest dual run (no fake Run #3)
  const dual = JSON.parse(read("public/data/bank-builder/dual-lanes-latest.json"));
  assert.ok(dual.runNumber === 2 || dual.status === "settled" || dual.status === "closed",
    "Run #2 preserved as latest dual run");
});
