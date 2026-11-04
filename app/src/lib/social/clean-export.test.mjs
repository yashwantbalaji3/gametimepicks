import assert from "node:assert/strict";
import { test } from "node:test";

import { approvalMatchProblems, cleanEligibilityProblems, marketValueProblems, sameDisplayProblems, withoutBanner } from "./clean-export.mjs";

const pkg = { dedupeId: "d", contentSha256: "c", designVersion: "2", containsMarketData: false, contentType: "NBA_TONIGHT", images: [{ path: "a", sha256: "s" }], commandCenter: { captions: [{ id: "A", text: "hi" }] } };
const entry = { dedupeId: "d", contentSha256: "c", captionId: "A", caption: "hi", approvedAt: "t" };
test("eligibility refuses market data, pass and rush, and player cards under REVIEW", () => {
  assert.deepEqual(cleanEligibilityProblems(pkg), []);
  assert.ok(cleanEligibilityProblems({ ...pkg, containsMarketData: true }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, variant: "top5_rush_yds" }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NFL_PLAYER_STATS", content: { estimate: true } }).length);
});
const winnerMl = { ...pkg, contentType: "NBA_GAME_WINNER", variant: "401-ml", containsMarketData: true, content: { eventId: "401", side: "CHA", price: -115, book: "draftkings", quotedAt: "q" } };
const tonightMl = { ...pkg, variant: "ml", containsMarketData: true, content: { games: [{ eventId: "401", side: "CHA", price: -115, book: "draftkings", quotedAt: "q" }, { eventId: "402", side: "BOS", price: 120, book: "fanduel", quotedAt: "q" }] } };
test("market data is allowed only on the two moneyline shapes", () => {
  assert.deepEqual(cleanEligibilityProblems(winnerMl), []);
  assert.deepEqual(cleanEligibilityProblems(tonightMl), []);
  assert.ok(cleanEligibilityProblems({ ...winnerMl, variant: "401" }).length);
  assert.ok(cleanEligibilityProblems({ ...winnerMl, variant: "402-ml" }).length);
  assert.ok(cleanEligibilityProblems({ ...winnerMl, containsMarketData: false }).length);
  assert.ok(cleanEligibilityProblems({ ...tonightMl, variant: "x" }).length);
  assert.ok(cleanEligibilityProblems({ ...winnerMl, contentType: "NBA_TONIGHT" }).length);
  assert.ok(cleanEligibilityProblems({ ...winnerMl, contentType: "NFL_GAME_WINNER" }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NBA_BOXSCORE", anomalyCheck: "PASS", containsMarketData: true, variant: "401" }).length);
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NBA_DAILY_TOP5", anomalyCheck: "PASS", containsMarketData: true, variant: "pts" }).length);
});
test("REVIEW refuses every type; a missing check refuses stat, Top 5 and game-post types", () => {
  for (const contentType of ["NBA_PLAYER_STATS", "NBA_BOXSCORE", "NBA_DAILY_TOP5", "NFL_WEEKLY_TOP5", "NBA_GAME_POST", "NBA_TONIGHT", "NBA_GAME_WINNER"]) assert.ok(cleanEligibilityProblems({ ...pkg, contentType, anomalyCheck: "REVIEW" }).includes("anomalyCheck REVIEW"), contentType);
  for (const contentType of ["NBA_PLAYER_STATS", "NBA_BOXSCORE", "NBA_DAILY_TOP5", "NBA_GAME_POST"]) assert.ok(cleanEligibilityProblems({ ...pkg, contentType }).includes("anomalyCheck missing"), contentType);
  assert.deepEqual(cleanEligibilityProblems({ ...pkg, contentType: "NBA_PLAYER_STATS", anomalyCheck: "PASS" }), []);
  assert.deepEqual(cleanEligibilityProblems(winnerMl), []);
});
test("a game post stays refused, on design 3 and with market data, even at PASS", () => {
  assert.ok(cleanEligibilityProblems({ ...pkg, contentType: "NBA_GAME_POST", variant: "401", designVersion: "3", containsMarketData: true, anomalyCheck: "PASS" }).includes("design version not allowed"));
});
test("a changed side, price or book is caught, and the price must be on the card", () => {
  const html = `<span data-cell="price">-115</span><span data-cell="p2">+120</span>`;
  assert.deepEqual(marketValueProblems(winnerMl, winnerMl.content, html), []);
  assert.deepEqual(marketValueProblems(tonightMl, tonightMl.content, html), []);
  for (const change of [{ price: -120 }, { side: "NYK" }, { book: "fanduel" }]) assert.ok(marketValueProblems(winnerMl, { ...winnerMl.content, ...change }, html).length);
  assert.ok(marketValueProblems(tonightMl, { games: tonightMl.content.games.slice(0, 1) }, html).length);
  assert.ok(marketValueProblems(winnerMl, winnerMl.content, `<span data-cell="price">-110</span>`).length);
});
test("approval must match the content, the caption and the image on disk", () => {
  const ok = new Map([["a", "s"]]);
  assert.deepEqual(approvalMatchProblems(entry, pkg, ok), []);
  assert.ok(approvalMatchProblems({ ...entry, contentSha256: "x" }, pkg, ok).length);
  assert.ok(approvalMatchProblems({ ...entry, caption: "other" }, pkg, ok).length);
  assert.ok(approvalMatchProblems(entry, pkg, new Map([["a", "tampered"]])).length);
});
test("only the banner goes; a changed value is caught", () => {
  const html = `<div class="draft">REVIEW</div><span data-cell="a">1</span>Model projections`;
  const clean = withoutBanner(html);
  assert.deepEqual(sameDisplayProblems(html, clean, "Model projections"), []);
  assert.ok(sameDisplayProblems(html, clean.replace(">1<", ">2<"), "Model projections").length);
  assert.throws(() => withoutBanner("no banner"));
});

test("model-only NBA game post: design 3 allowed only with two design-2 cards, no market data and no lines", async () => {
  const { cleanEligibilityProblems, isModelGamePost } = await import("./clean-export.mjs");
  const ok = { contentType: "NBA_GAME_POST", variant: "9-model", designVersion: "3", containsMarketData: false, anomalyCheck: "PASS", content: { eventId: "9", model: true, linesShown: 0, sourceDesignVersions: ["2", "2"] } };
  assert.equal(isModelGamePost(ok), true);
  assert.deepEqual(cleanEligibilityProblems(ok), []);
  for (const bad of [{ ...ok, variant: "9" }, { ...ok, containsMarketData: true }, { ...ok, content: { ...ok.content, linesShown: 2 } }, { ...ok, content: { ...ok.content, sourceDesignVersions: ["2", "3"] } }, { ...ok, content: { ...ok.content, model: false } }])
    assert.ok(cleanEligibilityProblems(bad).length, JSON.stringify(bad));
  assert.ok(cleanEligibilityProblems({ ...ok, anomalyCheck: "REVIEW" }).includes("anomalyCheck REVIEW"));
});
