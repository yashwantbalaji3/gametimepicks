/**
 * Tests for alternate-lines pure helpers (no network; not wired live).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  americanToImplied,
  deVigAlternateLine,
  validateAlternateLineRecord,
  classifyAlternateLineCompleteness,
  groupAlternateLinesByPlayerMarket,
  classifyVsMainLine,
} from "./alternate-lines.ts";

test("americanToImplied handles favorites, underdogs, invalid", () => {
  assert.ok(Math.abs(americanToImplied(-200) - 0.6667) < 0.001);
  assert.ok(Math.abs(americanToImplied(150) - 0.4) < 0.001);
  assert.equal(americanToImplied(0), null);
  assert.equal(americanToImplied(null), null);
  assert.equal(americanToImplied(NaN), null);
});

test("deVigAlternateLine normalizes two-way to sum 1", () => {
  const d = deVigAlternateLine(-200, 150);
  assert.ok(d);
  assert.ok(Math.abs(d.devigOver + d.devigUnder - 1) < 1e-9);
  assert.ok(d.devigOver > d.devigUnder); // -200 favorite
});

test("deVigAlternateLine returns null when one-sided", () => {
  assert.equal(deVigAlternateLine(-200, null), null);
  assert.equal(deVigAlternateLine(null, 150), null);
});

const rec = (o) => ({
  sport: "mlb", date: "2026-06-04", gameId: "g1", playerId: 123,
  market: "batter_hits", mainLine: 0.5, alternateLine: 1.5,
  overOdds: 120, underOdds: -150, provider: "draftkings", asOf: "2026-06-04T00:00:00Z", ...o,
});

test("validateAlternateLineRecord passes a complete record", () => {
  const r = validateAlternateLineRecord(rec());
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("validateAlternateLineRecord flags missing fields", () => {
  assert.equal(validateAlternateLineRecord(null).valid, false);
  assert.equal(validateAlternateLineRecord(rec({ playerId: null })).valid, false);
  assert.equal(validateAlternateLineRecord(rec({ alternateLine: "x" })).valid, false);
  const noOdds = validateAlternateLineRecord(rec({ overOdds: null, underOdds: null }));
  assert.equal(noOdds.valid, false);
  assert.ok(noOdds.errors.some((e) => /odds/.test(e)));
});

test("classifyAlternateLineCompleteness: complete / partial / missing", () => {
  assert.equal(classifyAlternateLineCompleteness(rec()), "complete");
  assert.equal(classifyAlternateLineCompleteness(rec({ underOdds: null })), "partial");
  assert.equal(classifyAlternateLineCompleteness(rec({ overOdds: null, underOdds: null })), "missing");
  assert.equal(classifyAlternateLineCompleteness(null), "missing");
});

test("groupAlternateLinesByPlayerMarket builds sorted ladders", () => {
  const recs = [
    rec({ alternateLine: 2.5 }),
    rec({ alternateLine: 0.5 }),
    rec({ alternateLine: 1.5 }),
    rec({ playerId: 999, alternateLine: 1.5 }),
  ];
  const g = groupAlternateLinesByPlayerMarket(recs);
  assert.equal(Object.keys(g).length, 2);
  assert.deepEqual(g["123|batter_hits"].map((r) => r.alternateLine), [0.5, 1.5, 2.5]);
  assert.equal(g["999|batter_hits"].length, 1);
});

test("classifyVsMainLine: lower / same / higher / unknown", () => {
  assert.equal(classifyVsMainLine(0.5, 1.5), "lower");
  assert.equal(classifyVsMainLine(2.5, 1.5), "higher");
  assert.equal(classifyVsMainLine(1.5, 1.5), "same");
  assert.equal(classifyVsMainLine(1.5, null), "unknown");
  assert.equal(classifyVsMainLine(1.5, undefined), "unknown");
});

test("group skips records without playerId/market; deterministic", () => {
  const g = groupAlternateLinesByPlayerMarket([rec({ playerId: null }), rec()]);
  assert.equal(Object.keys(g).length, 1);
  const g2 = groupAlternateLinesByPlayerMarket([rec({ playerId: null }), rec()]);
  assert.deepEqual(g, g2);
});
