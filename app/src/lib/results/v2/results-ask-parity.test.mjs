/**
 * Session 3 · Phase B — RESULTS ↔ ASK PARITY. "How did GameTimePicks do yesterday?" must say exactly what
 * /results/date/<d>/ shows: the same lanes with the same words, the same games with the same grades, the same pending.
 *
 * Ask's daily `results.json` is built from the same two owners the day page renders (productReceiptsFor, resultsDay) —
 * this pins that it STAYS so: every day Ask ships is compared, field by field, with what the page reads today.
 * Post-build: the Ask results asset is a daily build artifact (not committed).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { productReceiptsFor } from "./product-receipts.ts";
import { resultsDay } from "./day.ts";
import { resultsV2Populations } from "./overview.ts";
import { population } from "./populations.mjs";
import { currentEtDate } from "../../freshness.ts";
import { makeGradedPickOwners } from "../../sports/graded-pick-owners.mjs";
import { ASK_SPORT_RECORD_POPULATION, sportRecordCell } from "../../ask/results-sport-record.mjs";

const ASSET = path.join(process.cwd(), "public/data/ask/v1/results.json");

test("🔴 every results day Ask ships matches the Results day page's owners — lanes, legs, games and grades", (t) => {
  if (!fs.existsSync(ASSET)) return t.skip("post-build: public/data/ask/v1/results.json is emitted by the build");
  const doc = JSON.parse(fs.readFileSync(ASSET, "utf8"));
  assert.ok(Array.isArray(doc.days) && doc.days.length > 0, "Ask ships at least one results day");
  for (const d of doc.days) {
    const page = productReceiptsFor(d.date);
    assert.deepEqual(
      d.lanes.map((l) => [l.product, l.lane, l.result, l.legs.map((g) => [g.selection, g.official, g.result])]),
      (page?.lanes ?? []).map((l) => [l.product, l.lane, l.result, l.legs.map((g) => [g.selection, g.official, g.result])]),
      `${d.date}: Ask's lanes differ from the day page's`,
    );
    const day = resultsDay(d.date);
    for (const [sport, evs] of Object.entries(day)) {
      assert.deepEqual(
        (d.events?.[sport] ?? []).map((e) => [e.title, e.final, e.calls.map((c) => [c.market, c.pick, c.outcome ?? null])]),
        evs.map((e) => [e.title, e.final, e.calls.map((c) => [c.market, c.pick, c.outcome ?? null])]),
        `${d.date} ${sport}: Ask's graded calls differ from the day page's`,
      );
    }
  }
});

/*
 * D-1 (Production integrity audit, 2026-10-18). Ask's per-sport headline was the results projection's `graded-picks`
 * cell — a snapshot only the nightly settle rewrites — while /results' Season and All windows read the graded ledger
 * through resultsV2Populations. Newcastle v Aston Villa, graded by the EPL matchweek refresh at 22:49Z after the
 * 18:01Z settle, put /results at 27–34 and Ask at 27–33. The record Ask ships must BE the Results page's.
 */
const RECORD_POPULATION = { epl: "epl-matches", ufc: "ufc-fights" };

test("D-1: Ask derives each sport's forecast record from the population /results renders", () => {
  assert.deepEqual({ ...ASK_SPORT_RECORD_POPULATION }, RECORD_POPULATION, "the sport → population map is the one this test pins");
  const stale = {
    cellId: "forecast:epl:-:LIVE_LEDGER:graded-picks", recordType: "FORECAST_RECORD", era: "LIVE_LEDGER",
    counts: { won: 27, lost: 33, pending: 0, push: null, void: 0 }, decisive: 60, n: 60, hitRate: 0.45,
    ownerState: "EMERGING", asOf: "2026-10-17T18:01:05Z", displayEligible: { eligible: true },
  };
  const rows = [
    ...Array.from({ length: 27 }, (_, i) => ({ date: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, outcome: "WIN" })),
    ...Array.from({ length: 33 }, (_, i) => ({ date: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, outcome: "LOSS" })),
    { date: "2026-10-17", outcome: "LOSS" }, // graded at 22:49Z, after the settle wrote graded-picks.json
  ];
  const pop = population({ id: "epl-matches", sport: "epl", label: "EPL", klass: "PUBLIC", kind: "MATCH", owner: "x", seasonStart: "2026-08-01", rows, today: "2026-10-18" });
  const cell = sportRecordCell(stale, pop);
  assert.deepEqual(
    [cell.counts.won, cell.counts.lost, cell.counts.void],
    [pop.windows.all.won, pop.windows.all.lost, pop.windows.all.void],
    "Ask's record is the population's All window",
  );
  assert.deepEqual([cell.counts.won, cell.counts.lost], [27, 34]);
  assert.deepEqual([pop.windows.season.won, pop.windows.season.lost], [27, 34], "and the Season window /results shows");
  assert.equal(cell.counts.pending, null, "a graded ledger carries no pending count — null, never 0");
  assert.equal(cell.decisive, 61);
  assert.equal(cell.hitRate, Number((27 / 61).toFixed(4)));
  assert.equal(cell.asOf, "2026-10-17", "as of the newest graded day, not the stale snapshot's stamp");
  assert.equal(cell.cellId, stale.cellId, "the headline map still resolves to the same cell");
  assert.deepEqual(cell.displayEligible, stale.displayEligible, "eligibility stays the projection owner's decision");
  assert.equal(sportRecordCell(stale, null), stale, "no population → the projection cell, unchanged");
});

test("🔴 D-1: the forecast record Ask ships for EPL and UFC equals the Results page's All window", (t) => {
  if (!fs.existsSync(ASSET)) return t.skip("post-build: public/data/ask/v1/results.json is emitted by the build");
  const doc = JSON.parse(fs.readFileSync(ASSET, "utf8"));
  const pops = resultsV2Populations(currentEtDate());
  for (const [sport, id] of Object.entries(RECORD_POPULATION)) {
    const pop = pops.find((p) => p.id === id);
    if (!pop) continue; // no ledger on disk → /results shows no record either
    const cell = (doc.cells ?? []).find((c) => c.cellId === doc.headline?.bySport?.[sport]);
    assert.ok(cell, `${sport}: Ask ships a headline record`);
    const all = pop.windows.all;
    assert.deepEqual(
      [cell.counts?.won, cell.counts?.lost, cell.counts?.void ?? 0],
      [all.won, all.lost, all.void],
      `${sport}: Ask says ${cell.counts?.won}–${cell.counts?.lost}, /results' All window says ${all.won}–${all.lost}`,
    );
  }
});

test("🔴 D-1: Ask's recent graded feed counts the same ledger /results reads (EPL, UFC, NFL)", (t) => {
  if (!fs.existsSync(ASSET)) return t.skip("post-build: public/data/ask/v1/results.json is emitted by the build");
  const doc = JSON.parse(fs.readFileSync(ASSET, "utf8"));
  const owners = makeGradedPickOwners({ appDir: process.cwd(), rootDir: path.resolve(process.cwd(), "..") });
  for (const [sport, read] of [["epl", owners.eplPicks], ["ufc", owners.ufcPicks], ["nfl", owners.nflPicks]]) {
    const rows = read();
    if (!rows) continue;
    assert.equal(doc.recent?.[sport]?.total, rows.length, `${sport}: Ask's feed total is the ledger's true count`);
  }
});
