/**
 * A TRUTHY OBJECT IS NOT A FORECAST — Program 234 · Release A.
 *
 * Run: npx tsx --test src/lib/offered-window/forecast-publication.test.mjs
 *
 * Tests the predicate against DATA, not against the builder's source text. A guard that greps for a
 * rule passes whether or not the rule works; this one fails if the rule stops separating a published
 * fixture from a withheld one, which is the only property anybody depends on.
 *
 * Both sides of the boundary are exercised: every malformed shape must be refused, every real
 * committed distribution must be accepted. A test that only proved the refusals would pass on a
 * predicate that returns false for everything — and would take the whole sport to WORK_OWED.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { carriesPublishableProbabilities, PROBABILITY_SUM_TOLERANCE } from "./forecast-publication.mjs";

const FORECASTS = path.join(process.cwd(), "public/data/soccer/epl/forecasts");

function committedRows() {
  if (!fs.existsSync(FORECASTS)) return [];
  return fs.readdirSync(FORECASTS)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(FORECASTS, f), "utf8")).rows ?? []);
}

test("a truthy but empty probability block is refused", () => {
  /* Each of these is `Boolean(probs) === true` — the exact hole this closes. */
  const truthyButNotAForecast = [
    {},
    { home: null, draw: null, away: null },
    { home: NaN, draw: NaN, away: NaN },
    { home: 0.5, draw: 0.3 },                       // missing an outcome
    { home: "0.5", draw: "0.3", away: "0.2" },      // strings sum to 1 only after coercion
    { home: 0.5, draw: 0.3, away: 0.4 },            // three numbers, not a distribution
    { home: 1.2, draw: -0.1, away: -0.1 },          // sums to 1, outside [0,1]
    { home: Infinity, draw: 0, away: 0 },
  ];
  for (const probs of truthyButNotAForecast) {
    assert.equal(Boolean(probs), true, "the fixture must be truthy, or it proves nothing");
    assert.equal(
      carriesPublishableProbabilities(probs),
      false,
      `${JSON.stringify(probs)} is truthy but is not a distribution a reader could be shown`,
    );
  }
});

test("absence is refused", () => {
  assert.equal(carriesPublishableProbabilities(null), false);
  assert.equal(carriesPublishableProbabilities(undefined), false);
});

test("EVERY committed pre-event row is still published", () => {
  const rows = committedRows();
  if (!rows.length) return;
  const carrying = rows.filter((r) => r.probs);
  assert.ok(carrying.length > 0, "the committed history contains probability-carrying rows");
  for (const r of carrying) {
    assert.equal(
      carriesPublishableProbabilities(r.probs),
      true,
      `${r.matchup} (${r.kickoffUtc}) carries real probabilities and must remain PUBLISHED — a stricter rule that refuses honest rows sends the whole sport to WORK_OWED`,
    );
  }
});

test("every withheld row is refused, on the numbers rather than the label", () => {
  const rows = committedRows();
  if (!rows.length) return;
  const withheld = rows.filter((r) => r.state === "READY_EXCEPT_ODDS");
  if (!withheld.length) return;
  for (const r of withheld) {
    assert.equal(carriesPublishableProbabilities(r.probs), false, `${r.matchup} withholds its odds and must not read as published`);
  }
});

test("the sum tolerance admits the producer's rounding and nothing looser", () => {
  const half = PROBABILITY_SUM_TOLERANCE / 2;
  assert.equal(carriesPublishableProbabilities({ home: 0.5 + half, draw: 0.3, away: 0.2 }), true, "6-dp rounding is fine");
  assert.equal(carriesPublishableProbabilities({ home: 0.5 + PROBABILITY_SUM_TOLERANCE * 4, draw: 0.3, away: 0.2 }), false, "a distribution that misses by 4x the tolerance is not one");
});
