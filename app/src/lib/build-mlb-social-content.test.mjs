/**
 * Deterministic guards for the exportable MLB social-content builder (build-mlb-social-content.mjs). Uses synthetic
 * sim + team-market fixtures (no real archive) to pin the integrity rules: full provenance envelope on every item,
 * missing-vs-0% market probability, market-unavailable items never ranked among supported comparisons, the
 * pregame-freeze leakage guard, and zero betting-recommendation vocabulary in the output.
 *
 * Run: npx tsx --test src/lib/build-mlb-social-content.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialContent, FORBIDDEN_TERMS } from "../../scripts/build-mlb-social-content.mjs";
import { buildSocialPack } from "../../scripts/build-mlb-social-pack.mjs";

const REQUIRED_ITEM_FIELDS = [
  "date", "game", "player", "market", "side", "line", "simulationProbability", "marketProbability",
  "marketProbabilityAvailable", "differencePct", "runCount", "generatedAt", "marketCapturedAt",
  "lineupState", "dataStatus", "publicBeta", "notBettingAdvice", "public",
];

// A pregame game (market captured before first pitch, status "ready") with a mix of markets.
function pregameGame(over = {}) {
  return {
    gameId: "g1", teams: { home: "Home Nine", away: "Away Nine" }, status: "ready",
    marketSnapshot: { capturedAt: "2026-07-22T15:00:00Z" },
    simulationSummary: { headline: "A close one on paper." },
    generatedPicks: [
      { player: "Ace Arm", market: "pitcher_strikeouts", side: "over", line: 6.5, modelProbability: 0.68, marketProbability: 0.45 }, // big diff, supported
      { player: "Bat One", market: "batter_hits", side: "over", line: 1.5, modelProbability: 0.52, marketProbability: 0.50 },       // small diff, supported
      { player: "Zero Zed", market: "batter_total_bases", side: "over", line: 2.5, modelProbability: 0.30, marketProbability: 0 },   // market EXACTLY 0% (real, not missing)
      { player: "Missing Moe", market: "batter_rbis", side: "over", line: 0.5, modelProbability: 0.40 },                              // NO market probability (missing)
    ],
    ...over,
  };
}
const teamMarkets = { games: { g1: { commenceTime: "2026-07-22T23:05:00Z" }, gLate: { commenceTime: "2026-07-22T18:00:00Z" } } };
const sim = (games) => ({ runCount: 10000, generatedAt: "2026-07-22T19:00:00Z", games });

test("1 · every emitted item carries the full provenance envelope", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const items = [...r.largestSimulationDifferences, ...r.simulationOnlyProjections];
  assert.ok(items.length >= 3, "produced items");
  for (const it of items) for (const f of REQUIRED_ITEM_FIELDS) assert.ok(f in it, `item missing ${f}`);
  for (const it of items) { assert.equal(it.public, false); assert.equal(it.notBettingAdvice, true); assert.ok(it.publicBeta.length > 20); assert.equal(it.runCount, 10000); }
});

test("2 · missing market probability is null (distinct from a real 0%) and is NOT ranked among supported", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  // the 0% market row IS a supported comparison (real number, not missing)
  const zero = r.largestSimulationDifferences.find((d) => d.player === "Zero Zed");
  assert.ok(zero, "0% market row is a supported comparison");
  assert.equal(zero.marketProbability, 0);
  assert.equal(zero.marketProbabilityAvailable, true);
  assert.equal(zero.differencePct, 30, "diff computed against a real 0%");
  // the missing-market row is null + un-ranked (separate list only)
  const miss = r.simulationOnlyProjections.find((d) => d.player === "Missing Moe");
  assert.ok(miss, "missing-market row is in the un-ranked list");
  assert.equal(miss.marketProbability, null, "missing market prob is null, not 0");
  assert.equal(miss.marketProbabilityAvailable, false);
  assert.equal(miss.differencePct, null, "no difference when market is missing");
  assert.equal(miss.dataStatus, "market-unavailable");
  assert.ok(!r.largestSimulationDifferences.some((d) => d.player === "Missing Moe"), "missing-market item never ranked among supported comparisons");
});

test("3 · supported comparisons are ranked by difference (largest first)", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const diffs = r.largestSimulationDifferences.map((d) => d.differencePct);
  for (let i = 1; i < diffs.length; i++) assert.ok(diffs[i - 1] >= diffs[i], "descending by differencePct");
  // Zero Zed's |30 − 0| = 30pt gap (a real 0% market) is the largest, so it ranks first — proving a genuine 0%
  // is included and ranked, not dropped as "missing".
  assert.equal(r.largestSimulationDifferences[0].player, "Zero Zed", "biggest gap ranks first");
  assert.equal(r.largestSimulationDifferences[0].differencePct, 30);
});

test("4 · PREGAME-FREEZE guard excludes a game whose market was captured after first pitch, or that has started", () => {
  // market captured AFTER commence → leakage → excluded
  const leak = pregameGame({ gameId: "gLate", marketSnapshot: { capturedAt: "2026-07-22T19:00:00Z" } }); // commence gLate = 18:00
  let r = buildSocialContent(sim([leak]), teamMarkets, "2026-07-22");
  assert.equal(r.games, 0, "post-first-pitch capture is excluded");
  assert.equal(r.largestSimulationDifferences.length, 0);
  assert.ok(r.excludedGames.some((g) => /frozen pregame/.test(g.reason)));
  // a started game (status not pregame) → excluded even if timestamps are absent
  r = buildSocialContent(sim([pregameGame({ status: "live" })]), teamMarkets, "2026-07-22");
  assert.equal(r.games, 0, "a live/started game is excluded");
  assert.ok(r.excludedGames.some((g) => /status/.test(g.reason)));
});

test("5 · the output contains NO betting-recommendation vocabulary (field names OR values)", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  // scan the ranked/derived content, NOT the intentional forbiddenTerms allow-list or the disclaimer
  const scan = JSON.stringify({
    largestSimulationDifferences: r.largestSimulationDifferences,
    simulationOnlyProjections: r.simulationOnlyProjections,
    highestVolatilityGames: r.highestVolatilityGames,
    interestingMatchups: r.interestingMatchups,
  }).toLowerCase();
  for (const term of ["edge", "\"value\"", "lock", "best bet", "beat the market", "profitable", "guaranteed"]) {
    assert.ok(!scan.includes(term), `output must not contain "${term}"`);
  }
  assert.ok(!/edgepct|isedge|bestbet|islock/.test(scan), "no edge/lock/best-bet field keys");
  // the report advertises its own guard list + is flagged not-betting-advice
  assert.deepEqual(r.forbiddenTerms, FORBIDDEN_TERMS);
  assert.equal(r.notBettingAdvice, true);
  assert.equal(r.public, false);
});

test("6 · a difference is a neutral magnitude — never described as the simulation beating/being superior to the market", () => {
  const r = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const d = r.largestSimulationDifferences[0];
  assert.ok(d.differencePct >= 0, "difference is an absolute magnitude, not a signed advantage");
  assert.match(r.disclaimer, /not a prediction of superiority|not betting advice/i);
});

// ── the daily social PACK (6 sections + platform drafts) ──
const priorReport = { date: "2026-07-21", decisive: 47, wins: 15, losses: 32, hitRate: 0.3194 };

test("7 · the pack has all six sections + four platform drafts, internal + not-advice", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const pack = buildSocialPack(content, priorReport, "2026-07-22");
  assert.equal(pack.public, false);
  assert.equal(pack.notBettingAdvice, true);
  for (const s of ["overview", "largestDifferences", "highestUncertainty", "interestingMatchups", "featureCompleteness", "resultsRecap"]) {
    assert.ok(s in pack.sections, `pack missing section ${s}`);
  }
  for (const d of ["x", "instagramCaption", "discord", "tiktokVoiceoverOutline"]) assert.ok(d in pack.drafts, `pack missing draft ${d}`);
  assert.ok(/not betting advice/i.test(pack.drafts.x), "the X draft carries the not-advice disclaimer");
});

test("8 · the results recap is a NEUTRAL single-date simulation-accuracy figure — not the paper record, not profitability", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const recap = buildSocialPack(content, priorReport, "2026-07-22").sections.resultsRecap;
  assert.equal(recap.settledDate, "2026-07-21");
  assert.equal(recap.projectionHitRatePct, 31.9, "reports the raw projection hit-rate honestly, low as it is");
  assert.match(recap.note, /NOT the paper-product record/i);
  assert.match(recap.note, /NOT profitability/i);
  assert.match(recap.note, /single settled date|from one day/i);
  // never surfaces the money record family (19-14 / bankroll / crown) in a sim-accuracy recap
  const scan = JSON.stringify(recap);
  assert.ok(!/19-14|19–14|bankroll|crown|\$20,465|\$19,065/.test(scan), "no money-record family mixed into the sim recap");
});

test("9 · the pack drafts contain NO betting-recommendation vocabulary", () => {
  const content = buildSocialContent(sim([pregameGame()]), teamMarkets, "2026-07-22");
  const pack = buildSocialPack(content, priorReport, "2026-07-22");
  const scan = JSON.stringify(pack.drafts).toLowerCase() + JSON.stringify(pack.sections).toLowerCase();
  for (const term of ["edge", "\"value\"", "lock", "best bet", "beat the market", "profitable", "guaranteed", "sure thing"]) {
    assert.ok(!scan.includes(term), `pack must not contain "${term}"`);
  }
});
