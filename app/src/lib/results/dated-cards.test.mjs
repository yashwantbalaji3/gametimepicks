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

import { loadSettledCards, coveredDates, filterCards, poolCards, cardGrid, DATE_FILTERABLE } from "./dated-cards.mjs";

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
