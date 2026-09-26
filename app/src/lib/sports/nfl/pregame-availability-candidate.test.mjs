/**
 * THE UNEVALUATED CANDIDATE, AND THE ONE LOOK IT HAS NOT SPENT.
 *
 * Run: npx tsx --test src/lib/sports/nfl/pregame-availability-candidate.test.mjs
 *
 * The pregame availability margin candidate was never measured. A preregistered data-integrity bar
 * refused the run before any metric was computed, because two of three scored seasons carry
 * depth-chart rows with no capture instant. That is UNEVALUATED — not REJECTED, which would mean it
 * was measured and did not clear.
 *
 * ⚠ NOTHING MECHANICAL PROTECTED THAT DISTINCTION UNTIL NOW. It lived in a JSON field and in whoever
 * remembered reading it. The two ways it dies are both quiet: someone relabels the status to
 * REJECTED because that is the word people expect, or someone runs the scorer "just to see" and
 * spends the single permitted look. Both are recoverable only by never having done them.
 *
 * These assertions are about the RECORD, not about the model. They will keep passing while the
 * candidate is honestly unevaluated, and fail the moment either the label or the look moves without
 * the registration being amended first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPORTS = path.join(process.cwd(), "..", "data/internal/research/nfl/reports");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(REPORTS, f), "utf8")); } catch { return null; } };

const REFUSAL = read("pregame-availability-margin-refusal.json");
const PREREG = read("pregame-availability-margin-preregistration.json");
const SEARCH = read("pregame-availability-source-search.json");

test("the refusal, the registration and the source search are all present", () => {
  /* Everything below is vacuous otherwise. */
  assert.ok(REFUSAL, "pregame-availability-margin-refusal.json is missing");
  assert.ok(PREREG, "pregame-availability-margin-preregistration.json is missing");
  assert.ok(SEARCH, "pregame-availability-source-search.json is missing");
});

test("⚠ THE CANDIDATE IS UNEVALUATED, AND IS NEVER RELABELLED REJECTED", () => {
  assert.equal(REFUSAL.status, "UNEVALUATED");
  assert.notEqual(REFUSAL.status, "REJECTED");

  /* REJECTED is a claim that a measurement happened. It did not. */
  assert.match(REFUSAL.verdictIsNot, /NOT a REJECTED verdict/i);
  assert.match(REFUSAL.statusMeaning, /never measured/i);

  // The refusal must name the bar it refused on, or it is an opinion rather than a rule.
  assert.match(REFUSAL.reason, /noLeakage/);
  assert.deepEqual(REFUSAL.detail.stampedSeasons, [2025]);
  assert.ok(REFUSAL.detail.unstampedSeasons.length >= 2, "the refusal records which seasons lacked a capture instant");
});

test("⚠ THE ONE PERMITTED LOOK IS UNSPENT — the evaluation file must not exist", () => {
  /*
   * The registration names exactly where a measurement would land. Its absence IS the claim that no
   * look has been taken, so the guard is the absence itself rather than a field asserting it.
   */
  const evalPath = PREREG.outputsWhenRun?.evaluation;
  assert.match(evalPath, /pregame-availability-margin-evaluation\.json$/, "the registration still names its output");

  const abs = path.join(process.cwd(), "..", evalPath);
  assert.equal(
    fs.existsSync(abs), false,
    `${evalPath} exists — the single permitted look has been spent. If that was deliberate, this guard should be replaced by one that pins the evaluation; if not, the look cannot be un-taken.`,
  );
  assert.match(REFUSAL.oneLookPreserved, /unspent/i);
});

test("the incumbents are untouched by any of this", () => {
  assert.match(REFUSAL.incumbentStatus, /nfl-margin-elo-hfa-v1/);
  assert.match(REFUSAL.incumbentStatus, /VALIDATED and UNCHANGED/);
  assert.match(SEARCH.incumbentStatus, /VALIDATED and UNCHANGED/);
});

test("⚠ THE SOURCE SEARCH FOUND NOTHING, AND SAYS SO RATHER THAN LOWERING THE BAR", () => {
  /*
   * 2026-09-26. Three candidates probed, all refuted or insufficient:
   *   nflverse per-season assets   one of four seasons carries a `dt` capture instant
   *   release asset timestamps     depth_charts_2022.csv was rewritten 2024-08-04, two years late
   *   Wayback                      10 of 12 captures in a 2.5-month window are 403s, one team
   */
  assert.equal(SEARCH.verdict, "NO_DEFENSIBLE_SOURCE_FOUND");
  assert.ok(SEARCH.candidates.length >= 3, "the search records what it actually probed");
  for (const c of SEARCH.candidates) {
    assert.ok(c.probe, `${c.source}: a candidate without a probe is an assertion`);
    assert.match(c.verdict, /INSUFFICIENT|REFUTED/, `${c.source}: every candidate reaches a verdict`);
  }

  // The paths that would have made it scoreable dishonestly are named and refused.
  const notTaken = SEARCH.pathsExplicitlyNotTaken.join(" ");
  assert.match(notTaken, /2025 alone|only because/i, "scoring the convenient season is refused");
  assert.match(notTaken, /week number/i, "a week number is not a capture instant");
  assert.match(notTaken, /[Ww]eakening the noLeakage bar/, "the bar is not relaxed to make it scoreable");

  // A search that found nothing must not have quietly created a registration.
  assert.equal(fs.existsSync(path.join(REPORTS, "pregame-availability-margin-preregistration-v2.json")), false,
    "a registration with no admissible source is paperwork");
});

test("the search answers the refusal it claims to answer", () => {
  assert.match(SEARCH.answersTheRefusal, /pregame-availability-margin-refusal\.json$/);
  /* And it asks the right question — the one the whole lane turns on. */
  assert.match(SEARCH.question, /knowable BEFORE/i);
});
