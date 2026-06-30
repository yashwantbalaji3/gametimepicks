/**
 * Daily Structured Specials — "2 legs from each game", four reliability tiers. Synthetic fixtures only
 * (no real results, never written to any ledger). Pins the product rules the redesign promised:
 *   • two legs from EACH game where the game can supply them,
 *   • the Reliable tier is team-markets-only (no player props — audit: WC props hit ~8%),
 *   • no contradictory / duplicate legs inside a card,
 *   • every card carries a tier, per-game grouping, correlation read and a "why it can fail".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyStructuredSpecials } from "./world-cup-specials.ts";

let _id = 0;
const leg = (fixture, eventId, kind, market, marketLabel, odds, prob, side = null, player = null) => ({
  legId: `t:${eventId}:${market}:${side ?? player ?? _id++}`,
  kind, sport: "WORLD_CUP", fixture, eventId,
  participant: player ?? (side ?? marketLabel), team: kind === "team" && market === "moneyline_90" ? fixture.split(" vs ")[0] : null,
  opponent: null, countryCode: null, playerId: kind === "player" ? ++_id : null, photoUrl: null,
  market, marketLabel, side, line: market === "match_total_goals" ? 2.5 : null,
  odds, modelProbability: prob, startTime: "2026-07-01T18:00:00Z",
  dataQuality: kind === "team" ? "B" : "limited", confidence: "Lean", settlement: "90' result", limitedData: kind === "player",
});

// Two games, each with team markets (total / BTTS / ML) + player props (SOT / anytime GS), all in the leg band.
function slate() {
  const g1 = "Brazil vs Japan", g2 = "Germany vs Paraguay";
  const team = [
    leg(g1, "1", "team", "match_total_goals", "Total Goals", -150, 0.60, "Under 2.5"),
    leg(g1, "1", "team", "btts", "Both Teams To Score", -130, 0.55, "Both teams to score: No"),
    leg(g1, "1", "team", "moneyline_90", "Moneyline (90')", -180, 0.58, "home"),
    leg(g2, "2", "team", "match_total_goals", "Total Goals", -140, 0.57, "Over 2.5"),
    leg(g2, "2", "team", "btts", "Both Teams To Score", -120, 0.52, "Both teams to score: Yes"),
    leg(g2, "2", "team", "double_chance", "Double Chance", -160, 0.66, "Germany or Draw"),
  ];
  const player = [
    leg(g1, "1", "player", "player_shots_on_target", "Shots on Target", 120, 0.50, "Over", "Player A"),
    leg(g1, "1", "player", "player_goal_scorer_anytime", "Anytime Goalscorer", 160, 0.40, "Yes", "Player B"),
    leg(g2, "2", "player", "player_shots_on_target", "Shots on Target", 135, 0.48, "Over", "Player C"),
    leg(g2, "2", "player", "player_goal_scorer_anytime", "Anytime Goalscorer", 175, 0.38, "Yes", "Player D"),
  ];
  return { team, player };
}

const legsConflict = (a, b) => {
  if (a.legId === b.legId) return true;
  if (a.kind === "player" && b.kind === "player" && a.playerId != null && a.playerId === b.playerId) return true;
  if (a.eventId !== b.eventId) return false;
  if (a.market === b.market && (a.market === "btts" || a.market === "match_total_goals")) return true;
  return false;
};

test("daily specials: produces the four reliability tiers, each with 2 legs from each game", () => {
  const { team, player } = slate();
  const cards = buildDailyStructuredSpecials(team, player, new Map(), { date: "2026-07-01" });
  const tiers = cards.map((c) => c.reliabilityTier);
  for (const t of ["reliable", "balanced", "aggressive", "game-script"]) assert.ok(tiers.includes(t), `${t} tier built`);
  for (const c of cards) {
    assert.equal(c.legsByGame.length, 2, `${c.reliabilityTier}: groups both games`);
    for (const g of c.legsByGame) assert.equal(g.legs.length, 2, `${c.reliabilityTier}: 2 legs from ${g.game}`);
    assert.equal(c.legs.length, 4, `${c.reliabilityTier}: 4 legs total (2 games × 2)`);
    assert.equal(c.legsPerGameTarget, 2);
  }
});

test("daily specials: the Reliable tier is team-markets-only (no player props)", () => {
  const { team, player } = slate();
  const reliable = buildDailyStructuredSpecials(team, player, new Map(), { date: "2026-07-01" }).find((c) => c.reliabilityTier === "reliable");
  assert.ok(reliable, "reliable card exists");
  assert.equal(reliable.playerPropCount, 0, "no player props in Reliable");
  assert.equal(reliable.teamPropCount, reliable.legs.length, "all legs are team markets");
});

test("daily specials: no card contains contradictory or duplicate legs", () => {
  const { team, player } = slate();
  for (const c of buildDailyStructuredSpecials(team, player, new Map(), { date: "2026-07-01" })) {
    for (let i = 0; i < c.legs.length; i++)
      for (let j = i + 1; j < c.legs.length; j++)
        assert.ok(!legsConflict(c.legs[i], c.legs[j]), `${c.reliabilityTier}: legs ${i}/${j} conflict`);
  }
});

test("daily specials: every card discloses tier, correlation and why-it-can-fail; balanced mixes team+player", () => {
  const { team, player } = slate();
  const cards = buildDailyStructuredSpecials(team, player, new Map(), { date: "2026-07-01" });
  for (const c of cards) {
    assert.ok(c.reliabilityLabel && c.title, "has a title/label");
    assert.ok(c.correlation && typeof c.correlation.score === "number", "has a correlation read");
    assert.ok(Array.isArray(c.whyItCanFail) && c.whyItCanFail.length > 0, "explains why it can lose");
    assert.ok(Array.isArray(c.whyThisCard) && c.whyThisCard.length > 0, "explains why it exists");
    assert.ok(typeof c.combinedOdds === "number" && Number.isFinite(c.combinedOdds), "combined odds computed");
  }
  const balanced = cards.find((c) => c.reliabilityTier === "balanced");
  assert.ok(balanced.teamPropCount > 0 && balanced.playerPropCount > 0, "Balanced mixes a team leg + a value leg");
});

test("daily specials: a game with only one in-band leg still contributes (flagged), never fabricated", () => {
  const { team } = slate();
  // Brazil game keeps 2 team legs; Germany game has only ONE leg available.
  const oneLegGame = team.filter((l) => l.eventId === "1").concat(team.filter((l) => l.eventId === "2").slice(0, 1));
  const cards = buildDailyStructuredSpecials(oneLegGame, [], new Map(), { date: "2026-07-01" });
  const reliable = cards.find((c) => c.reliabilityTier === "reliable");
  assert.ok(reliable, "still builds a card");
  const germany = reliable.legsByGame.find((g) => g.game === "Germany vs Paraguay");
  assert.equal(germany.legs.length, 1, "uses the single available leg (no fabricated second leg)");
  assert.ok(reliable.whyThisCard.some((s) => /only one in-band/i.test(s)), "flags the short game honestly");
});

test("daily specials: empty slate yields no cards (fail-closed, never invents a slate)", () => {
  assert.deepEqual(buildDailyStructuredSpecials([], [], new Map(), { date: "2026-07-01" }), []);
});
