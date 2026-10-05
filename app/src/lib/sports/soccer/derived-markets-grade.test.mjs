/**
 * Block A — accepted-league derived markets (Ligue 1 over 2.5, both teams to score, likeliest score). The forecast
 * graded must be the SAME one the 1X2 owner graded, the markets must have been public then, and the outcome is read
 * from the owner's final score. Each mutation probe has a no-mutation control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { LEAGUE_DERIVED_PUBLIC_SINCE, gradeLeagueDerived, leagueDerivedForecast, locateLeagueForecast } from "./derived-markets-grade.mjs";
import { ligue1DerivedRows } from "../../forecast-ledger/adapters/soccer.mjs";
import { validateRow } from "../../forecast-ledger/contract.mjs";

const probs = { home: 0.467716, draw: 0.240911, away: 0.291373 };
const fcRow = (over = {}) => ({
  eventId: "soccer:ligue-1:1", kickoffUtc: "2026-09-20T18:45:00.000Z", forecastAt: "2026-09-20T14:00:00Z", modelId: "m1", probs,
  over25: 0.56, btts: { yes: 0.58, no: 0.42 }, topScorelines: [{ score: "1-1", p: 0.11 }, { score: "1-0", p: 0.1 }], ...over,
});
const graded = (over = {}) => ({
  eventId: "soccer:ligue-1:1", matchup: "Rennes v Marseille", homeClub: "Rennes", awayClub: "Marseille",
  kickoffUtc: "2026-09-20T18:45:00.000Z", forecastAt: "2026-09-20T14:00:00Z", probs, final: { home: 1, away: 1 }, result: "D", ...over,
});
const arch = (rows, source = "forecasts/2026-09-20.json") => ({ source, rows });

test("locate: same event, same forecastAt, 1X2 identical to the digit", () => {
  assert.equal(locateLeagueForecast(graded(), [arch([fcRow()])]).source, "forecasts/2026-09-20.json");
});

test("probe: another revision is never the forecast of record (control locates)", () => {
  assert.ok(locateLeagueForecast(graded(), [arch([fcRow()])]), "control");
  assert.equal(locateLeagueForecast(graded(), [arch([fcRow({ forecastAt: "2026-09-20T13:00:00Z" })])]), null);
  assert.equal(locateLeagueForecast(graded(), [arch([fcRow({ probs: { ...probs, home: 0.467717 } })])]), null);
  assert.equal(locateLeagueForecast(graded(), [arch([fcRow({ eventId: "soccer:ligue-1:2" })])]), null);
});

test("grade: outcomes come from the owner's final; the likeliest score is the table's FIRST score, as the page prints it", () => {
  const loc = { row: fcRow(), source: "s" };
  assert.deepEqual(gradeLeagueDerived(graded(), loc, "ligue-1").row.outcomes, { over25: false, btts: true, likeliestScoreHit: true });
  const { row } = gradeLeagueDerived(graded({ final: { home: 3, away: 0 } }), loc, "ligue-1");
  assert.deepEqual(row.outcomes, { over25: true, btts: false, likeliestScoreHit: false });
  assert.deepEqual(row.forecast.likeliestScore, { score: "1-1", p: 0.11 });
  assert.equal(row.final.score, "3-0");
});

test("probe: refusals — no final, post-kickoff, before the page showed them, unrecovered, fields missing (control grades)", () => {
  const loc = { row: fcRow(), source: "s" };
  assert.ok(gradeLeagueDerived(graded(), loc, "ligue-1").row, "control");
  assert.equal(gradeLeagueDerived(graded({ final: { home: null, away: 1 } }), loc, "ligue-1").refused, "NO_FINAL_SCORE");
  assert.equal(gradeLeagueDerived(graded({ forecastAt: "2026-09-20T18:45:00.000Z" }), loc, "ligue-1").refused, "FORECAST_NOT_PRE_KICKOFF");
  const before = new Date(Date.parse(LEAGUE_DERIVED_PUBLIC_SINCE["ligue-1"]) - 60_000).toISOString();
  assert.equal(gradeLeagueDerived(graded({ forecastAt: before }), loc, "ligue-1").refused, "NOT_PUBLIC_AT_FORECAST_TIME");
  assert.equal(gradeLeagueDerived(graded(), loc, "serie-a").refused, "NOT_PUBLIC_AT_FORECAST_TIME", "a league with no public page has no public claim");
  assert.equal(gradeLeagueDerived(graded(), null, "ligue-1").refused, "FORECAST_OF_RECORD_UNRECOVERED");
  assert.equal(leagueDerivedForecast(fcRow({ btts: null })).reason, "DERIVED_FIELDS_ABSENT");
  assert.equal(leagueDerivedForecast(fcRow({ topScorelines: [] })).reason, "DERIVED_FIELDS_ABSENT");
});

test("ledger rows: three BINARY rows on the match, all valid; a miss on the score keeps the real final", () => {
  const { row } = gradeLeagueDerived(graded({ final: { home: 2, away: 2 } }), { row: fcRow(), source: "forecasts/2026-09-20.json" }, "ligue-1");
  const rows = ligue1DerivedRows([row]);
  assert.deepEqual(rows.map((r) => r.family).sort(), ["ligue1_btts", "ligue1_likeliest_score", "ligue1_over_2_5"]);
  for (const r of rows) {
    assert.deepEqual(validateRow({ ...r, provenance: { owner: "t", alsoPublishedOn: [], notes: [] } }), []);
    assert.equal(r.subjectId, "soccer:ligue-1:1");
    assert.equal(r.publishedAt, "2026-09-20T14:00:00Z");
  }
  const by = Object.fromEntries(rows.map((r) => [r.family, r]));
  assert.equal(by.ligue1_over_2_5.measurement.observed, 1);
  assert.equal(by.ligue1_btts.measurement.observed, 1);
  assert.equal(by.ligue1_likeliest_score.probability, 0.11);
  assert.equal(by.ligue1_likeliest_score.measurement.observed, 0);
  assert.equal(by.ligue1_likeliest_score.settlement.finalCategory, "2-2");
});

test("probe: a match with no final stays PENDING with no score — never a miss (control settles)", () => {
  const { row } = gradeLeagueDerived(graded(), { row: fcRow(), source: "s" }, "ligue-1");
  assert.ok(ligue1DerivedRows([row]).every((r) => r.settlement.state === "SETTLED"), "control");
  const pending = ligue1DerivedRows([{ ...row, final: { home: null, away: null } }]);
  assert.ok(pending.every((r) => r.settlement.state === "PENDING" && r.measurement.brier == null));
});

test("committed owner log: one row per graded match, same forecastAt and final as the 1X2 owner, after the page went public", () => {
  const dir = path.join(process.cwd(), "public/data/soccer/ligue-1/results");
  const p = path.join(dir, "graded-derived-markets.jsonl");
  if (!fs.existsSync(p)) return;
  const owner = new Map(JSON.parse(fs.readFileSync(path.join(dir, "graded.json"), "utf8")).matches.map((m) => [m.eventId, m]));
  const rows = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  assert.equal(new Set(rows.map((r) => r.eventId)).size, rows.length, "one row per match");
  for (const r of rows) {
    const o = owner.get(r.eventId);
    assert.ok(o, `${r.eventId} is graded by the 1X2 owner`);
    assert.equal(r.forecastAt, o.forecastAt);
    assert.deepEqual([r.final.home, r.final.away], [o.final.home, o.final.away]);
    assert.ok(Date.parse(r.forecastAt) >= Date.parse(LEAGUE_DERIVED_PUBLIC_SINCE["ligue-1"]));
    assert.ok(Date.parse(r.forecastAt) < Date.parse(r.kickoffUtc));
  }
});
