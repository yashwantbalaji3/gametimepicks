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

import { buildNbaRecap, buildNflRecap, buildSocialPackage, recapFinalsProblems, recommendedPostTime, socialPackageViolations, CONTENT_TYPE, denominatorText } from "./social-package.mjs";
import { formatValue } from "../sports/nfl/forecast-view.mjs";
import { prepareNbaRecap, prepareNbaTop5, prepareNflRecap, prepareNflTop5, prepareNflWinners, winnerRow, writePackages } from "../../../scripts/social/render-social-pack.mjs";
import { packCaptionViolations, verifyPackCard } from "../../../scripts/social/social-pack-cards.mjs";

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
  assert.match(sun.cards[0].html, /NFL SUNDAY WINNER PREDICTIONS/);
  assert.match(sun.cards[0].html, /WEEK 8/);
  assert.match(sun.cards[0].html, /GAME TIME PICKS/);
  assert.match(sun.cards[0].html, /Model projections, not picks/);
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
    for (const c of p.cards) assert.deepEqual(verifyPackCard(c.html, c.cells), []);
  }
  const c = posts[0].cards[0];
  const k = Object.keys(c.cells)[0];
  assert.ok(verifyPackCard(c.html, { ...c.cells, [k]: "tampered" }).length);
  assert.ok(packCaptionViolations("a — b").length);
  assert.ok(packCaptionViolations("the winner").length);
});

/* ─────────── contract ─────────── */

const minimal = () => ({ sport: "nba", date: "2026-10-29", contentType: CONTENT_TYPE.RESULTS_RECAP, snapshotRefs: [{ ref: "a", sha256: "b".repeat(64) }], images: [{ path: "p", sha256: "c".repeat(64) }], caption: "x", verification: { passed: true, checks: [], cellsVerified: 1 }, window: { opensAt: "2026-10-30T10:00:00Z", closesAt: "2026-10-30T23:00:00Z" }, recommended: { recommendedAt: "2026-10-30T21:00:00Z" }, freshness: { asOf: AS_OF }, content: {} });
test("package contract: approval is fixed, dedupe is stable across content changes, bad packages refuse", () => {
  const a = buildSocialPackage(minimal());
  const b = buildSocialPackage({ ...minimal(), caption: "y" });
  assert.equal(a.approval.status, "FOUNDER_REVIEW_REQUIRED");
  assert.equal(a.dedupeId, b.dedupeId);
  assert.notEqual(a.contentSha256, b.contentSha256);
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
