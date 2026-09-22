/**
 * NBA team-rating guards (N2): determinism, preseason isolation, leakage cutoff, boundary
 * regression, neutral-site suppression. NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/team-rating.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTeamRatings, winProbability, ratingFor, seasonOfDate, NBA_ELO_PARAMS, DEFAULT_RATING } from "./team-rating.mjs";

const g = (id, season, phase, dateUtc, home, away, ftHome, ftAway, neutralSite = false) => ({ providerEventId: id, season, phase, dateUtc, home, away, ftHome, ftAway, neutralSite, result: ftHome > ftAway ? "H" : "A" });
const ROWS = [
  g("p1", 2026, 1, "2025-10-03T23:00Z", "Toronto Raptors", "Miami Heat", 100, 90),
  g("r1", 2026, 2, "2025-10-22T23:00Z", "Boston Celtics", "New York Knicks", 110, 100),
  g("r2", 2026, 2, "2025-10-23T23:00Z", "New York Knicks", "Boston Celtics", 105, 99),
  g("r3", 2026, 3, "2026-05-01T23:00Z", "Boston Celtics", "Miami Heat", 120, 100),
  g("p2", 2027, 1, "2026-10-03T23:00Z", "Toronto Raptors", "Miami Heat", 95, 99),
];

test("deterministic: same rows (any order) → identical ratings; only rows strictly before throughDateUtc fold", () => {
  const a = buildTeamRatings(ROWS, { throughDateUtc: "2026-09-22T12:00:00Z" });
  const b = buildTeamRatings([...ROWS].reverse(), { throughDateUtc: "2026-09-22T12:00:00Z" });
  assert.deepEqual(a, b);
  assert.equal(a.folded.regular, 3);
  assert.equal(a.folded.preseason, 1, "p2 (after now) must not fold");
  const cut = buildTeamRatings(ROWS, { throughDateUtc: "2025-10-22T23:00Z" });
  assert.equal(cut.folded.regular, 0, "a game AT the cutoff instant is not strictly earlier");
});

test("preseason NEVER updates regular ratings and vice versa; separate streams, separate counts", () => {
  const out = buildTeamRatings(ROWS, { throughDateUtc: "2027-01-01T00:00Z" });
  assert.equal(out.ratings["Toronto Raptors"], undefined, "Toronto only played preseason → no regular rating");
  assert.equal(out.counts["Toronto Raptors"], undefined);
  assert.ok(Number.isFinite(out.preseasonRatings["Toronto Raptors"]) && out.preseasonRatings["Toronto Raptors"] !== DEFAULT_RATING, "Toronto's two preseason games move the preseason rating");
  const afterWin = buildTeamRatings(ROWS, { throughDateUtc: "2026-01-01T00:00Z" });
  assert.ok(afterWin.preseasonRatings["Toronto Raptors"] > DEFAULT_RATING, "the p1 win alone raises the preseason rating");
  assert.equal(out.preseasonRatings["Boston Celtics"], undefined, "Boston never played preseason");
  assert.equal(out.preseasonCounts["Miami Heat"], 2);
  assert.equal(out.counts["Miami Heat"], 1);
  // Miami lost r3 in the regular stream; that loss must not touch the preseason table.
  const preOnly = buildTeamRatings(ROWS.filter((r) => r.phase === 1), { throughDateUtc: "2027-01-01T00:00Z" });
  assert.deepEqual(preOnly.preseasonRatings, out.preseasonRatings);
});

test("season boundary: 25% regression toward 1500 applied once per stream when targetSeason is later", () => {
  const base = buildTeamRatings(ROWS, { throughDateUtc: "2026-09-22T12:00:00Z" });
  const next = buildTeamRatings(ROWS, { throughDateUtc: "2026-09-22T12:00:00Z", targetSeason: 2027 });
  assert.deepEqual(next.boundaryRegressionApplied, { regular: true, preseason: true });
  for (const [team, r] of Object.entries(base.ratings)) {
    const expected = Number((r + (NBA_ELO_PARAMS.MEAN - r) * NBA_ELO_PARAMS.SEASON_REGRESSION).toFixed(4));
    assert.ok(Math.abs(next.ratings[team] - expected) < 1e-3, `${team} regressed`);
  }
  const same = buildTeamRatings(ROWS, { throughDateUtc: "2026-09-22T12:00:00Z", targetSeason: 2026 });
  assert.deepEqual(same.boundaryRegressionApplied, { regular: false, preseason: false });
  assert.deepEqual(same.ratings, base.ratings);
});

test("winProbability: logistic 400-scale; +70 home edge suppressed at neutral sites; symmetric", () => {
  assert.equal(winProbability(1500, 1500, { neutralSite: true }), 0.5);
  const home = winProbability(1500, 1500);
  assert.ok(home > 0.5 && home < 0.7, `home edge ${home}`);
  assert.ok(Math.abs(home - 1 / (1 + Math.pow(10, -70 / 400))) < 1e-12);
  assert.ok(Math.abs(winProbability(1600, 1500, { neutralSite: true }) + winProbability(1500, 1600, { neutralSite: true }) - 1) < 1e-12);
});

test("ratingFor: unknown team → 1500 with an explicit default basis (never a silent number)", () => {
  const out = buildTeamRatings(ROWS, { throughDateUtc: "2027-01-01T00:00Z" });
  assert.deepEqual(ratingFor(out, "Real Madrid"), { rating: DEFAULT_RATING, games: 0, basis: "default-no-history" });
  assert.equal(ratingFor(out, "Boston Celtics").basis, "regular");
  assert.equal(ratingFor(out, "Toronto Raptors", { population: "preseason" }).basis, "preseason");
  assert.equal(ratingFor(out, "Toronto Raptors").basis, "default-no-history");
});

test("seasonOfDate labels Sept→June seasons by the ending year; non-final / tied rows are skipped, not folded", () => {
  assert.equal(seasonOfDate("2026-10-03T23:00Z"), 2027);
  assert.equal(seasonOfDate("2026-06-14T00:30Z"), 2026);
  assert.equal(seasonOfDate("garbage"), null);
  const out = buildTeamRatings([...ROWS, { providerEventId: "tie", season: 2026, phase: 2, dateUtc: "2025-11-01T00:00Z", home: "A", away: "B", ftHome: 100, ftAway: 100 }, { providerEventId: "nf", season: 2026, phase: 2, dateUtc: "2025-11-01T00:00Z", home: "A", away: "B", ftHome: null, ftAway: 3 }], { throughDateUtc: "2027-01-01T00:00Z" });
  assert.equal(out.folded.skippedNonFinal, 2);
  assert.equal(out.ratings.A, undefined);
  assert.throws(() => buildTeamRatings(ROWS, {}), /throughDateUtc/);
});
