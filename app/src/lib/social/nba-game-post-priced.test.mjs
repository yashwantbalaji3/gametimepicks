import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPricedGamePost, pricedGamePostCaption, pricedGamePostProblems } from "./nba-game-post-priced.mjs";

const ref = { ref: "app/public/data/nba/experimental-public/2026-11-04.json", sha256: "a".repeat(64) };
const img = (n) => ({ path: `/x/${n}.png`, sha256: n.repeat(64).slice(0, 64), width: 1080, height: 1350, scale: 1 });
const base = (o) => ({ date: "2026-11-04", snapshotRefs: [ref], verification: { passed: true, checks: ["c"], cellsVerified: 3 }, eligibilityClass: "OFFICIAL", disclosures: ["Model projections"], commandCenter: { dataCommit: "d", claims: [] }, designVersion: "2", ...o });
const winner = base({ contentType: "NBA_GAME_WINNER", variant: "9-ml", dedupeId: "w", contentSha256: "1", containsMarketData: true, images: [img("a")], window: { opensAt: "2026-11-04T20:00:00Z", closesAt: "2026-11-05T02:00:00Z" }, freshness: { asOf: "2026-11-04T20:00:00Z", rule: "valid until tip-off, at most 6 hours after the quote" }, content: { eventId: "9", side: "SA", price: 120, book: "b", quotedAt: "2026-11-04T20:00:00Z" } });
const box = base({ contentType: "NBA_BOXSCORE", variant: "9", dedupeId: "x", contentSha256: "2", images: [img("b")], window: { opensAt: "2026-11-04T20:30:00Z", closesAt: "2026-11-05T02:30:00Z" }, freshness: { rule: "valid until tip-off" }, content: { testData: false, quotedAt: "4:00 PM ET" } });
const images = [img("a"), img("b")];
const cells = [{ cellId: "1.pts", playerId: "1", market: "pts", state: "PASS" }];
const game = { awayName: "Dallas Mavericks", homeName: "San Antonio Spurs", awayAbbr: "DAL", homeAbbr: "SA", winnerNickname: "Spurs", tipUtc: "2026-11-05T02:30:00Z" };
const ok = { winner, box, images, forecastCells: cells, recommendedAt: "2026-11-05T01:30:00Z" };

test("accepts a priced winner card then the game's line pages, in order", () => {
  assert.deepEqual(pricedGamePostProblems(ok), []);
  const p = buildPricedGamePost({ ...ok, renderSource: { path: "/x/rs.json", sha256: "r" }, game });
  assert.equal(p.variant, "9-priced");
  assert.equal(p.containsMarketData, true);
  assert.equal(p.window.closesAt, "2026-11-05T02:00:00Z", "the earlier quote window wins");
  assert.equal(p.approval.socialAuthorized, false);
  assert.deepEqual(p.images.map((i) => i.sha256), images.map((i) => i.sha256));
});

test("refuses model-only winners, test-data line cards, wrong order, flagged cells and slots outside either quote", () => {
  const has = (o, re) => assert.ok(pricedGamePostProblems({ ...ok, ...o }).some((x) => re.test(x)), re.source);
  has({ winner: { ...winner, variant: "9", containsMarketData: false } }, /priced winner card/);
  has({ box: { ...box, content: { testData: true } } }, /test data/);
  has({ box: { ...box, content: {} } }, /test data/);
  has({ images: [img("b"), img("a")] }, /order/);
  has({ box: { ...box, images: [img("b"), img("c")] }, images: [img("a"), img("b"), img("c")] }, /1 to 1 pages/);
  has({ forecastCells: [{ ...cells[0], state: "BLOCKED" }] }, /flagged/);
  has({ recommendedAt: "2026-11-05T02:10:00Z" }, /window/);
  has({ recommendedAt: "2026-11-04T20:10:00Z" }, /window/);
  has({ box: { ...box, variant: "8" } }, /this game/);
});

test("the caption prints no price, line or odds word, and no em dash", () => {
  const c = pricedGamePostCaption(game);
  assert.doesNotMatch(c, /[+-]\d{3}|\d+\.5|\bodds\b|\bbet|[—–]/i);
});

test("final-copy marker: only the founder's Nov 4 ref on a priced Nov 4 game post, with no content approval", async () => {
  const { socialPackageViolations, FINAL_COPY_AUTHORIZATION_2026_11_04: F } = await import("./social-package.mjs");
  const p = buildPricedGamePost({ ...ok, renderSource: { path: "/x/rs.json", sha256: "r" }, game });
  const fin = (o = {}, a = {}) => ({ ...p, ...o, approval: { ...p.approval, socialAuthorized: true, contentApproval: null, finalCopyAuthorization: { ...F }, ...a } });
  const bad = (x) => socialPackageViolations(x).some((m) => /approval must stay/.test(m));
  assert.equal(bad(fin()), false);
  assert.equal(bad(fin({}, { contentApproval: { by: "x" } })), true);
  assert.equal(bad(fin({}, { finalCopyAuthorization: { ...F, sha256: "0".repeat(64) } })), true);
  assert.equal(bad(fin({}, { status: "FOUNDER_APPROVED" })), true);
  assert.equal(bad(fin({ date: "2026-11-05" })), true);
  assert.equal(bad(fin({ variant: "9-model" })), true);
  assert.equal(bad(fin({ containsMarketData: false })), true);
  assert.equal(bad({ ...p, approval: { ...p.approval, socialAuthorized: true } }), true);
});

test("final-copy marker, NFL Week 9: only the founder's Nov 5 ref on a Week 9 NFL game post or Top 5", async () => {
  const { socialPackageViolations: v, FINAL_COPY_AUTHORIZATION_NFL_W9: N, FINAL_COPY_AUTHORIZATION_2026_11_04: F } = await import("./social-package.mjs");
  const p = buildPricedGamePost({ ...ok, renderSource: { path: "/x/rs.json", sha256: "r" }, game });
  const nfl = (o = {}, a = {}) => ({ ...p, sport: "nfl", contentType: "NFL_GAME_POST", date: "2026-11-08", content: { ...p.content, week: 9 }, ...o, approval: { ...p.approval, socialAuthorized: true, contentApproval: null, finalCopyAuthorization: { ...N }, ...a } });
  const bad = (x) => v(x).some((m) => /approval must stay/.test(m));
  assert.equal(bad(nfl()), false);
  assert.equal(bad(nfl({ contentType: "NFL_WEEKLY_TOP5" })), false);
  assert.equal(bad(nfl({ date: "2026-11-10" })), true);
  assert.equal(bad(nfl({ content: { week: 10 } })), true);
  assert.equal(bad(nfl({ contentType: "NFL_SUNDAY_WINNERS" })), true);
  assert.equal(bad(nfl({}, { finalCopyAuthorization: { ...F } })), true);
  assert.equal(bad(nfl({}, { contentApproval: { by: "x" } })), true);
});
