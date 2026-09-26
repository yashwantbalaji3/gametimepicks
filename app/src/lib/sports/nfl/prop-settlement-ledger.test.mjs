/**
 * THE PROP SETTLEMENT LEDGER (Phase D) — the record, not a second opinion.
 *
 * Run: npx tsx --test src/lib/sports/nfl/prop-settlement-ledger.test.mjs
 *
 * Each test below is one of the properties the record has to have in order to be worth keeping:
 * pending never enters, an absence never becomes a loss, a repeated FINAL read changes nothing, a
 * later correction appends rather than edits, and the frozen pregame block is untouchable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildLedger, countsOf, foldEventIntoLedger, toGradedPicks } from "./prop-settlement-ledger.mjs";

const NOW = "2026-09-28T04:00:00Z";
const KICK = "2026-09-27T17:00Z";

const frozen = (over = {}) => ({
  projection: { median: 57, p10: 23, p90: 113 },
  market: { line: 45.5, overOdds: -114, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-27T16:31:00Z" },
  pricingState: null,
  participation: "AVAILABLE",
  forecastGeneratedAt: "2026-09-27T14:02:00Z",
  ...over,
});

const row = (over = {}) => ({
  predictionId: "401872953:nfl-athlete-4379399:player_reception_yds",
  playerId: "nfl-athlete-4379399",
  name: "James Cook",
  team: "BUF",
  family: "player_reception_yds",
  /* PUBLISHED by default so each test below varies only the thing it is about; the publication
     boundary is exercised explicitly in its own test. */
  familyState: "PUBLISHED",
  frozen: frozen(),
  frozenIdentity: "abc123",
  live: { phase: "FINAL", statValue: 61, clock: null, period: null, score: { home: 21, away: 17 } },
  settlement: { state: "SETTLED", finalStat: 61, line: 45.5, lineResult: "OVER", forecastResult: "WIN", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
  reconciliation: null,
  ...over,
});

const artifact = (rows, over = {}) => ({
  providerEventId: "401872953",
  matchup: "LAC @ BUF",
  kickoffUtc: KICK,
  finality: "PROVISIONAL",
  rows,
  ...over,
});

/* ── ADMISSION ─────────────────────────────────────────────────────────────────────────────────── */

test("⚠ PENDING NEVER ENTERS THE LEDGER — a record cannot un-say a result", () => {
  const pending = row({ settlement: { state: "PENDING", finalStat: null, line: 45.5, lineResult: null, forecastResult: null, settledAt: null, source: "espn-nfl-summary" } });
  const out = foldEventIntoLedger([], artifact([pending]), NOW);
  assert.deepEqual(out.rows, [], "a game still being played has no row here");
  assert.equal(out.skipped, 1);
  assert.equal(out.added, 0);
});

test("a row with no frozen block is refused — there is no line it landed against", () => {
  /*
   * The producer refuses to mint a frozen block from post-kickoff evidence. That refusal must not be
   * laundered into a permanent record by this fold: a settlement with nothing frozen behind it has
   * no line and no forecast, so there is nothing to keep.
   */
  const unfrozen = row({ frozen: null, frozenRefusal: "the price was captured at or after kickoff" });
  const out = foldEventIntoLedger([], artifact([unfrozen]), NOW);
  assert.deepEqual(out.rows, []);
  assert.equal(out.skipped, 1);
});

test("a settled row is admitted with its frozen line, prices, capture instant and projection intact", () => {
  const { rows, added } = foldEventIntoLedger([], artifact([row()]), NOW);
  assert.equal(added, 1);
  const r = rows[0];
  assert.equal(r.settlementId, "401872953:nfl-athlete-4379399:player_reception_yds");
  assert.equal(r.eventId, "401872953");
  assert.equal(r.playerName, "James Cook");
  assert.equal(r.family, "player_reception_yds");
  assert.deepEqual(r.frozen.market, { line: 45.5, overOdds: -114, underOdds: -108, sportsbook: "draftkings", capturedAt: "2026-09-27T16:31:00Z" });
  assert.equal(r.frozen.projection.median, 57);
  assert.equal(r.frozen.forecastGeneratedAt, "2026-09-27T14:02:00Z");
  assert.equal(r.finalStat, 61);
  assert.equal(r.lineResult, "OVER");
  assert.equal(r.forecastResult, "WIN");
  assert.equal(r.settledAt, "2026-09-27T20:31:00Z", "the ORIGINAL settlement instant, not the fold instant");
  assert.deepEqual(r.corrections, []);
});

/* ── ABSENCE ───────────────────────────────────────────────────────────────────────────────────── */

test("⚠ NO_MEASUREMENT IS CARRIED AS ITSELF — never a loss, never a zero, never an Under", () => {
  const absent = row({
    live: { phase: "FINAL", statValue: null, clock: null, period: null, score: { home: 21, away: 17 } },
    settlement: {
      state: "NO_MEASUREMENT", finalStat: null, line: 45.5, lineResult: null, forecastResult: null,
      reason: "the provider reports no stat row for this player in this family at FINAL.",
      bookRuleUnknown: true, settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary",
    },
  });
  const [r] = foldEventIntoLedger([], artifact([absent]), NOW).rows;

  assert.equal(r.measurementState, "NO_MEASUREMENT");
  assert.equal(r.finalStat, null, "absent is not zero");
  assert.equal(r.lineResult, null, "and not an Under");
  assert.equal(r.forecastResult, null, "and not a loss");
  assert.equal(r.bookRuleUnknown, true, "whether a book voids this is its rule, not ours");
  assert.match(r.noMeasurementReason, /no stat row/);

  // And it stays out of the denominator, in both the counts and the graded translation.
  const c = countsOf([r]);
  assert.equal(c.noMeasurement, 1);
  assert.equal(c.decided, 0, "an absence decides nothing");
  assert.equal(c.forecastLosses, 0);
  assert.equal(toGradedPicks([r])[0].hit, null, "null keeps it out of the hit rate entirely");
});

test("a measured ZERO is a result and is kept as one", () => {
  const zero = row({
    live: { phase: "FINAL", statValue: 0, clock: null, period: null, score: { home: 21, away: 17 } },
    settlement: { state: "SETTLED", finalStat: 0, line: 45.5, lineResult: "UNDER", forecastResult: "LOSS", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
  });
  const [r] = foldEventIntoLedger([], artifact([zero]), NOW).rows;
  assert.equal(r.measurementState, "OBSERVED", "he dressed and caught nothing — that is a measurement");
  assert.equal(r.finalStat, 0);
  assert.equal(r.lineResult, "UNDER");
  assert.equal(countsOf([r]).decided, 1);
  assert.equal(toGradedPicks([r])[0].hit, false);
});

test("a factual PUSH is supported and decides nothing", () => {
  const push = row({
    settlement: { state: "SETTLED", finalStat: 46, line: 46, lineResult: "PUSH", forecastResult: "PUSH", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
  });
  const [r] = foldEventIntoLedger([], artifact([push]), NOW).rows;
  assert.equal(r.lineResult, "PUSH");
  const c = countsOf([r]);
  assert.equal(c.push, 1);
  assert.equal(c.decided, 0, "a push is neither a win nor a loss");
  assert.equal(toGradedPicks([r])[0].hit, null);
});

test("a one-sided market with no published side is NOT_APPLICABLE, not a miss", () => {
  const atd = row({
    family: "anytime_td",
    predictionId: "401872953:nfl-athlete-4379399:anytime_td",
    settlement: { state: "SETTLED", finalStat: 0, line: null, lineResult: "NO", forecastResult: "NOT_APPLICABLE", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
  });
  const [r] = foldEventIntoLedger([], artifact([atd]), NOW).rows;
  assert.equal(r.lineResult, "NO", "the FACT is recorded");
  assert.equal(r.forecastResult, "NOT_APPLICABLE", "but we graded no side of it");
  assert.equal(countsOf([r]).decided, 0);
  assert.equal(toGradedPicks([r])[0].hit, null);
});

/* ── IDEMPOTENCY ───────────────────────────────────────────────────────────────────────────────── */

test("⚠ A REPEATED FINAL READ ADDS NOTHING, MOVES NOTHING AND RE-GRADES NOTHING", () => {
  const first = foldEventIntoLedger([], artifact([row()]), NOW);
  const second = foldEventIntoLedger(first.rows, artifact([row()]), "2026-09-29T09:00:00Z");
  const third = foldEventIntoLedger(second.rows, artifact([row()]), "2026-10-02T09:00:00Z");

  assert.equal(second.added, 0);
  assert.equal(second.corrected, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(third.rows.length, 1, "three reads, one row");
  assert.equal(third.rows[0].settledAt, "2026-09-27T20:31:00Z", "the settlement instant never churns");
  assert.deepEqual(third.rows[0].corrections, [], "an unchanged answer is not a correction");
  assert.deepEqual(JSON.parse(JSON.stringify(first.rows)), JSON.parse(JSON.stringify(third.rows)), "byte-identical across repeats");
});

test("the ledger reads the same way twice — insertion order is preserved across folds", () => {
  const a = row({ predictionId: "E:a:player_receptions" });
  const b = row({ predictionId: "E:b:player_receptions" });
  const c = row({ predictionId: "E:c:player_receptions" });
  const one = foldEventIntoLedger([], artifact([a, b]), NOW);
  const two = foldEventIntoLedger(one.rows, artifact([c, a, b]), NOW);
  assert.deepEqual(two.rows.map((r) => r.settlementId), ["E:a:player_receptions", "E:b:player_receptions", "E:c:player_receptions"],
    "an existing row keeps its place; a new one appends");
});

/* ── CORRECTION ────────────────────────────────────────────────────────────────────────────────── */

test("⚠ A LATER CORRECTION APPENDS — the original answer is still readable afterwards", () => {
  const first = foldEventIntoLedger([], artifact([row()]), NOW);

  // Two days later the provider's official stat is revised downward, past the line.
  const revised = row({
    settlement: { state: "SETTLED", finalStat: 41, line: 45.5, lineResult: "UNDER", forecastResult: "LOSS", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
    reconciliation: { finalStat: 41, differsFrom: 61, observedAt: "2026-09-29T09:00:00Z", source: "espn-nfl-summary" },
  });
  const after = foldEventIntoLedger(first.rows, artifact([revised]), "2026-09-29T09:00:00Z");
  const r = after.rows[0];

  assert.equal(after.corrected, 1);
  assert.equal(after.rows.length, 1, "a correction is not a second row");

  // The CURRENT truth moved.
  assert.equal(r.finalStat, 41);
  assert.equal(r.lineResult, "UNDER");
  assert.equal(r.forecastResult, "LOSS");

  // What we published at the time did NOT.
  assert.equal(r.original.finalStat, 61);
  assert.equal(r.original.lineResult, "OVER");
  assert.equal(r.original.forecastResult, "WIN");
  assert.equal(r.original.at, "2026-09-27T20:31:00Z");
  assert.equal(r.settledAt, "2026-09-27T20:31:00Z", "and neither did the instant we said it");

  // And the change itself is on the record, with when and why.
  assert.equal(r.corrections.length, 1);
  assert.equal(r.corrections[0].at, "2026-09-29T09:00:00Z");
  assert.deepEqual(r.corrections[0].changes.finalStat, { from: 61, to: 41 });
  assert.deepEqual(r.corrections[0].changes.forecastResult, { from: "WIN", to: "LOSS" });
  assert.match(r.corrections[0].note, /revised the final stat/);
  assert.equal(countsOf(after.rows).corrected, 1);
});

test("a NO_MEASUREMENT that later resolves is a correction, not a new row", () => {
  const absent = row({
    settlement: { state: "NO_MEASUREMENT", finalStat: null, line: 45.5, lineResult: null, forecastResult: null, bookRuleUnknown: true, reason: "no stat row", settledAt: "2026-09-27T20:31:00Z", source: "espn-nfl-summary" },
  });
  const first = foldEventIntoLedger([], artifact([absent]), NOW);
  assert.equal(first.rows[0].measurementState, "NO_MEASUREMENT");

  const resolved = foldEventIntoLedger(first.rows, artifact([row()]), "2026-09-29T09:00:00Z");
  const r = resolved.rows[0];
  assert.equal(resolved.rows.length, 1);
  assert.equal(r.measurementState, "OBSERVED");
  assert.equal(r.finalStat, 61);
  assert.equal(r.original.measurementState, "NO_MEASUREMENT", "we did once say we had no measurement");
  assert.deepEqual(r.corrections[0].changes.measurementState, { from: "NO_MEASUREMENT", to: "OBSERVED" });
});

test("finality advancing PROVISIONAL → CANONICAL is recorded, and does not touch the result", () => {
  const first = foldEventIntoLedger([], artifact([row()]), NOW);
  assert.equal(first.rows[0].finality, "PROVISIONAL");
  const after = foldEventIntoLedger(first.rows, artifact([row()], { finality: "CANONICAL" }), "2026-09-28T00:00:00Z");
  const r = after.rows[0];
  assert.equal(r.finality, "CANONICAL");
  assert.equal(r.forecastResult, "WIN", "the answer is unchanged");
  assert.deepEqual(r.corrections[0].changes, { finality: { from: "PROVISIONAL", to: "CANONICAL" } });
  assert.equal(countsOf([r]).canonical, 1);
});

test("⚠ A CORRECTION MAY NEVER MOVE THE FROZEN LINE OR THE FROZEN FORECAST", () => {
  /*
   * The whole record rests on this. If a later read could rewrite the line, "did the forecast beat
   * the line" would be a question about the present rather than about what was published.
   */
  const first = foldEventIntoLedger([], artifact([row()]), NOW);
  const tampered = row({
    frozen: frozen({ market: { line: 99.5, overOdds: -110, underOdds: -110, sportsbook: "fanduel", capturedAt: "2026-09-27T23:00:00Z" }, projection: { median: 5, p10: 1, p90: 9 } }),
    settlement: { state: "SETTLED", finalStat: 61, line: 99.5, lineResult: "UNDER", forecastResult: "WIN", settledAt: "2026-09-27T23:31:00Z", source: "espn-nfl-summary" },
  });
  const after = foldEventIntoLedger(first.rows, artifact([tampered]), "2026-09-29T09:00:00Z");
  const r = after.rows[0];

  assert.equal(r.frozen.market.line, 45.5, "the frozen line is what a reader was shown before kickoff");
  assert.equal(r.frozen.market.sportsbook, "draftkings");
  assert.equal(r.frozen.projection.median, 57, "and the frozen projection is ours, as published");
  assert.equal(r.settledAt, "2026-09-27T20:31:00Z", "a later settlement instant cannot replace the original");
});

/* ── THE SLATE, AND THE TRANSLATION ────────────────────────────────────────────────────────────── */

test("buildLedger folds a whole slate deterministically", () => {
  const e1 = artifact([row()], { providerEventId: "401872953" });
  const e2 = artifact([row({ predictionId: "401872960:nfl-athlete-1:player_rush_yds", playerId: "nfl-athlete-1", family: "player_rush_yds" })], { providerEventId: "401872960", matchup: "MIA @ NYJ" });

  const a = buildLedger({ prior: null, artifacts: [e1, e2], nowIso: NOW });
  const b = buildLedger({ prior: null, artifacts: [e2, e1], nowIso: NOW });
  assert.deepEqual(a.rows.map((r) => r.settlementId), b.rows.map((r) => r.settlementId), "event order in the input must not change the record");
  assert.equal(a.added, 2);
  assert.equal(a.counts.rows, 2);

  // Re-folding the same slate onto itself changes nothing.
  const again = buildLedger({ prior: a, artifacts: [e1, e2], nowIso: "2026-10-05T00:00:00Z" });
  assert.equal(again.added, 0);
  assert.equal(again.corrected, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(again.rows)), JSON.parse(JSON.stringify(a.rows)));
});

test("the graded translation re-grades nothing and names the book and the line", () => {
  const { rows } = foldEventIntoLedger([], artifact([row()]), NOW);
  const [p] = toGradedPicks(rows);
  assert.equal(p.eventId, "nfl-401872953");
  assert.equal(p.when, "2026-09-27");
  assert.equal(p.subject, "James Cook · BUF");
  assert.equal(p.market, "Receiving yards 45.5 (draftkings)");
  assert.equal(p.predicted, "57", "our projection, as frozen");
  assert.equal(p.actual, "61");
  assert.equal(p.hit, true, "copied from forecastResult — nothing is decided here");
});

/* ── THE PUBLICATION BOUNDARY ──────────────────────────────────────────────────────────────────── */

test("⚠ ONLY A PUBLISHED FAMILY IS TRANSLATED — and an unknown state is NOT permission", () => {
  /*
   * The producer tracks every family the board carries, including ESTIMATE ones: `player_pass_yds`
   * is ESTIMATE because P318 is STOP. Recording that internally is research. Putting its record on a
   * public surface is a claim about a model that failed its own preregistered bar.
   *
   * Verified against the real 2026-09-24 slate: 57 ledger rows, 53 published, and all four
   * `player_pass_yds` rows dropped.
   */
  const mk = (familyState, family) => row({ predictionId: `E:p:${family}`, family, familyState });
  const rows = foldEventIntoLedger([], artifact([
    mk("PUBLISHED", "player_reception_yds"),
    mk("ESTIMATE", "player_pass_yds"),
    mk("WITHHELD", "player_pass_int"),
    mk(null, "player_receptions"),
    mk(undefined, "player_rush_yds"),
    mk("SOMETHING_NEW", "anytime_td"),
  ]), NOW).rows;

  assert.equal(rows.length, 6, "the ledger records all of them — it is the internal record");
  const published = toGradedPicks(rows);
  assert.deepEqual(published.map((p) => p.market), ["Receiving yards 45.5 (draftkings)"],
    "exactly one family is publishable, and it is the PUBLISHED one");

  // Each refusal for its own reason, stated.
  assert.equal(published.some((p) => /Passing/.test(p.market)), false, "ESTIMATE: P318 is STOP");
  assert.equal(published.some((p) => /Anytime/.test(p.market)), false, "an unrecognised state fails closed");
});

test("the slate date is the game's ET date, and it agrees with the ledger that holds it", () => {
  // A Sunday-night kickoff at 00:15Z belongs to the PREVIOUS ET day.
  const late = foldEventIntoLedger([], artifact([row()], { kickoffUtc: "2026-09-29T00:15Z" }), NOW).rows[0];
  assert.equal(late.slateDateEt, "2026-09-28", "00:15Z Monday is Sunday night in ET");
  assert.equal(toGradedPicks([{ ...late, familyState: "PUBLISHED" }])[0].when, "2026-09-28",
    "the published row must not be dated a day later than the slate it belongs to");

  const day = foldEventIntoLedger([], artifact([row()], { kickoffUtc: "2026-09-27T17:00Z" }), NOW).rows[0];
  assert.equal(day.slateDateEt, "2026-09-27");
});

test("a projection is published at the precision the board shows, not the precision it computed", () => {
  const r = foldEventIntoLedger([], artifact([row({ familyState: "PUBLISHED", frozen: frozen({ projection: { median: 63.7478, p10: 18.8873, p90: 153.2266 } }) })]), NOW).rows[0];
  assert.equal(r.frozen.projection.median, 63.7478, "the ledger keeps what the model actually produced");
  assert.equal(toGradedPicks([r])[0].predicted, "64", "and the published row rounds it, as the board does");
});

/* ── THE WRITER HAS AN OWNER, AND WHAT IT WRITES IS COMMITTED ──────────────────────────────────── */

test("⚠ THE LEDGER IS WRITTEN BY A SCHEDULED JOB AND COMMITTED BY IT — not built and dropped", () => {
  /*
   * A writer with no scheduled owner, or one whose output is outside its job's commit allowlist, is
   * an artifact that is built and never published. This repository has lost three days of a research
   * archive to exactly that, twice: once because a directory was missing from an allowlist, and once
   * because a capture was deliberately consumed in-run and dropped.
   *
   * TWO owners on purpose. `nfl-live-props` folds a row in the run that settled it. `nfl-event-window`
   * folds again daily — that is the later-correction path, and it is the reason this fold lives
   * outside the producer at all: an official stat correction lands after the live workflow has
   * stopped running for that game and its reconciliation window has closed.
   */
  const repo = path.resolve(process.cwd(), "..");
  const wf = (name) => fs.readFileSync(path.join(repo, ".github/workflows", name), "utf8");

  for (const [name, why] of [
    ["nfl-live-props.yml", "folds in the run that settled the row"],
    ["nfl-event-window.yml", "folds again daily — the later-correction path"],
  ]) {
    const body = wf(name);
    assert.match(body, /settle-nfl-live-props\.mjs/, `${name} must run the ledger writer (${why})`);
    assert.match(body, /data\/internal\/nfl\/prop-settlement/, `${name} must also COMMIT what it wrote`);
  }

  // The producer that feeds it is scheduled too — a ledger with no input is not a record either.
  assert.match(wf("nfl-live-props.yml"), /schedule:/, "the live producer runs on a schedule");
});

test("the ledger writer contacts no provider — every input is already in the repository", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "scripts/nfl/settle-nfl-live-props.mjs"), "utf8");
  assert.equal(/\bfetch\(|https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")), false,
    "a fold over committed evidence must not reach for a provider — that is what lets it run days later for free");
});
