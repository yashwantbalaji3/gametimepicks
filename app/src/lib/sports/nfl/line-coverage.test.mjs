/* NFL line coverage report on SYNTHETIC fixtures: true denominators, withheld families never compared, anytime TD a
   quote not a comparison, display-eligible 0 while unauthorized, and no price / line / book in the public summary.
   Run: npx tsx --test src/lib/sports/nfl/line-coverage.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { buildNflLineCoverage, publicNflCoverageSummary, nflCoverageMarkdown } from "./line-coverage.mjs";
import { FX_BOARD, FX_OFFERS, FX_AS_OF, FX_EVENT } from "./__fixtures__/nfl-prop-line-synthetic.mjs";

const doc = {
  artifact: "nfl-odds-capture", sport: "nfl", capturedAt: "2099-01-10T15:00:00Z", creditsUsed: 8,
  propProbe: {
    events: [{ oddsEventId: "abc123", canonicalEventId: `nfl-${FX_EVENT}`, marketsSeen: { player_receptions: {}, player_reception_yds: {}, player_pass_yds: {}, player_rush_yds: {}, player_anytime_td: {} }, unresolvedIdentities: [{ name: "Fixture Unknown", families: ["anytime_td"] }] }],
    lineProps: { rows: FX_OFFERS.filter((o) => o.market !== "player_anytime_td").map(({ book, ...r }) => ({ ...r, bookmaker: book })), quarantined: [{ canonicalEventId: `nfl-${FX_EVENT}`, market: "player_receptions" }] },
    anytimeTd: { rows: FX_OFFERS.filter((o) => o.market === "player_anytime_td").map(({ book, market, ...r }) => ({ ...r, bookmaker: book })), quarantined: [] },
  },
};
const ledger = { cumulativeCredits: 999, requests: [{ endpoint: "/sports/x/events/abc123/odds", creditsUsed: 5 }, { endpoint: "/sports/x/odds", creditsUsed: 3 }] };
const r = buildNflLineCoverage({ boards: [FX_BOARD], captures: [{ file: "s/capture-1.json", doc }], ledger, asOf: FX_AS_OF });

test("true denominators per market; withheld families counted, never compared; anytime TD is a quote count", () => {
  const g = r.perGame[0];
  assert.deepEqual([g.markets.player_receptions.official, g.markets.player_receptions.qualified.count], [3, 2]);
  assert.deepEqual([g.markets.player_reception_yds.official, g.markets.player_reception_yds.qualified.count], [3, 1]);
  assert.deepEqual([g.markets.player_pass_yds.official, g.markets.player_pass_yds.withheldOfficial, g.markets.player_pass_yds.qualified.count], [0, 1, 0]);
  assert.deepEqual([g.markets.player_rush_yds.withheldOfficial, g.markets.player_rush_yds.unmatched.familyNotPublished], [2, 2]);
  assert.deepEqual([g.markets.player_anytime_td.official, g.markets.player_anytime_td.qualified.count, g.markets.player_anytime_td.unmatched.identityUnresolved], [2, 2, 1]);
  assert.deepEqual(r.totals.overUnderCompared, { count: 3, of: 6, pct: 50 });
  assert.equal(g.markets.player_receptions.unmatched.notOnBoard, 1, "athlete-9 has a line but no board row");
  assert.equal(g.markets.player_receptions.unmatched.incompleteTwoSided, 1);
  assert.equal(g.markets.player_receptions.perBook.draftkings.players, 3);
  assert.equal(g.markets.player_reception_yds.perBook.bovada.eligible, false);
});

test("credits from the captures and the ledger; display-eligible 0 while unauthorized; remediation per gap", () => {
  assert.deepEqual([r.totals.creditsThisWeek, r.totals.creditsCumulativeLedger, r.perGame[0].credits], [8, 999, 5]);
  assert.equal(r.totals.displayEligible, 0);
  assert.equal(r.displayAuthorized, false);
  assert.ok(r.perGame[0].markets.player_receptions.remediation.some((x) => /Display authorization for NFL is off/.test(x)));
  const auth = { nfl: { siteDisplay: true, socialDisplay: false, providerTermsRef: "x.md", attribution: null, approvedBy: "f", approvedAt: "2099-01-01", socialFeedPrices: false, socialFeedPricesConfirmationRef: null } };
  const on = buildNflLineCoverage({ boards: [FX_BOARD], captures: [{ file: "s/capture-1.json", doc }], ledger, asOf: FX_AS_OF, authorization: auth });
  assert.equal(on.totals.displayEligible, 3, "over/under comparisons only — never anytime TD");
});

test("public summary and its markdown carry no price, line or book name", () => {
  const pub = JSON.stringify(publicNflCoverageSummary(r)) + nflCoverageMarkdown(r, { publicOnly: true });
  assert.doesNotMatch(pub, /draftkings|fanduel|betmgm|bovada|DraftKings|−115|-115|"line"|overPrice|price"/i);
  assert.match(nflCoverageMarkdown(r), /bovada \(ineligible\)/, "the private markdown names books (private output)");
});
