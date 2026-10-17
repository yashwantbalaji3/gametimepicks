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

test("2026-10-17 · the archive fallback is the most RECENT reports first, capped at ARCHIVE_CAP — never August preseason by coverage", async () => {
  const { ARCHIVE_CAP, FEATURED_CAP } = await import("./simulate-lobby-featured.ts");
  assert.ok(ARCHIVE_CAP < FEATURED_CAP);
  // Five August games with MANY picks, two recent ones with few — the 3 AM Saturday shape.
  const details = [
    mlbReady("aug-a-2026-08-15", "2026-08-15", 40), mlbReady("aug-b-2026-08-20", "2026-08-20", 38),
    mlbReady("aug-c-2026-08-23", "2026-08-23", 36), mlbReady("aug-d-2026-08-28", "2026-08-28", 35),
    mlbReady("recent-a-2026-10-15", "2026-10-15", 3), mlbReady("recent-b-2026-10-16", "2026-10-16", 2),
  ];
  const r = featuredSimulations(details, "2026-10-17");
  assert.equal(r.allCurrent, false);
  assert.equal(r.featured.length, ARCHIVE_CAP);
  assert.deepEqual(r.featured.map((f) => f.date), ["2026-10-16", "2026-10-15"], "most recent first, regardless of pick count");
  assert.equal(r.readyCount, 6, "the honest total is still reported");
  // A current slate keeps the full cap and soonest-first order.
  const cur = featuredSimulations([...details, mlbReady("today-2026-10-17", "2026-10-17", 1)], "2026-10-17");
  assert.equal(cur.allCurrent, true);
  assert.deepEqual(cur.featured.map((f) => f.date), ["2026-10-17"]);
});
