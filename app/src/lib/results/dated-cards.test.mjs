/**
 * DATED CARDS, AND WHAT THEY MAY BE ASKED — Program 234 · Release E.
 *
 * Run: npx tsx --test src/lib/results/dated-cards.test.mjs
 *
 * The load-bearing test is the first one. A date filter is only honest if the rows it filters sum to
 * the record the rest of the site publishes; if they did not, every filtered view would quietly be a
 * different population wearing the same name. So the per-card files are reconciled against
 * `lab-ledger.json` down to the individual tier, and the whole feature rests on that passing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadSettledCards, coveredDates, filterCards, poolCards, cardGrid, dailySeries, DATE_FILTERABLE } from "./dated-cards.mjs";

const APP = process.cwd();
const DATA = path.join(APP, "public", "data");
const cards = loadSettledCards(DATA);
const ledger = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, "parlays", "lab-ledger.json"), "utf8")); } catch { return null; }
})();

test("the dated files exist and are not empty — everything below is vacuous otherwise", () => {
  assert.ok(cards.length > 0, "no settled cards were loaded");
  assert.ok(coveredDates(cards).length >= 2, "a date range needs more than one date to be a range");
});

test("THE PER-CARD ROWS RECONCILE WITH THE PUBLISHED LEDGER, STREAM AND TIER", () => {
  if (!ledger || !cards.length) return;
  for (const stream of ledger.streams ?? []) {
    const mine = cards.filter((c) => c.sport === stream.id);
    const pooled = poolCards(mine);
    assert.equal(pooled.wins, stream.record?.wins ?? 0, `${stream.id} wins: cards say ${pooled.wins}, the ledger says ${stream.record?.wins}`);
    assert.equal(pooled.losses, stream.record?.losses ?? 0, `${stream.id} losses: cards say ${pooled.losses}, the ledger says ${stream.record?.losses}`);
    for (const [tier, rec] of Object.entries(stream.byTier ?? {})) {
      const t = poolCards(mine.filter((c) => c.tier === tier));
      assert.equal(t.wins, rec.wins ?? 0, `${stream.id}/${tier} wins: cards ${t.wins} vs ledger ${rec.wins}`);
      assert.equal(t.losses, rec.losses ?? 0, `${stream.id}/${tier} losses: cards ${t.losses} vs ledger ${rec.losses}`);
    }
  }
});

test("A MIXED-SPORT CARD IS ITS OWN POPULATION, counted once", () => {
  const mixed = cards.filter((c) => c.sports.length > 1);
  for (const c of mixed) assert.equal(c.sport, "multi", `${c.slipId} spans ${c.sports.join("+")} and must not sit inside one sport's record`);
  /* And no card is ever counted under a sport it merely contains. */
  for (const c of cards) {
    if (c.sports.length === 1) assert.equal(c.sport, c.sports[0]);
  }
  const totalByPopulation = new Set(cards.map((c) => c.sport));
  assert.equal(
    cards.length,
    [...totalByPopulation].reduce((a, s) => a + cards.filter((c) => c.sport === s).length, 0),
    "every card belongs to exactly one population",
  );
});

test("a reversed range REFUSES rather than swapping the ends or returning all time", () => {
  const r = filterCards(cards, { from: "2026-09-01", to: "2026-08-01" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /starts after it ends/i);
});

test("a malformed date refuses", () => {
  for (const bad of ["yesterday", "2026-13-01x", "09/01/2026", ""]) {
    const r = filterCards(cards, { from: bad });
    if (bad === "") continue; // empty means "unset", which is a real selection
    assert.equal(r.ok, false, `"${bad}" was accepted`);
  }
});

test("filtering to a date with nothing returns nothing — never the previous view", () => {
  const r = filterCards(cards, { from: "1999-01-01", to: "1999-01-02" });
  assert.equal(r.ok, true);
  assert.equal(r.cards.length, 0);
  const pooled = poolCards(r.cards);
  assert.equal(pooled.hitRate.available, false, "an empty selection has no hit rate");
  assert.equal(pooled.hitRate.value, null, "and certainly not 0%");
});

test("A RANGE COVERING EVERYTHING EQUALS NO RANGE AT ALL", () => {
  const dates = coveredDates(cards);
  const all = filterCards(cards, { from: dates[0], to: dates[dates.length - 1] });
  assert.equal(all.ok, true);
  assert.deepEqual(poolCards(all.cards), poolCards(cards), "the widest range must reproduce the unfiltered record");
});

test("the ends of a range are INCLUSIVE", () => {
  const dates = coveredDates(cards);
  const first = dates[0];
  const onFirst = filterCards(cards, { from: first, to: first });
  assert.equal(onFirst.ok, true);
  assert.equal(onFirst.cards.length, cards.filter((c) => c.date === first).length);
  assert.ok(onFirst.cards.length > 0, "the earliest covered date must contain its own cards");
});

test("DAILY SLICES SUM TO THE WHOLE — no card is dropped or counted twice by the date filter", () => {
  const dates = coveredDates(cards);
  let w = 0, l = 0, n = 0;
  for (const d of dates) {
    const day = filterCards(cards, { from: d, to: d });
    const p = poolCards(day.cards);
    w += p.wins; l += p.losses; n += day.cards.length;
  }
  const whole = poolCards(cards);
  assert.equal(w, whole.wins);
  assert.equal(l, whole.losses);
  assert.equal(n, cards.length);
});

test("the grid's populated cells link to real slips, and empty cells are typed", () => {
  const sports = [...new Set(cards.map((c) => c.sport))];
  const tiers = ["low", "medium", "high", "longshot"];
  const grid = cardGrid(cards, { sports, tiers });
  for (const row of grid) {
    for (const cell of row.cells) {
      assert.equal(cell.slipIds.length, cell.cards, "every card in a cell is reachable by its slip id");
      if (cell.cards === 0) assert.equal(cell.hitRate.available, false, `${row.sport}/${cell.tier} is empty and must not report a rate`);
      for (const id of cell.slipIds) assert.ok(id.length > 0, "a card with no slip id cannot be drilled into");
    }
    /* Row totals are the row's own cards, not the sum of four tier cells — a card with a tier
       outside the canonical four would otherwise vanish from the row total. */
    assert.equal(row.total.cards, cards.filter((c) => c.sport === row.sport).length);
  }
});

test("ONLY POPULATIONS WITH DATED DETAIL ARE DATE-FILTERABLE", () => {
  assert.deepEqual([...DATE_FILTERABLE], ["suggested-parlay"]);
  /* Model picks publish 60 sampled rows against a counted population in the tens of thousands.
     A date control over that would answer a question about the sample and look like an answer
     about the record. */
  const graded = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA, "mlb", "graded-picks.json"), "utf8")); } catch { return null; } })();
  if (graded) {
    assert.ok(
      (graded.picks?.length ?? 0) < (graded.counts?.counted ?? 0),
      "model picks now publish their full history — the date filter may be extended to them, deliberately",
    );
  }
});

test("pending cards are in no decisive denominator", () => {
  const pooled = poolCards(cards);
  assert.equal(pooled.decisive, pooled.wins + pooled.losses);
  assert.ok(pooled.pending >= 0);
  assert.equal(pooled.cards, pooled.wins + pooled.losses + pooled.pushes + pooled.pending, "every card is in exactly one bucket");
});

/* ── trends · Release F ─────────────────────────────────────────────────────────────────────── */

const day = (date, result, tier = "medium", sport = "mlb") => ({
  date, slipId: `${sport}-${tier}-${date}-${result}`, sport, sports: [sport], tier, result,
  decided: result === "win" || result === "loss", won: result === "win", lost: result === "loss",
  pushed: result === "push" || result === "void",
  pending: !["win", "loss", "push", "void"].includes(result),
  combinedDecimal: 2, legs: ["win"], legCount: 1,
});

test("A ZERO-EVENT DAY IS A GAP, NEVER A 0% LOSS", () => {
  const s = dailySeries([day("2026-09-01", "win"), day("2026-09-03", "loss")]);
  assert.equal(s.days.length, 3, "every calendar day in the range is drawn, including the empty one");
  const middle = s.days.find((d) => d.date === "2026-09-02");
  assert.equal(middle.hasData, false);
  assert.equal(middle.rate, null, "a day with no card has no rate — 0% would draw a loss nobody took");
  assert.equal(middle.decisive, 0);
});

test("A DAY OF ONLY PENDING CARDS HAS NO RATE EITHER", () => {
  const s = dailySeries([day("2026-09-01", "pending"), day("2026-09-01", "pending")]);
  const d = s.days[0];
  assert.equal(d.hasData, true, "cards exist");
  assert.equal(d.decisive, 0);
  assert.equal(d.rate, null, "pending outcomes are in no decisive denominator");
  assert.equal(d.pending, 2);
});

test("a day of only pushes has cards, no decisive outcomes, and no rate", () => {
  const s = dailySeries([day("2026-09-01", "push"), day("2026-09-01", "void")]);
  assert.equal(s.days[0].pushes, 2);
  assert.equal(s.days[0].rate, null);
});

test("THE CUMULATIVE RATE IS POOLED FROM SUMS, NOT AVERAGED FROM DAYS", () => {
  /* Day one: 1-0 (100%). Day two: 0-9 (0%). Averaging the daily rates gives 50%; pooling the
     counts gives 10%. A fixture where the two agree would prove nothing. */
  const cards = [day("2026-09-01", "win"), ...Array.from({ length: 9 }, (_, i) => day("2026-09-02", "loss", "medium", "mlb"))]
    .map((c, i) => ({ ...c, slipId: `s${i}` }));
  const s = dailySeries(cards);
  const last = s.cumulative[s.cumulative.length - 1];
  assert.equal(last.wins, 1);
  assert.equal(last.losses, 9);
  assert.equal(last.rate, 1 / 10, "pooled");
  const averaged = (1 + 0) / 2;
  assert.notEqual(last.rate, averaged, "the fixture must distinguish the two methods");
});

test("THE SERIES TOTALS EQUAL THE POOLED HEADLINE — a chart may not disagree with its own number", () => {
  const cards = [
    day("2026-09-01", "win"), day("2026-09-01", "loss"),
    day("2026-09-03", "loss"), day("2026-09-03", "push"), day("2026-09-03", "pending"),
    day("2026-09-05", "win"),
  ].map((c, i) => ({ ...c, slipId: `s${i}` }));
  const s = dailySeries(cards);
  const summed = s.days.reduce((a, d) => ({ w: a.w + d.wins, l: a.l + d.losses, n: a.n + d.cards }), { w: 0, l: 0, n: 0 });
  assert.equal(summed.w, s.pooled.wins);
  assert.equal(summed.l, s.pooled.losses);
  assert.equal(summed.n, cards.length);
  const last = s.cumulative[s.cumulative.length - 1];
  assert.equal(last.wins, s.pooled.wins);
  assert.equal(last.losses, s.pooled.losses);
  assert.equal(last.rate, s.pooled.hitRate.value);
});

test("UNEQUAL DAILY DENOMINATORS weight by count, not by day", () => {
  const cards = [
    day("2026-09-01", "win"),
    ...Array.from({ length: 20 }, () => day("2026-09-02", "loss")),
  ].map((c, i) => ({ ...c, slipId: `s${i}` }));
  const s = dailySeries(cards);
  assert.equal(s.days[0].rate, 1, "a one-card day is 100% on its own");
  assert.equal(s.days[1].rate, 0, "a twenty-card day of losses is 0% on its own");
  assert.equal(s.cumulative[1].rate, 1 / 21, "and the pooled rate is one win in twenty-one, not 50%");
});

test("a one-record cohort reports its single outcome and its sample size of one", () => {
  const s = dailySeries([day("2026-09-01", "loss")]);
  assert.equal(s.days.length, 1);
  assert.equal(s.days[0].rate, 0, "one decided loss genuinely is 0% — of one");
  assert.equal(s.days[0].decisive, 1);
  assert.equal(s.pooled.hitRate.available, true);
  assert.equal(s.pooled.hitRate.decisive, 1);
});

test("an empty cohort produces no series rather than a flat line at zero", () => {
  const s = dailySeries([]);
  assert.deepEqual(s.days, []);
  assert.deepEqual(s.cumulative, []);
  assert.equal(s.pooled.hitRate.available, false);
});

test("EXPLICIT BOUNDS DRAW THE EMPTY TAIL — a period with nothing recent must show that", () => {
  const s = dailySeries([day("2026-09-01", "win")], { from: "2026-09-01", to: "2026-09-05" });
  assert.equal(s.days.length, 5);
  assert.equal(s.days.filter((d) => d.hasData).length, 1);
  assert.equal(s.days[4].rate, null, "the last four days are empty and must read as empty");
  /* The cumulative line holds its value across the gap rather than falling — nothing happened. */
  assert.equal(s.cumulative[4].rate, 1);
  assert.equal(s.cumulative[4].decisive, 1);
});

test("LIVE · the daily series over the committed cards reconciles with the whole", () => {
  if (!cards.length) return;
  const s = dailySeries(cards);
  const summed = s.days.reduce((a, d) => ({ w: a.w + d.wins, l: a.l + d.losses }), { w: 0, l: 0 });
  const whole = poolCards(cards);
  assert.equal(summed.w, whole.wins);
  assert.equal(summed.l, whole.losses);
  assert.ok(s.days.some((d) => !d.hasData), "the committed range contains days with no settled card, and they must be drawn as gaps");
});
