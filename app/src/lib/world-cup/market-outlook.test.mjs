import { test } from "node:test";
import assert from "node:assert/strict";
import { outlookForMatch } from "./market-outlook.ts";

const outlook = {
  generatedAt: "x", date: "2026-06-11", source: "the_odds_api", disclaimer: "x",
  matchCount: 2, readyCount: 2,
  matches: [
    { oddsEventId: "1", homeTeam: "Mexico", awayTeam: "South Africa", commenceTime: "2026-06-11T19:00:00Z", status: "ready",
      result: { homeOdds: -235, drawOdds: 340, awayOdds: 750, homeWinPct: 0.67, drawPct: 0.21, awayWinPct: 0.11, bookmaker: "draftkings", market: "90min_result_3way" } },
    { oddsEventId: "2", homeTeam: "South Korea", awayTeam: "Czech Republic", commenceTime: "2026-06-12T02:00:00Z", status: "ready",
      result: { homeOdds: 175, drawOdds: 210, awayOdds: 180, homeWinPct: 0.34, drawPct: 0.30, awayWinPct: 0.34, bookmaker: "draftkings", market: "90min_result_3way" } },
  ],
};

test("matches by exact team pair", () => {
  const m = outlookForMatch("Mexico", "South Africa", outlook);
  assert.equal(m?.oddsEventId, "1");
  assert.equal(m?.result?.drawOdds, 340);
});

test("matches alias Czechia <-> Czech Republic", () => {
  const m = outlookForMatch("South Korea", "Czechia", outlook);
  assert.equal(m?.oddsEventId, "2", "Czechia must alias-match Czech Republic");
});

test("matches regardless of home/away order", () => {
  const m = outlookForMatch("South Africa", "Mexico", outlook);
  assert.equal(m?.oddsEventId, "1");
});

test("returns null for unknown match (fail closed)", () => {
  assert.equal(outlookForMatch("Brazil", "Argentina", outlook), null);
  assert.equal(outlookForMatch("Mexico", "South Africa", null), null);
});

test("normTeamName aliases Czechia <-> Czech Republic", async () => {
  const { normTeamName } = await import("./market-outlook.ts");
  assert.equal(normTeamName("Czechia"), normTeamName("Czech Republic"));
  assert.equal(normTeamName("USA"), normTeamName("United States"));
});

test("upcomingReadyOutlook: ready-only, after cutoff, sorted, capped", async () => {
  const { upcomingReadyOutlook } = await import("./market-outlook.ts");
  const ol = {
    generatedAt: "x", date: "2026-06-11", source: "the_odds_api", disclaimer: "x",
    matchCount: 3, readyCount: 2,
    matches: [
      { oddsEventId: "a", homeTeam: "A", awayTeam: "B", commenceTime: "2026-06-13T19:00:00Z", status: "ready", result: {} },
      { oddsEventId: "b", homeTeam: "C", awayTeam: "D", commenceTime: "2026-06-12T19:00:00Z", status: "ready", result: {} },
      { oddsEventId: "c", homeTeam: "E", awayTeam: "F", commenceTime: "2026-06-12T20:00:00Z", status: "unavailable_no_odds" },
    ],
  };
  const up = upcomingReadyOutlook(ol, "2026-06-12T00:00:00Z", 5);
  assert.equal(up.length, 2);          // unavailable one excluded
  assert.equal(up[0].oddsEventId, "b"); // sorted by kickoff
  assert.equal(up[1].oddsEventId, "a");
  assert.equal(upcomingReadyOutlook(ol, "2026-06-12T00:00:00Z", 1).length, 1); // capped
  assert.equal(upcomingReadyOutlook(null, "2026-06-12T00:00:00Z", 5).length, 0);
});
