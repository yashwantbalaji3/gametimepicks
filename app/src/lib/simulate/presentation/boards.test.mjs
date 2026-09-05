/**
 * THE THREE BOARD PRESENTATIONS — Program 234 · Release D.
 *
 * Run: npx tsx --test src/lib/simulate/presentation/boards.test.mjs
 *
 * These are the presentations most likely to be recorded and shared, which makes them the ones most
 * able to overstate. Every assertion below is about a way of overstating:
 *
 *   · padding a short board back to a round number;
 *   · showing a combined price without the record it sits in;
 *   · reporting an empty period as 0%;
 *   · averaging rates instead of pooling counts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildTop10Presentation, buildParlayPresentation, buildResultsRecapPresentation } from "./boards.ts";
import { isPresentable } from "./types.ts";

const APP = process.cwd();
const readJson = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")); } catch { return null; } };
const text = (m) => JSON.stringify(m);

const pick = (n) => ({
  game: `Team ${n} v Team ${n + 1}`, market: "Hits", selection: `Player ${n} Over 0.5`,
  odds: -120, modelProbability: 0.61, sport: "mlb", risk: "medium", reason: "r",
});

/* ── Top 10 ─────────────────────────────────────────────────────────────────────────────────── */

test("A SIX-ENTRY BOARD HAS SIX ROWS, and says why it is not ten", () => {
  const m = buildTop10Presentation({ date: "2026-09-05", overall: [1, 2, 3, 4, 5, 6].map(pick), refusedWrongDay: [{ reason: "tomorrow" }, { reason: "tomorrow" }] });
  assert.ok(isPresentable(m));
  const rows = m.chapters.filter((c) => c.kind === "players").flatMap((c) => c.rows);
  assert.equal(rows.length, 6, "no filler picks");
  assert.match(m.chapters[0].line, /fewer than ten/i, "the headline must not claim ten");
  assert.match(text(m), /dropped because the event does not fall on/i, "and the refusals are explained");
});

test("a full board says ten and needs no excuse", () => {
  const m = buildTop10Presentation({ date: "2026-09-05", overall: Array.from({ length: 10 }, (_, i) => pick(i)) });
  assert.ok(isPresentable(m));
  assert.doesNotMatch(m.chapters[0].line, /fewer than ten/i);
  assert.equal(m.chapters.filter((c) => c.kind === "players").flatMap((c) => c.rows).length, 10);
});

test("dense boards SPLIT INTO CHAPTERS rather than squeezing rows", () => {
  const m = buildTop10Presentation({ date: "2026-09-05", overall: Array.from({ length: 10 }, (_, i) => pick(i)) });
  if (!isPresentable(m)) return;
  const pickChapters = m.chapters.filter((c) => c.kind === "players");
  assert.ok(pickChapters.length >= 2, "ten rows in one frame would have to be shrunk to fit");
  for (const c of pickChapters) assert.ok(c.rows.length <= 5, `${c.id} carries ${c.rows.length} rows`);
});

test("an empty board refuses rather than presenting nothing", () => {
  const m = buildTop10Presentation({ date: "2026-09-05", overall: [] });
  assert.ok(!isPresentable(m));
  assert.match(m.reason, /short board is a result/i);
});

/* ── parlay ─────────────────────────────────────────────────────────────────────────────────── */

const CARD = {
  tier: "medium", tierLabel: "Medium risk", slipId: "slip_x", combinedAmerican: 186, status: "pending",
  legs: [
    { player: "A", team: "WSH", opponent: "LAD", marketLabel: "Hits", side: "Over", line: 0.5, odds: -118, result: null },
    { player: "B", team: "CIN", opponent: "MIL", marketLabel: "Hits", side: "Over", line: 0.5, odds: -183, result: null },
  ],
  tierRecord: { wins: 63, losses: 285, hitRate: 0.181, roi: -0.0398 },
};

test("THE COMBINED PRICE NEVER APPEARS WITHOUT THE TIER'S RECORD", () => {
  const m = buildParlayPresentation(CARD);
  assert.ok(isPresentable(m));
  assert.match(text(m), /\+186/, "the price is shown");
  assert.match(text(m), /63-285/, "and so is the record it sits in");
  assert.match(text(m), /hit rate 18%/, "with its hit rate");
  assert.match(text(m), /348 settled cards/, "and its denominator");
});

test("a pending card is never framed as a result, and correlation is disclosed", () => {
  const m = buildParlayPresentation(CARD);
  if (!isPresentable(m)) return;
  assert.match(text(m), /pending/i);
  assert.match(text(m), /not independent events/i, "a combined price is not a validated joint probability");
  assert.match(text(m), /publishes nothing/i, "the frame creates no slip");
});

test("a tier with nothing settled says so instead of showing a zero", () => {
  const m = buildParlayPresentation({ ...CARD, tierRecord: { wins: 0, losses: 0, hitRate: 0 } });
  if (!isPresentable(m)) return;
  assert.match(text(m), /no card in this tier has settled/i);
  assert.doesNotMatch(text(m), /0% hit rate/i, "zero settled is not a 0% hit rate");
});

test("no card means a refusal, never an invented one", () => {
  assert.ok(!isPresentable(buildParlayPresentation(null)));
  assert.match(buildParlayPresentation({ tier: "low", slipId: "x", legs: [] }).reason, /none is created here/i);
});

/* ── recap ──────────────────────────────────────────────────────────────────────────────────── */

test("ZERO DECISIVE OUTCOMES READS UNAVAILABLE, NEVER 0%", () => {
  const m = buildResultsRecapPresentation(
    [{ recordType: "model-pick", sport: "mlb", tier: null, wins: 0, losses: 0, pending: 12 }],
    { period: "last 7 days", population: "Model picks" },
  );
  assert.ok(isPresentable(m));
  const outcome = m.chapters.find((c) => c.kind === "outcome");
  assert.match(outcome.line, /unavailable, not zero/i);
  assert.equal(outcome.bars.length, 0, "there is no bar to draw for a rate that does not exist");
  assert.doesNotMatch(text(m), /"value":0,"format":"probability"/, "no 0% hit rate is emitted");
});

test("THE POOLED RATE IS SUMMED COUNTS, NOT AVERAGED RATES", () => {
  /* 9-1 and 1-9 average to 50% and pool to 50% — a fixture where the two methods agree proves
     nothing, so these are chosen to disagree: rates average to 50%, counts pool to 10%. */
  const m = buildResultsRecapPresentation(
    [
      { recordType: "model-pick", sport: "mlb", tier: null, wins: 1, losses: 9 },
      { recordType: "model-pick", sport: "nfl", tier: null, wins: 9, losses: 81 },
    ],
    { period: "last 30 days", population: "Model picks" },
  );
  assert.ok(isPresentable(m));
  const hit = m.chapters.find((c) => c.kind === "outcome").stats.find((s) => s.label === "Hit rate");
  const averaged = (1 / 10 + 9 / 90) / 2;
  assert.equal(hit.value, 10 / 100, "pooled from summed counts");
  assert.notEqual(Math.round(hit.value * 1000), Math.round(averaged * 1000) + 1, "sanity: the fixture is meaningful");
});

test("the recap always carries its period, population and denominator", () => {
  const m = buildResultsRecapPresentation(
    [{ recordType: "suggested-parlay", sport: "ufc", tier: "medium", wins: 3, losses: 7, pending: 2, pushes: 1 }],
    { period: "last 7 days", population: "Suggested parlays" },
  );
  assert.ok(isPresentable(m));
  assert.match(text(m), /last 7 days/);
  assert.match(text(m), /Suggested parlays/);
  assert.match(text(m), /10 decided outcomes/, "the denominator is stated");
  assert.match(text(m), /2 outcomes have not settled/, "pending is reported, not dropped silently");
  assert.match(text(m), /1 push/, "pushes are neither wins nor losses");
});

test("an empty period is an empty period, not a losing one", () => {
  const m = buildResultsRecapPresentation([], { period: "yesterday", population: "Model picks" });
  assert.ok(!isPresentable(m));
  assert.match(m.reason, /not the same as a losing one/i);
});

/* ── against the real committed artifacts ───────────────────────────────────────────────────── */

test("LIVE · the committed risk-ladder card presents without inventing anything", () => {
  const ladder = readJson("public/data/parlays/risk-ladder/latest.json");
  if (!ladder?.cards?.length) return;
  const m = buildParlayPresentation(ladder.cards[0], { date: ladder.date });
  assert.ok(isPresentable(m), `refused: ${!isPresentable(m) ? m.reason : ""}`);
  const legs = m.chapters.find((c) => c.kind === "players").rows;
  const src = ladder.cards[0].legs.slice(0, 5);
  legs.forEach((r, i) => assert.equal(r.label, src[i].player, "each leg is the published leg"));
  assert.equal(m.provenance.runCount, null, "a parlay card is not a simulation and claims no runs");
});

test("A TOTAL AND ITS OWN PARTS ARE REFUSED, not silently double-counted", () => {
  /*
   * The live defect: `/results` handed the recap every suggested-parlay row, which is one
   * whole-stream row per sport PLUS one row per tier within it. The frame read "14-70 across 84
   * decided" beside a page showing "7-35 · 42 decisive" — exactly double, and plausible enough to
   * ship.
   */
  const m = buildResultsRecapPresentation(
    [
      { recordType: "suggested-parlay", sport: "mlb", tier: null, wins: 7, losses: 35 },
      { recordType: "suggested-parlay", sport: "mlb", tier: "medium", wins: 3, losses: 15 },
      { recordType: "suggested-parlay", sport: "mlb", tier: "high", wins: 4, losses: 20 },
    ],
    { period: "all", population: "Suggested parlays" },
  );
  assert.ok(!isPresentable(m), "pooling a stream total with its own tiers must refuse");
  assert.match(m.reason, /count every settled card twice/i);
});

test("one granularity pools correctly", () => {
  const whole = buildResultsRecapPresentation(
    [
      { recordType: "suggested-parlay", sport: "mlb", tier: null, wins: 7, losses: 35 },
      { recordType: "suggested-parlay", sport: "ufc", tier: null, wins: 0, losses: 1 },
    ],
    { period: "all", population: "Suggested parlays" },
  );
  assert.ok(isPresentable(whole));
  assert.match(whole.chapters.find((c) => c.kind === "outcome").line, /7-36 across 43 decided/);

  const tiers = buildResultsRecapPresentation(
    [
      { recordType: "suggested-parlay", sport: "mlb", tier: "medium", wins: 3, losses: 15 },
      { recordType: "suggested-parlay", sport: "mlb", tier: "high", wins: 4, losses: 20 },
    ],
    { period: "all", population: "Medium and high tier" },
  );
  assert.ok(isPresentable(tiers));
  assert.match(tiers.chapters.find((c) => c.kind === "outcome").line, /7-35 across 42 decided/);
});
