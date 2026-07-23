/**
 * NBA entity + game identity contract tests (Phase 11). Deterministic, no clock, no network. Every scenario is
 * grounded in a real hazard found in the 2026 historical artifacts (docs/NBA_ENGINE_FORENSIC_AUDIT.md):
 * provider-id drift, team-tricode divergence, and the absence of ANY cross-provider reconciliation in the pipeline.
 * Run: npx tsx --test src/lib/nba/identity-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalTeamId,
  sameTeam,
  detectGameIdProvider,
  parseNbaComGameId,
  providerRef,
  providerRefKey,
  normalizePlayerName,
  NbaPlayerCrosswalk,
  samePlayer,
  makePlayerIdentity,
  makeGameIdentity,
  NbaGameCrosswalk,
  sameGame,
  isRescheduleOf,
  logicalMatchupKey,
  NBA_CONTRACT_FLAGS,
  NBA_CANONICAL_TRICODES,
} from "./identity-contract.ts";

test("teams · divergent provider tricodes + full names resolve to ONE canonical id", () => {
  // Boards use ESPN-style "NY"/"SA"; manual overrides use "NYK"/"SAS"; games carry full names.
  assert.equal(canonicalTeamId("NY"), "NYK");
  assert.equal(canonicalTeamId("NYK"), "NYK");
  assert.equal(canonicalTeamId("New York Knicks"), "NYK");
  assert.equal(canonicalTeamId("SA"), "SAS");
  assert.equal(canonicalTeamId("San Antonio Spurs"), "SAS");
  assert.equal(sameTeam("NY", "NYK"), true, "raw string compare would call these different");
  assert.equal(sameTeam("NY", "SA"), false);
  assert.equal(canonicalTeamId("ZZZ"), null, "unknown never guesses");
  assert.equal(NBA_CANONICAL_TRICODES.length, 30);
});

test("games · provider provenance detected from id shape (three real namespaces)", () => {
  assert.equal(detectGameIdProvider("0042500206"), "nba_api"); // real nba_api id (2026-05-15 board)
  assert.equal(detectGameIdProvider("401859967"), "espn"); //     real ESPN id (2026-06-13 board)
  assert.equal(detectGameIdProvider("manual-2026-05-04-NYK-PHI"), "manual"); // real override id
  assert.equal(detectGameIdProvider("banana"), "unknown");
});

test("preseason vs regular vs postseason · decoded from the NBA.com season-type digit", () => {
  // Real playoff id 0042500206 → postseason, 2025-26 season, game 206.
  const post = parseNbaComGameId("0042500206");
  assert.equal(post.valid, true);
  assert.equal(post.seasonType, "postseason");
  assert.equal(post.seasonStartYear, 2025);
  assert.equal(post.sequence, "00206");
  // Same season + sequence but different season-type digit ⇒ genuinely different games.
  assert.equal(parseNbaComGameId("0012500001").seasonType, "preseason");
  assert.equal(parseNbaComGameId("0022500001").seasonType, "regular");
  assert.equal(parseNbaComGameId("0052500001").seasonType, "playin");
  // ESPN / manual ids are not decodable this way.
  assert.equal(parseNbaComGameId("401859967").valid, false);
  assert.equal(parseNbaComGameId("manual-2026-05-04-NYK-PHI").valid, false);
});

test("player · provider ID CHANGES for the same human (Mikal Bridges 1628969 → 3147657) unified only via crosswalk", () => {
  const nbaRef = providerRef("nba_api", 1628969); // boards ≤ 2026-06-08
  const espnRef = providerRef("espn", 3147657); //   boards 2026-06-10 / 06-13
  // Raw id-equality across providers FAILS — the naive join is wrong.
  assert.notEqual(providerRefKey(nbaRef), providerRefKey(espnRef));
  assert.equal(samePlayer(nbaRef, espnRef), false, "without a crosswalk they must stay distinct (safe default)");
  // An operator-curated crosswalk (the reactivation must build one) unifies them.
  const xwalk = new NbaPlayerCrosswalk([
    { canonicalPlayerId: "bridges-mikal", primaryName: "Mikal Bridges", refs: [nbaRef, espnRef] },
  ]);
  assert.equal(samePlayer(nbaRef, espnRef, xwalk), true);
  assert.equal(makePlayerIdentity(espnRef, xwalk).canonicalPlayerId, "bridges-mikal");
  assert.equal(makePlayerIdentity(nbaRef, xwalk).primaryName, "Mikal Bridges");
});

test("player · duplicate NAMES are never merged (name is not an identity key)", () => {
  const a = providerRef("nba_api", 111111); // two different humans who happen to share a name
  const b = providerRef("nba_api", 222222);
  assert.equal(normalizePlayerName("Jaylen Brown"), normalizePlayerName("jaylen  brown"), "name key normalizes for hints");
  // Same normalized name, different ids, no crosswalk link ⇒ NOT the same player.
  assert.equal(samePlayer(a, b), false);
  // Even if a buggy crosswalk only links one of them, the other stays distinct.
  const xwalk = new NbaPlayerCrosswalk([{ canonicalPlayerId: "brown-jaylen", refs: [a] }]);
  assert.equal(samePlayer(a, b, xwalk), false);
});

test("player · a TRADE changes team assignment, not player identity", () => {
  const ref = providerRef("nba_api", 1642450); // real settled id (Daniss Jenkins)
  const xwalk = new NbaPlayerCrosswalk([{ canonicalPlayerId: "jenkins-daniss", primaryName: "Daniss Jenkins", refs: [ref] }]);
  // Same player id appears with DET one night and (hypothetically) BKN later — identity is team-independent.
  const nightA = { player: makePlayerIdentity(ref, xwalk), teamId: canonicalTeamId("DET") };
  const nightB = { player: makePlayerIdentity(ref, xwalk), teamId: canonicalTeamId("BKN") };
  assert.equal(nightA.player.canonicalPlayerId, nightB.player.canonicalPlayerId, "player identity stable across the trade");
  assert.notEqual(nightA.teamId, nightB.teamId, "team assignment differs — a per-game fact, not identity");
});

test("games · two DIFFERENT games on the same date get distinct identities (no date+teams collision)", () => {
  // Real 2026-05-15 slate carried two games: 0042500206 and 0042500236.
  const g1 = makeGameIdentity({ provider: "nba_api", providerGameId: "0042500206", scheduledDate: "2026-05-15", homeTeam: "SA", awayTeam: "NY" });
  const g2 = makeGameIdentity({ provider: "nba_api", providerGameId: "0042500236", scheduledDate: "2026-05-15", homeTeam: "DET", awayTeam: "CLE" });
  assert.notEqual(g1.canonicalGameKey, g2.canonicalGameKey);
  assert.equal(sameGame(g1, g2), false);
  assert.notEqual(logicalMatchupKey(g1), logicalMatchupKey(g2), "different matchups → different logical keys");
  assert.equal(g1.homeTeamId, "SAS");
  assert.equal(g1.awayTeamId, "NYK");
});

test("games · provider ID change for the SAME game unified only via crosswalk; display tip-off is not proven", () => {
  const nbacom = makeGameIdentity({ provider: "nba_api", providerGameId: "0042500236", scheduledDate: "2026-06-13", homeTeam: "SA", awayTeam: "NY", scheduledTipoffIso: "8:30 PM ET" });
  const espn = makeGameIdentity({ provider: "espn", providerGameId: "401859967", scheduledDate: "2026-06-13", homeTeam: "SA", awayTeam: "NY", scheduledTipoffIso: "2026-06-14T00:30:00Z" });
  assert.equal(nbacom.tipoffIso, null, "a display-only tip-off is NOT a proven instant");
  assert.equal(espn.tipoffIso, "2026-06-14T00:30:00Z", "a real ISO tip-off is kept");
  assert.equal(sameGame(nbacom, espn), false, "different provider id spaces do not auto-merge");
  const xwalk = new NbaGameCrosswalk([{ canonicalGameId: "2026-06-13-NYK-SAS", keys: [nbacom.canonicalGameKey, espn.canonicalGameKey] }]);
  assert.equal(sameGame(nbacom, espn, xwalk), true, "explicit crosswalk links them");
});

test("games · a RESCHEDULED game links to its original via lineage, not by matching the new date", () => {
  const original = makeGameIdentity({ provider: "espn", providerGameId: "401859900", scheduledDate: "2026-05-10", homeTeam: "NY", awayTeam: "PHI" });
  const moved = makeGameIdentity({
    provider: "espn",
    providerGameId: "401859999",
    scheduledDate: "2026-05-12",
    homeTeam: "NY",
    awayTeam: "PHI",
    lineage: { rescheduledFromKey: original.canonicalGameKey, note: "postponed 2 days" },
  });
  assert.equal(isRescheduleOf(moved, original), true);
  assert.equal(sameGame(moved, original), true, "lineage ties the reschedule to the original logical game");
  assert.notEqual(moved.scheduledDate, original.scheduledDate, "dates differ — a date-only join would MISS this link");
  assert.notEqual(logicalMatchupKey(moved), logicalMatchupKey(original), "and a matchup+date key would wrongly SPLIT it");
});

test("contract is flagged HISTORICAL_ONLY (never public / money-touching)", () => {
  assert.equal(NBA_CONTRACT_FLAGS.public, false);
  assert.equal(NBA_CONTRACT_FLAGS.approvedForProduction, false);
  assert.equal(NBA_CONTRACT_FLAGS.productEligible, false);
});
