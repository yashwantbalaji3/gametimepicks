/**
 * WAITING ON SOMEBODY ELSE'S PUBLICATION IS NOT A HEALTHY NO-OP.
 *
 * Run: npx tsx --test src/lib/sports/ufc/results-coverage.test.mjs
 *
 * On 2026-08-23 ten bouts fought the previous night were waiting to be graded, and every surface
 * reported something that looked fine. The grader printed NOTHING_NEW, which is what a closed loop
 * prints. The paper cards read "pending", which is what any ungraded card reads. The corpus called
 * itself "fresh", because its bar was 120 days. Three honest surfaces, none able to say the one
 * thing that was true.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resultsCoverage, coverageNote, COVERAGE } from "./results-coverage.mjs";

test("our card newer than the corpus is AWAITING_SOURCE, and the lag is a number", () => {
  const cov = resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: "2026-08-15", nowIso: "2026-08-23T15:00:00Z" });
  assert.equal(cov.state, COVERAGE.AWAITING_SOURCE);
  assert.equal(cov.lagDays, 7);
  assert.equal(cov.waitingDays, 1, "how long WE have waited is a different number from how far the corpus is behind");
});

test("COVERED is corpus >= card, not equality", () => {
  /*
   * The corpus is a rolling window over many events. Requiring an exact match would report
   * AWAITING_SOURCE every time a LATER card had already landed — the opposite of the truth.
   */
  assert.equal(resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: "2026-08-22" }).state, COVERAGE.COVERED);
  assert.equal(resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: "2026-08-29" }).state, COVERAGE.COVERED);
});

test("an unreadable side is UNKNOWN, never a lag", () => {
  // "We could not read it" and "it is behind" are different facts, and only one is about the world.
  for (const bad of [null, "", "not-a-date", undefined]) {
    assert.equal(resultsCoverage({ cardEventDate: bad, corpusLatestEvent: "2026-08-15" }).state, COVERAGE.UNKNOWN);
    assert.equal(resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: bad }).state, COVERAGE.UNKNOWN);
  }
  assert.equal(resultsCoverage({ cardEventDate: null, corpusLatestEvent: null }).lagDays, null,
    "an unknown state must not report a number that looks measured");
});

test("the note explains the delay WITHOUT implying anything about the cards", () => {
  const note = coverageNote(resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: "2026-08-15", nowIso: "2026-08-23T15:00:00Z" }));
  assert.match(note, /2026-08-15/, "it must name what the source has actually published");
  assert.match(note, /not pending because of anything about the cards themselves/i);
  for (const banned of [/\blost\b/i, /\bfailed\b/i, /\bwrong\b/i]) {
    assert.doesNotMatch(note, banned, `an unsettled card must not be described as ${banned}`);
  }
});

test("a covered card produces NO note at all", () => {
  assert.equal(coverageNote(resultsCoverage({ cardEventDate: "2026-08-22", corpusLatestEvent: "2026-08-22" })), null);
});

test("THE FRESHNESS BAR IS NOT 120 DAYS ANY MORE", () => {
  /*
   * `fresh` meant "the newest event is within 120 days" — seventeen weeks, for a promotion that runs
   * a card most weekends. A corpus four months behind reported fresh, and so did one that had simply
   * missed last night's card.
   */
  const src = fs.readFileSync(path.join(process.cwd(), "..", "pipeline", "ufc", "build_results.py"), "utf8");
  const code = src.replace(/#.*$/gm, "");
  assert.doesNotMatch(code, /days\s*<=\s*120/, "the 120-day bar must not come back");
  assert.match(code, /latestEventLagDays/, "the lag must be reported as a number a caller can judge for itself");
});

test("LIVE ARTIFACT · the corpus reports its own lag honestly", () => {
  const p = path.join(process.cwd(), "public/data/ufc/results-latest.json");
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (j.latestEventLagDays == null) return;      // written by an older pipeline run
  /*
   * This restated the pipeline's thresholds (10 / 30) and broke the moment they were tightened —
   * pinning the number instead of the property, which is the same mistake several guards made today.
   * What must hold is that the status is a declared state, that it is MONOTONE in the lag, and that
   * the "fresh" window cannot be wide enough to cover a missed card in a sport that runs weekly.
   */
  assert.ok(["fresh", "lagging", "stale", "unknown"].includes(j.freshnessStatus), "the status must be one of the declared states");
  const rank = { fresh: 0, lagging: 1, stale: 2 };
  const src = fs.readFileSync(path.join(process.cwd(), "..", "pipeline", "ufc", "build_results.py"), "utf8");
  const bounds = [...src.matchAll(/lag_days <= (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(bounds.length >= 2, "the pipeline must declare its thresholds where they can be read");
  assert.ok(bounds[0] <= 7, `a "fresh" window of ${bounds[0]} days is wide enough to hide a missed card in a weekly sport`);
  assert.deepEqual([...bounds].sort((a, b) => a - b), bounds, "the thresholds must increase — a non-monotone bar cannot be reasoned about");
  const expected = j.latestEventLagDays <= bounds[0] ? "fresh" : j.latestEventLagDays <= bounds[1] ? "lagging" : "stale";
  assert.equal(j.freshnessStatus, expected, `a ${j.latestEventLagDays}-day lag must report ${expected}`);
  assert.ok(rank[j.freshnessStatus] != null);
});
