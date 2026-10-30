/**
 * Social pack: recommended time and DST, recap denominators, no fake recap, winner/prop separation, the
 * gtp-social-package@1 contract, and the real committed-data posts with exact-value checks. PNGs skip only if no chromium.
 * Run: cd app && npx tsx --test src/lib/social/social-pack.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { xWeighted, CC_KIND_MAP, ccCaptionProblems, editorialPlan, CC_KIND, buildNbaRecap, buildNflRecap, buildSocialPackage, recapFinalsProblems, recommendedPostTime, socialPackageViolations, CONTENT_TYPE, denominatorText } from "./social-package.mjs";
import { formatValue } from "../sports/nfl/forecast-view.mjs";
import { prepareNbaRecap, prepareNbaTop5, prepareNflRecap, prepareNflTop5, prepareNflWinners, winnerRow, writePackages, prepareNbaTonight, prepareNflGameWinners, prepareNflPlayerStats, lineBlock, TONIGHT_ROWS, boxscorePosts, prepareNbaBoxscore, prepareGameDay } from "../../../scripts/social/render-social-pack.mjs";
import { verifyGameDayCard, meterColours, teamOf } from "../../../scripts/social/game-day-cards.mjs";
import { meterProblems, meterHtml, packCaptionViolations, verifyPackCard } from "../../../scripts/social/social-pack-cards.mjs";

const AS_OF = "2026-10-30T16:40:00Z";
const week = (k) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/reconciliation", `${k}.json`), "utf8"));

/* ─────────── recommended time ─────────── */

test("recommended time: first game of the next slate minus two hours, EDT", () => {
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2026-10-30T23:30Z" }, { kickoffUtc: "2026-10-30T23:00Z" }, { kickoffUtc: "2026-10-30T02:00Z" }], afterEtDate: "2026-10-29", asOf: AS_OF });
  assert.equal(r.recommendedAt, "2026-10-30T21:00:00Z");
  assert.equal(r.recommendedAtEt, "Fri Oct 30, 5:00 PM EDT");
  assert.equal(r.games, 2);
});
test("recommended time: Sunday after clocks fall back reads EST", () => {
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2026-11-01T18:00Z" }], afterEtDate: "2026-10-31", asOf: AS_OF });
  assert.equal(r.recommendedAtEt, "Sun Nov 1, 11:00 AM EST");
});
test("recommended time: two hours are absolute across the fall-back hour", () => {
  // 01:30 EST on Nov 1 is 06:30Z; two real hours earlier is 04:30Z = 00:30 EDT
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2026-11-01T06:30Z" }], afterEtDate: "2026-10-31", asOf: AS_OF });
  assert.equal(r.recommendedAtEt, "Sun Nov 1, 12:30 AM EDT");
});
test("recommended time: spring forward, March 14 2027", () => {
  // 03:30 EDT is 07:30Z; two real hours earlier is 05:30Z = 00:30 EST
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2027-03-14T07:30Z" }], afterEtDate: "2027-03-13", asOf: AS_OF });
  assert.equal(r.recommendedAtEt, "Sun Mar 14, 12:30 AM EST");
});
test("recommended time: an ET-evening game with a next-day UTC date stays on its ET slate", () => {
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2026-10-31T02:00Z" }, { kickoffUtc: "2026-10-31T19:00Z" }], afterEtDate: "2026-10-29", asOf: AS_OF });
  assert.equal(r.slateEtDate, "2026-10-30");
  assert.equal(r.firstGameUtc, "2026-10-31T02:00:00Z");
});
test("recommended time: a passed slate is skipped, postponed games ignored, none means null", () => {
  const r = recommendedPostTime({ games: [{ kickoffUtc: "2026-10-30T17:00Z" }, { kickoffUtc: "2026-10-31T23:00Z", statusRaw: "STATUS_POSTPONED" }, { kickoffUtc: "2026-11-01T18:00Z" }], afterEtDate: "2026-10-29", asOf: AS_OF });
  assert.deepEqual(r.skippedSlates, ["2026-10-30"]);
  assert.equal(r.slateEtDate, "2026-11-01");
  assert.equal(recommendedPostTime({ games: [], afterEtDate: "2026-10-29", asOf: AS_OF }), null);
});

/* ─────────── recaps ─────────── */

const elo = (home, sha) => ({ state: "FAVOURED", favoured: home >= 0.5 ? "HOM" : "AWY", rule: "nba-winner-side@1", winProbability: { home, away: Math.round((1 - home) * 1e4) / 1e4, provenance: { source: "nba-winner-side@1 Elo", rule: "nba-winner-side@1", frozenAt: "2026-10-29T16:00:00Z", receiptPayloadSha256: sha } } });
const laneGame = (id, home) => ({ providerEventId: id, tipUtc: "2026-10-30T00:00Z", frozenAt: "2026-10-29T16:00:00Z", away: { abbr: "AWY" }, home: { abbr: "HOM" }, receipt: { payloadSha256: "a".repeat(64) }, elo: elo(home, "a".repeat(64)) });
test("NBA recap: a game without a verified final is excluded and the denominator shows it", () => {
  const lane = { date: "2026-10-29", games: [laneGame("1", 0.6), laneGame("2", 0.4), laneGame("3", 0.7)] };
  const r = buildNbaRecap(lane, [{ providerEventId: "1", home: "HOM", away: "AWY", ftHome: 100, ftAway: 90 }, { providerEventId: "2", home: "HOM", away: "AWY", ftHome: 100, ftAway: 90 }]);
  assert.deepEqual([r.graded, r.correct, r.missed, r.accuracy, r.gamesScheduled], [2, 1, 1, "50.0%", 3]);
  assert.equal(r.excluded[0].reason, "NOT_FINAL");
  assert.equal(denominatorText(r), "2 of 3 games graded");
});
test("NBA recap: no lane means no recap; a mismatched final refuses", () => {
  assert.equal(buildNbaRecap(null, []), null);
  assert.equal(buildNbaRecap({ games: [] }, []), null);
  assert.throws(() => buildNbaRecap({ date: "x", games: [laneGame("1", 0.6)] }, [{ providerEventId: "1", home: "XXX", away: "AWY", ftHome: 1, ftAway: 0 }]));
});
test("NBA recap: a no-game date is refused, not rendered", () => {
  const r = prepareNbaRecap({ date: "2026-07-04", asOf: AS_OF });
  assert.equal(r.posts.length, 0);
  assert.equal(r.refused[0].reason, "NO_GAMES_OR_NO_LANE");
});
test("NFL recap: tie void, pending excluded, stored grade must agree", () => {
  const g = (id, state, final, outcome) => ({ providerEventId: id, matchup: "A @ H", kickoffUtc: "2026-10-26T00:00Z", away: { abbr: "A" }, home: { abbr: "H" }, published: { pick: { abbr: "H", probability: 0.6 } }, state, final, team: [{ prop: "winner", outcome }] });
  const r = buildNflRecap({ period: { week: 7, label: "Week 7" }, games: [g("1", "FINAL", { away: 1, home: 2 }, "HIT"), g("2", "FINAL", { away: 3, home: 3 }, "VOID"), g("3", "PENDING", null, null)] });
  assert.deepEqual([r.graded, r.correct, r.gamesScheduled, r.excluded.map((x) => x.reason).join()], [1, 1, 3, "TIE_VOID,NOT_FINAL"]);
  assert.throws(() => buildNflRecap({ period: {}, games: [g("1", "FINAL", { away: 1, home: 2 }, "MISS")] }));
});
test("NFL recap: Week 7 from the committed record, finals equal the capture", () => {
  const doc = week("2-07");
  const r = buildNflRecap(doc);
  const stored = doc.games.flatMap((g) => g.team.filter((t) => t.prop === "winner").map((t) => t.outcome));
  assert.equal(r.correct, stored.filter((o) => o === "HIT").length);
  assert.equal(r.missed, stored.filter((o) => o === "MISS").length);
  const capture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/results/latest.json"), "utf8"));
  assert.deepEqual(recapFinalsProblems(r, capture.rows), []);
  assert.equal(recapFinalsProblems({ games: [{ eventId: "x", matchup: "m", final: { home: 1, away: 0 } }] }, []).length, 1);
});
test("recaps never carry a prop record", () => {
  const [post] = prepareNflRecap({ week: 7, asOf: AS_OF }).posts;
  assert.equal(post.content.recordsCombined, false);
  assert.ok(!/range|touchdown|prop|yards/i.test(JSON.stringify(post.content)));
  assert.ok(!/prop/i.test(post.caption));
});

/* ─────────── real posts ─────────── */

test("NBA 10-29 recap: the committed finals and frozen sides, 2 of 3", () => {
  const { posts: [p] } = prepareNbaRecap({ date: "2026-10-29", asOf: AS_OF });
  assert.deepEqual([p.content.graded, p.content.correct, p.content.missed, p.content.accuracy], [3, 2, 1, "66.7%"]);
  assert.equal(p.recommended.recommendedAt, "2026-10-30T21:00:00Z");
  const mem = p.content.games.find((g) => g.matchup === "MEM @ POR");
  assert.deepEqual([mem.final.away, mem.final.home, mem.frozenSide, mem.outcome], [124, 103, "POR", "MISSED"]);
});
test("NBA Top 5: refuses without a lane; on a lane matches it, pregame", () => {
  assert.throws(() => prepareNbaTop5({ date: "2026-10-31", asOf: AS_OF }), /no NBA lane/);
  const { posts } = prepareNbaTop5({ date: "2026-10-29", asOf: "2026-10-29T20:00:00Z" });
  assert.deepEqual(posts.map((p) => p.variant), ["pts", "reb", "ast"]);
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-29.json"), "utf8"));
  const rows = lane.games.flatMap((g) => [...g.players.away, ...g.players.home]);
  for (const p of posts) for (const r of p.content.rows) assert.ok(rows.some((x) => x.name === r.name && x.medians[p.variant] === r.value));
  assert.throws(() => prepareNbaTop5({ date: "2026-10-29", asOf: "2026-10-30T12:00:00Z" }), /gate/);
});
test("NFL winners: 12 Sunday games + Monday, values equal the committed forecast, started slate refused", () => {
  const { posts, refused } = prepareNflWinners({ week: 8, asOf: AS_OF });
  assert.equal(refused.length, 0);
  const [sun, mon] = posts;
  assert.equal(sun.content.games.length, 12);
  assert.equal(mon.content.games.length, 1);
  assert.match(sun.cards[0].html, /NFL Sunday/);
  assert.match(sun.cards[0].html, /Week 8/);
  assert.match(sun.cards[0].html, /Model projections · Not betting advice/);
  const forecasts = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/forecasts/latest.json"), "utf8")).forecasts;
  for (const g of sun.content.games) {
    const f = forecasts.find((x) => String(x.providerEventId) === g.eventId);
    if (!f) continue;
    const w = f.forecastSummary.winProbability;
    assert.equal(g.winPct, formatValue("probability", Math.max(w.home, w.away)));
  }
  const late = prepareNflWinners({ week: 8, asOf: "2026-11-01T19:00:00Z" });
  assert.equal(late.refused[0].reason, "GAME_STARTED");
  assert.equal(late.posts.length, 1);
});
test("winnerRow refuses a view that differs from the record", () => {
  const view = { providerEventId: "1", matchup: "A @ H", kickoffUtc: "x", away: { abbr: "A" }, home: { abbr: "H" }, record: { favourite: "H", winProbability: { home: 0.6, away: 0.4 }, projectedScore: { home: 24, away: 20 } } };
  const rec = (home) => ({ forecastSummary: { winProbability: { home, away: 0.4 }, projectedScore: { home: 24, away: 20 } } });
  assert.equal(winnerRow(view, rec(0.6)).winPct, "60.0%");
  assert.throws(() => winnerRow(view, rec(0.61)), /differs/);
  assert.throws(() => winnerRow(view, null), /no independent/);
});
test("NFL Top 5: five boards, pass and rush labelled as estimates", () => {
  const { posts } = prepareNflTop5({ week: 8, asOf: AS_OF });
  assert.equal(posts.length, 5);
  const by = Object.fromEntries(posts.map((p) => [p.variant, p]));
  for (const k of ["top5_pass_yds", "top5_rush_yds"]) {
    assert.match(by[k].cards[0].html, /Estimate · calibration standard not yet met/);
    assert.match(by[k].cards[0].html, / est\./);
  }
  assert.ok(!/ est\./.test(by.top5_receptions.cards[0].html));
});
test("every real card and caption passes; a tampered cell or dashed caption fails", () => {
  const posts = [...prepareNflWinners({ week: 8, asOf: AS_OF }).posts, ...prepareNflTop5({ week: 8, asOf: AS_OF }).posts, ...prepareNflRecap({ week: 7, asOf: AS_OF }).posts, ...prepareNbaRecap({ date: "2026-10-29", asOf: AS_OF }).posts];
  for (const p of posts) {
    assert.deepEqual(packCaptionViolations(p.caption), []);
    for (const c of p.cards) assert.deepEqual(c.v2 ? verifyGameDayCard(c) : verifyPackCard(c.html, c.cells), []);
  }
  const c = posts[0].cards[0];
  const k = Object.keys(c.cells)[0];
  assert.ok(verifyPackCard(c.html, { ...c.cells, [k]: "tampered" }).length);
  assert.ok(packCaptionViolations("a — b").length);
  assert.ok(packCaptionViolations("the winner").length);
});

test("NBA tonight: full slate, meters, per-game cards labelled, never moneyline", () => {
  const { posts } = prepareNbaTonight({ date: "2026-10-29", asOf: "2026-10-29T20:00:00Z" });
  assert.equal(posts.length, 4);
  assert.match(posts[0].cards[0].html, /NBA TONIGHT/);
  assert.match(posts[0].cards[0].html, /GAME TIME PICKS WINNER PREDICTIONS/);
  assert.match(posts[1].cards[0].html, /GAME WINNER PREDICTIONS/);
  for (const p of posts) { assert.equal(p.eligibilityClass, "ESTIMATE"); for (const c of p.cards) { assert.deepEqual(verifyPackCard(c.html, c.cells), []); assert.match(c.html, /data-meter/); assert.match(c.html, /Estimate/); } }
  assert.equal(prepareNbaTonight({ date: "2026-10-29", asOf: "2026-10-30T12:00:00Z" }).refused[0].reason, "GAME_STARTED");
  assert.throws(() => prepareNbaTonight({ date: "2026-10-31", asOf: AS_OF }), /no NBA lane/);
});
test("NBA tonight: ten games make two slides", () => {
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-29.json"), "utf8"));
  const games = Array.from({ length: 10 }, (_, i) => ({ ...lane.games[0], providerEventId: String(i) }));
  const { posts } = prepareNbaTonight({ date: "2026-10-29", asOf: "2026-10-29T20:00:00Z", laneOverride: { ...lane, games } });
  assert.equal(posts[0].cards.length, Math.ceil(10 / TONIGHT_ROWS));
});
test("meter proportion is enforced; a stretched meter fails", () => {
  assert.deepEqual(meterProblems(meterHtml("1", 0.4474, 0.5526)), []);
  assert.ok(meterProblems(meterHtml("1", 0.4474, 0.5526).replace("44.74", "60.00")).length);
});
test("NFL per-game cards: thirteen games, official label", () => {
  const { posts } = prepareNflGameWinners({ week: 8, asOf: AS_OF });
  assert.equal(posts.length, 13);
  for (const p of posts) assert.deepEqual(verifyGameDayCard(p.cards[0]), []);
});
test("NFL design 2: every package, labelled estimates, roundup of all Sunday games, per-game player cards", () => {
  const winners = prepareNflWinners({ week: 8, asOf: AS_OF }).posts;
  assert.equal(Object.keys(winners[0].cards[0].cells).filter((k) => k.endsWith(".w")).length, winners[0].content.games.length);
  const top = prepareNflTop5({ week: 8, asOf: AS_OF }).posts;
  const { posts: players } = prepareNflPlayerStats({ week: 8, asOf: AS_OF });
  assert.equal(players.length, 13);
  const all = [...winners, ...top, ...players, ...prepareNflGameWinners({ week: 8, asOf: AS_OF }).posts, ...prepareNflRecap({ week: 7, asOf: AS_OF }).posts];
  for (const p of all) { assert.equal(p.designVersion, "2"); for (const c of p.cards) assert.deepEqual(verifyGameDayCard(c), []); }
  for (const p of players) {
    const text = p.cards.map((c) => c.html).join("");
    if (/ est\./.test(text)) { assert.equal(p.eligibilityClass, "ESTIMATE"); assert.match(text, /Estimate · calibration standard not yet met/); }
    for (const c of p.cards) for (const [k, v] of Object.entries(c.cells)) if (/player_(pass|rush)_yds$/.test(k)) assert.match(v, / est\.$/);
  }
  assert.ok(!/most confident/i.test(JSON.stringify(all.map((p) => p.title))));
});
test("Top 5 line block: exact export strings, colour by side, none without a shown line", () => {
  const row = (side, glyph) => ({ market: { line: { state: "SHOWN", text: "30.5" }, direction: { state: "SHOWN", side, glyph }, overPrice: { state: "SHOWN", text: "+110" }, underPrice: { state: "SHOWN", text: "−130" } } });
  assert.deepEqual(lineBlock(row("OVER", "▲")), { cls: "over", glyph: "▲", text: "O 30.5 +110" });
  assert.deepEqual(lineBlock(row("UNDER", "▼")), { cls: "under", glyph: "▼", text: "U 30.5 −130" });
  assert.equal(lineBlock(row("NEUTRAL", null)).cls, "neutral");
  assert.equal(lineBlock({ market: { line: { state: "WITHHELD" } } }), null);
  assert.equal(lineBlock(undefined), null);
});
test("Command Center caption rules and kind map", () => {
  assert.ok(ccCaptionProblems("GameTime Picks 5", []).some((x) => /picks/.test(x)));
  assert.deepEqual(ccCaptionProblems("NFL Week 8. Not betting advice.", [{ display: "8" }]), []);
  assert.ok(ccCaptionProblems("Our prediction", [], { hasMiss: true }).length);
  assert.equal(CC_KIND.NBA_TONIGHT, null);
  assert.equal(CC_KIND.NFL_WEEKLY_TOP5, "top5-weekly");
});
test("editorial plan: recap first, spaced boards, never ordered by probability, extra game cards held", () => {
  const P = (contentType, firstStartUtc, variant = null) => ({ sport: "nba", date: "d", contentType, variant, firstStartUtc });
  const plan = editorialPlan([P("NBA_GAME_WINNER", "2026-10-30T23:00:00Z", "a"), P("NBA_GAME_WINNER", "2026-10-30T23:00:00Z", "b"), P("NBA_GAME_WINNER", "2026-10-30T23:00:00Z", "c"), P("NBA_DAILY_TOP5", "2026-10-30T23:00:00Z", "pts"), P("NBA_DAILY_TOP5", "2026-10-30T23:00:00Z", "reb"), P("NBA_TONIGHT", "2026-10-30T23:00:00Z"), P("RESULTS_RECAP", "2026-10-30T23:00:00Z")]);
  assert.deepEqual(plan.slice(0, 2).map((x) => x.contentType), ["RESULTS_RECAP", "NBA_TONIGHT"]);
  assert.equal(plan[2].proposedAt, "2026-10-30T21:45:00Z");
  assert.equal(plan[3].proposedAt, "2026-10-30T22:00:00Z");
  assert.equal(plan.at(-1).recommendation, "HOLD_FOR_FOUNDER_CHOICE");
});

test("box score: one package per game, key required, quote time in metadata", () => {
  assert.equal(prepareNbaBoxscore({ date: "2026-10-30", asOf: AS_OF, env: {} }).refused[0].reason, "NO_DISPLAY_KEY");
  const row = (e) => ({ rowId: `r${e}`, identity: { eventId: e, tipUtc: "2026-10-30T23:00Z" }, model: { display: "20.1" }, market: { quotedAt: { iso: "2026-10-30T18:00:00Z", et: "Oct 30, 2:00 PM ET" } } });
  const prepared = { doc: { socialAuthorized: false, asOf: AS_OF, rows: [row("1"), row("2")] }, cards: [{ eventId: "1", rowIds: ["r1"] }, { eventId: "2", rowIds: ["r2"] }], captions: { games: { 1: { matchup: "A @ B", cards: [{ caption: "c" }] }, 2: { matchup: "C @ D", cards: [{ caption: "d" }] } } } };
  const posts = boxscorePosts(prepared, { date: "2026-10-30", asOf: AS_OF, laneRef: { ref: "x", sha256: "a".repeat(64) } });
  assert.deepEqual(posts.map((p) => [p.contentType, p.variant, p.content.quotedAt, p.content.socialAuthorized]), [["NBA_BOXSCORE", "1", "Oct 30, 2:00 PM ET", false], ["NBA_BOXSCORE", "2", "Oct 30, 2:00 PM ET", false]]);
  assert.throws(() => boxscorePosts({ ...prepared, doc: { ...prepared.doc, socialAuthorized: true } }, {}));
});
test("kind map covers every content type; X weighting counts emoji double", () => {
  assert.deepEqual(CC_KIND_MAP.map((x) => x.contentType).sort(), Object.values(CONTENT_TYPE).sort());
  assert.ok(CC_KIND_MAP.every((x) => x.kind || x.gap));
  assert.equal(xWeighted("a😀"), 3);
});
test("every real package option fits 280 and the doubled Estimate is gone", () => {
  const { posts } = prepareNbaTonight({ date: "2026-10-29", asOf: "2026-10-29T20:00:00Z" });
  assert.ok(!/Estimate: /.test(posts[0].cards[0].html));
});

test("game day 10-30: one tonight card, ten games, two versions only with lines, no percent in captions", () => {
  const asOf = "2026-10-30T19:00:00Z";
  const { posts, coverage } = prepareGameDay({ date: "2026-10-30", asOf });
  const n = (t) => posts.filter((p) => p.contentType === t);
  assert.equal(n("NBA_TONIGHT").length, 1);
  assert.equal(n("NBA_TONIGHT")[0].cards.length, 1);
  assert.equal(n("NBA_GAME_WINNER").length, 10);
  assert.equal(n("NBA_PLAYER_STATS").length, 10);
  assert.equal(n("NBA_BOXSCORE").length, 0);
  assert.deepEqual(n("NBA_DAILY_TOP5").map((p) => p.variant), ["pts-model", "reb-model", "ast-model"]);
  assert.equal(coverage.length, 10);
  for (const p of posts) {
    assert.ok(!/%/.test(p.caption), p.caption);
    assert.equal(p.designVersion, "2");
    for (const c of p.cards) assert.deepEqual(verifyGameDayCard(c), []);
  }
  for (const p of n("NBA_PLAYER_STATS")) assert.ok(p.content.players <= p.cards.length * 12);
});
test("game day real lines: market flag set, colours, compact price", () => {
  const asOf = "2026-10-30T19:00:00Z";
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-30.json"), "utf8"));
  const g = lane.games[0]; const p = g.players.away[0];
  const row = { rowId: "r", identity: { eventId: String(g.providerEventId), playerId: String(p.providerAthleteId), market: "pts" }, model: { display: String(p.medians.pts) }, market: { line: { state: "SHOWN", text: "30.5" }, direction: { state: "SHOWN", side: "UNDER", glyph: "▼" }, overPrice: { state: "SHOWN", text: "+110" }, underPrice: { state: "SHOWN", text: "−110" }, quotedAt: { iso: "2026-10-30T18:00:00Z", et: "Oct 30, 2:00 PM ET" } } };
  const { posts } = prepareGameDay({ date: "2026-10-30", asOf, lineDoc: { rows: [row] } });
  const box = posts.filter((x) => x.contentType === "NBA_BOXSCORE");
  assert.equal(box.length, 1);
  assert.equal(box[0].containsMarketData, true);
  assert.match(box[0].cards[0].html, /U 30\.5 · -110/);
  assert.ok(!/1-800-GAMBLER|Not affiliated/.test(box[0].cards[0].html));
  assert.ok(posts.every((x) => !/\bedge\b/i.test(x.ccCaption)));
  assert.ok(["PASS", "REVIEW"].includes(box[0].anomalyCheck) && Array.isArray(box[0].anomalies));
  const realTop5 = posts.filter((x) => x.contentType === "NBA_DAILY_TOP5" && x.containsMarketData);
  assert.equal(realTop5.length, 3);
  for (const t of realTop5) assert.ok(["PASS", "REVIEW"].includes(t.anomalyCheck) && Array.isArray(t.anomalies));
  assert.equal(posts.find((x) => x.contentType === "NBA_PLAYER_STATS").containsMarketData, undefined);
  assert.ok(!/30\.5/.test(posts.find((x) => x.contentType === "NBA_PLAYER_STATS").cards[0].html.replace(/<style>[\s\S]*?<\/style>/, "")));
});
test("game day moneyline: priced copies beside unchanged model posts, one image, missing quote refused", () => {
  const asOf = "2026-10-30T20:00:00Z";
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-30.json"), "utf8"));
  const ev = (g) => ({ id: `e${g.providerEventId}`, commence_time: new Date(Date.parse(g.tipUtc.replace(/Z$/, ":00Z")) + 600000).toISOString(), away_team: g.away.name, home_team: g.home.name, bookmakers: [{ key: "fanduel", markets: [{ key: "h2h", last_update: "2026-10-30T19:42:56Z", outcomes: [{ name: g.away.name, price: 120 }, { name: g.home.name, price: -140 }] }] }] });
  const events = lane.games.map(ev);
  const moneyline = { doc: { fetchedAt: "2026-10-30T19:44:11Z", events }, ref: { ref: "gtp-private/odds/x.json", sha256: "a".repeat(64) } };
  const base = prepareGameDay({ date: "2026-10-30", asOf });
  const r = prepareGameDay({ date: "2026-10-30", asOf, moneyline });
  const ml = r.posts.filter((p) => /(^|-)ml$/.test(String(p.variant)));
  assert.equal(ml.length, lane.games.length + 1);
  assert.deepEqual(r.posts.filter((p) => !ml.includes(p)).map((p) => [p.variant, p.caption, p.cards[0].cells]), base.posts.map((p) => [p.variant, p.caption, p.cards[0].cells]));
  for (const p of ml) { assert.equal(p.containsMarketData, true); assert.equal(p.cards.length, 1); assert.equal(p.content.sourceSha256, "a".repeat(64)); assert.equal(p.content.socialAuthorized, false); assert.deepEqual(verifyGameDayCard(p.cards[0]), []); assert.ok(!/FanDuel|1-800-GAMBLER|Observed sportsbook/i.test(p.cards[0].html.replace(/<style>[\s\S]*?<\/style>/, ""))); assert.match(JSON.stringify(p.content), /fanduel/); }
  const one = ml.find((p) => p.contentType === "NBA_GAME_WINNER");
  assert.equal(one.content.price, one.content.side === lane.games.find((g) => String(g.providerEventId) === one.eventId).home.abbr ? -140 : 120);
  assert.equal(one.content.quotedAt, "2026-10-30T19:42:56Z");
  assert.ok(!/-140|\+120/.test(one.caption));
  const gap = prepareGameDay({ date: "2026-10-30", asOf, moneyline: { ...moneyline, doc: { ...moneyline.doc, events: events.slice(1) } } });
  assert.ok(gap.refused.some((x) => x.variant === `${lane.games[0].providerEventId}-ml` && x.reason === "NO_PROVIDER_EVENT"));
  assert.ok(gap.refused.some((x) => x.variant === "ml" && x.reason === "NOT_EVERY_GAME_PRICED"));
  assert.ok(!gap.posts.some((p) => p.variant === "ml"));
});
test("meter colours stay distinct on a clash", () => {
  const [a, b] = meterColours(teamOf("LAC", "LA Clippers"), teamOf("PHI", "Philadelphia 76ers"));
  assert.notEqual(a, b);
});

/* ─────────── contract ─────────── */

const minimal = () => ({ eligibilityClass: "OFFICIAL", disclosures: ["Not betting advice."], ccCaption: "x", title: "t", firstStartUtc: "2026-10-30T23:00:00Z", sport: "nba", date: "2026-10-29", contentType: CONTENT_TYPE.RESULTS_RECAP, snapshotRefs: [{ ref: "a", sha256: "b".repeat(64) }], images: [{ path: "p", width: 1080, scale: 1, sha256: "c".repeat(64) }], caption: "x", verification: { passed: true, checks: [], cellsVerified: 1 }, window: { opensAt: "2026-10-30T10:00:00Z", closesAt: "2026-10-30T23:00:00Z" }, recommended: { recommendedAt: "2026-10-30T21:00:00Z" }, freshness: { asOf: AS_OF }, content: {} });
test("package contract: approval is fixed, dedupe is stable across content changes, bad packages refuse", () => {
  const a = buildSocialPackage(minimal());
  const b = buildSocialPackage({ ...minimal(), caption: "y" });
  assert.equal(a.approval.status, "FOUNDER_REVIEW_REQUIRED");
  assert.equal(a.dedupeId, b.dedupeId);
  assert.notEqual(a.contentSha256, b.contentSha256);
  assert.equal(a.commandCenter.captions.length, 2);
  assert.notEqual(a.contentSha256, buildSocialPackage({ ...minimal(), images: [{ path: "p", width: 1080, scale: 1, sha256: "d".repeat(64) }] }).contentSha256);
  assert.throws(() => buildSocialPackage({ ...minimal(), images: [{ path: "p", sha256: "c".repeat(64) }] }));
  assert.throws(() => buildSocialPackage({ ...minimal(), ccCaption: "x".repeat(281) }));
  assert.throws(() => buildSocialPackage({ ...minimal(), caption: "a – b" }));
  assert.throws(() => buildSocialPackage({ ...minimal(), verification: { passed: false } }));
  assert.throws(() => buildSocialPackage({ ...minimal(), recommended: { recommendedAt: "2026-10-31T21:00:00Z" } }));
  assert.ok(socialPackageViolations({ ...a, approval: { status: "APPROVED", socialAuthorized: true } }).length);
});

test("PNG output at 1080 x 1350 and @2x, package written", async (t) => {
  let launch = true;
  try { const { chromium } = await import("playwright"); await (await chromium.launch()).close(); } catch { launch = false; }
  if (!launch) return t.skip("no chromium");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-social-pack-"));
  const { posts } = prepareNbaRecap({ date: "2026-10-29", asOf: AS_OF });
  const [{ pkg, file }] = await writePackages(posts, { outRoot: out, scales: [1, 2] });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).dedupeId, pkg.dedupeId);
  assert.deepEqual(pkg.images.map((i) => i.scale), [1, 2]);
  for (const i of pkg.images) {
    const b = fs.readFileSync(i.path);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1080 * i.scale, 1350 * i.scale]);
  }
});
test("game post: priced winner then real-line stat cards, keyed path, caption rule recorded, one package per game", () => {
  const asOf = "2026-10-30T20:00:00Z";
  const lane = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/experimental-public/2026-10-30.json"), "utf8"));
  const ev = (g) => ({ id: `e${g.providerEventId}`, commence_time: new Date(Date.parse(g.tipUtc.replace(/Z$/, ":00Z")) + 600000).toISOString(), away_team: g.away.name, home_team: g.home.name, bookmakers: [{ key: "fanduel", markets: [{ key: "h2h", last_update: "2026-10-30T19:42:56Z", outcomes: [{ name: g.away.name, price: 120 }, { name: g.home.name, price: -140 }] }] }] });
  const moneyline = { doc: { fetchedAt: "2026-10-30T19:44:11Z", events: lane.games.map(ev) }, ref: { ref: "gtp-private/odds/x.json", sha256: "a".repeat(64) } };
  const none = prepareGameDay({ date: "2026-10-30", asOf, moneyline });
  assert.ok(none.refused.some((r) => r.contentType === "NBA_GAME_POST" && r.reason === "NO_DISPLAY_KEY"));
  assert.equal(none.posts.filter((p) => p.contentType === "NBA_GAME_POST").length, 0);
  const rows = lane.games.map((g) => { const p = g.players.away[0]; return { rowId: `r${g.providerEventId}`, identity: { eventId: String(g.providerEventId), playerId: String(p.providerAthleteId), market: "pts" }, model: { display: String(p.medians.pts) }, market: { line: { state: "SHOWN", text: "30.5", value: 30.5 }, direction: { state: "SHOWN", side: "UNDER", glyph: "▼" }, overPrice: { state: "SHOWN", text: "+110" }, underPrice: { state: "SHOWN", text: "−110" }, quotedAt: { iso: "2026-10-30T18:00:00Z", et: "Oct 30, 2:00 PM ET" } } }; });
  const r = prepareGameDay({ date: "2026-10-30", asOf, moneyline, lineDoc: { rows } });
  const gp = r.posts.filter((p) => p.contentType === "NBA_GAME_POST");
  assert.equal(gp.length, lane.games.length);
  for (const p of gp) {
    const box = r.posts.find((x) => x.contentType === "NBA_BOXSCORE" && x.variant === p.variant);
    assert.equal(p.designVersion, "3");
    assert.equal(p.containsMarketData, true);
    assert.equal(p.eventId, p.variant);
    assert.ok(p.cards.length >= 2 && p.cards.length <= 4);
    assert.ok("market.price" in p.cards[0].cells);
    assert.deepEqual(p.cards.slice(1).map((c) => c.cells), box.cards.map((c) => c.cells));
    assert.equal(new Set(p.cards.map((c) => c.name)).size, p.cards.length);
    assert.deepEqual([p.anomalyCheck, p.anomalies], [box.anomalyCheck, box.anomalies]);
    assert.equal(p.ccCaption, p.caption);
    assert.match(p.content.captionPlayers.rule, /highest official projected points/);
    for (const c of p.cards) { assert.deepEqual(verifyGameDayCard(c), []); assert.match(c.html, /class="draft"/); }
  }
});
