/**
 * Featured-simulations FRESHNESS (July-14 rescue): the featured row must not lead with a stale slate once
 * the ET clock has moved past it, and World Cup market-implied games must be featurable (not just MLB 10k
 * sims). Honest: WC cards carry no run-count claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { featuredSimulations } from "./simulate-lobby-featured.ts";

const mlbReady = (slug, date, edge) => ({
  sport: "mlb", slug, date,
  gameLabSimulation: { status: "ready", teams: { home: "HOME", away: "AWAY" }, runCount: 10000, allowsRunCountClaim: true, generatedPicks: [{ edgePct: edge }], simulationSummary: null },
});
const wcReport = (slug, date, home, away) => ({
  sport: "world_cup", slug, date, homeTeam: home, awayTeam: away, wcGameCenter: {}, gameLabSimulation: null,
});

test("stale slate is dropped once a current/upcoming game exists (July-11 MLB not featured on July-14)", () => {
  const details = [mlbReady("aaa-2026-07-11", "2026-07-11", 9), wcReport("france-vs-spain-2026-07-14", "2026-07-14", "France", "Spain")];
  const r = featuredSimulations(details, "2026-07-14");
  assert.equal(r.allCurrent, true, "the current slate is featured");
  assert.ok(!r.featured.some((f) => f.slug.includes("2026-07-11")), "stale July-11 MLB is NOT featured");
  assert.ok(r.featured.some((f) => f.slug.startsWith("france-vs-spain")), "the current WC semifinal IS featured");
});

test("World Cup market-implied games are featurable + labelled honestly (no run-count claim)", () => {
  const details = [wcReport("france-vs-spain-2026-07-14", "2026-07-14", "France", "Spain"), wcReport("england-vs-argentina-2026-07-14", "2026-07-14", "England", "Argentina")];
  const r = featuredSimulations(details, "2026-07-14");
  assert.equal(r.featured.length, 2, "both WC semifinals featured");
  for (const f of r.featured) {
    assert.equal(f.mode, "market-implied", "WC card is market-implied, not a run sim");
    assert.equal(f.runCountLabel, null, "no run-count claim for a WC card");
    assert.equal(f.sport, "world_cup");
  }
});

test("no current/upcoming game → falls back to the most-recent slate (allCurrent false)", () => {
  const details = [mlbReady("aaa-2026-07-11", "2026-07-11", 9)];
  const r = featuredSimulations(details, "2026-07-14");
  assert.equal(r.allCurrent, false, "stale fallback is flagged, not presented as current");
  assert.equal(r.featured.length, 1, "the latest-available game still shows (row not empty)");
});

test("a WC game with NO report (no wcGameCenter/gameLabWc) is not featured (never fabricated)", () => {
  const details = [{ sport: "world_cup", slug: "x-2026-07-14", date: "2026-07-14", homeTeam: "X", awayTeam: "Y" }];
  const r = featuredSimulations(details, "2026-07-14");
  assert.equal(r.featured.length, 0, "no report ⇒ not featurable");
});
