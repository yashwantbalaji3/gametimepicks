import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

import { cleanEligibilityProblems } from "./clean-export.mjs";
import { buildExceptionPackage, EXCEPTION, exceptionCaption, exceptionPackageProblems, exceptionRunProblems, exceptionSlugs, hasStarted, limitationsOf, packageScopeProblems, quoteStatus } from "./publication-exception.mjs";
import { buildSocialPackage, CONTENT_TYPE, ELIGIBILITY, socialPackageViolations, ccCaptionProblems } from "./social-package.mjs";
import { selectCaptionPlayers } from "./nba-game-post.mjs";

const SHA = "a".repeat(64);
const review = (o = {}) => buildSocialPackage({
  sport: "nba", date: "2026-10-30", contentType: CONTENT_TYPE.NBA_DAILY_TOP5, variant: "pts", containsMarketData: true, designVersion: "2", snapshotRefs: [{ ref: "lane", sha256: SHA }], images: [{ path: "a.png", width: 1080, height: 1350, scale: 1, sha256: SHA }], caption: "c", ccCaption: "Top 5. Not betting advice.", verification: { passed: true, checks: [], cellsVerified: 1 }, window: { opensAt: "2026-10-30T21:15:00Z", closesAt: "2026-10-30T23:30:00Z" }, freshness: { asOf: "2026-10-30T21:15:00Z" }, eligibilityClass: ELIGIBILITY.OFFICIAL, disclosures: ["d"], title: "t", firstStartUtc: "2026-10-30T23:30:00Z", extraClaims: [{ key: "topN", display: "5", evidenceRef: "lane" }], cells: [["1.num", "33.1"], ["1.line", "O 30.5 -110"]],
  anomalyCheck: "REVIEW", anomalies: [{ playerId: "1", market: "pts", verdict: "STALE_PLAYER_ROSTER", detail: "x" }], content: { rows: [{ value: 33.14 }], quotedAt: "Oct 30, 11:59 AM ET" }, ...o,
});
const images = [{ path: "b.png", width: 1080, height: 1350, scale: 1, sha256: "b".repeat(64) }];
const emit = (pkg) => { const c = exceptionCaption(pkg, { evidenceRef: "lane" }); return buildExceptionPackage(pkg, { ...c, images, quoteAgeHours: 6.5, limitations: limitationsOf(pkg.anomalies, () => "A Player") }); };
const NOW = Date.parse("2026-10-30T22:40:00Z");

test("dated only: refuses without the flag, for another date, and after the Eastern day", () => {
  assert.deepEqual(exceptionRunProblems({ flag: true, nowMs: NOW }), []);
  assert.ok(exceptionRunProblems({ flag: false, nowMs: NOW }).length);
  assert.ok(exceptionRunProblems({ flag: true, date: "2026-10-31", nowMs: NOW }).length);
  assert.match(exceptionRunProblems({ flag: true, nowMs: Date.parse("2026-10-31T04:01:00Z") }).join(), /EXPIRED/);
  assert.deepEqual(exceptionRunProblems({ flag: true, nowMs: Date.parse("2026-10-31T03:59:00Z") }), []);
  assert.ok(packageScopeProblems(review({ date: "2026-10-31" })).length);
  assert.ok(packageScopeProblems(review({ sport: "nfl" })).length);
  assert.equal(exceptionSlugs(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]).length, 29);
});

test("anomalies stay, values match the review package, only allowed fields change", () => {
  const pkg = review(); const out = emit(pkg);
  assert.deepEqual(exceptionPackageProblems(out, pkg), []);
  assert.deepEqual(out.anomalies, pkg.anomalies);
  assert.equal(out.anomalyCheck, "EXCEPTION");
  assert.equal(out.reviewAnomalyCheck, "REVIEW");
  assert.deepEqual(out.content, pkg.content);
  assert.deepEqual(out.freshness, pkg.freshness);
  assert.deepEqual(out.commandCenter.claims.slice(0, pkg.commandCenter.claims.length), pkg.commandCenter.claims);
  assert.notEqual(out.contentSha256, pkg.contentSha256);
  assert.equal(out.approval.socialAuthorized, true);
  assert.deepEqual(out.publicationException, { ...EXCEPTION });
  assert.deepEqual(out.limitations.flaggedPlayers, [{ playerId: "1", name: "A Player", market: "pts", verdict: "STALE_PLAYER_ROSTER" }]);
  assert.deepEqual(out.commandCenter.captions.map((c) => c.id), ["A"]);
  for (const bad of [{ content: { rows: [{ value: 40 }] } }, { anomalies: [] }, { freshness: { asOf: "2026-10-30T22:00:00Z" } }]) assert.ok(exceptionPackageProblems({ ...out, ...bad }, pkg).length);
});

test("existing rules are not weakened", () => {
  const out = emit(review());
  assert.ok(socialPackageViolations(out).length, "the normal contract still refuses an authorized package");
  assert.ok(cleanEligibilityProblems({ ...review(), anomalyCheck: "REVIEW" }).length);
});

test("started games and stale quotes", () => {
  assert.equal(hasStarted(review(), NOW), false);
  assert.equal(hasStarted(review(), Date.parse("2026-10-30T23:30:00Z")), true);
  assert.deepEqual(quoteStatus(["2026-10-30T16:40:00Z"], NOW), { quoteAgeHours: 6, status: "OK" });
  assert.deepEqual(quoteStatus(["2026-10-30T19:00:00Z", "2026-10-30T16:00:00Z"], NOW), { quoteAgeHours: 6.67, status: "STALE_QUOTE" });
  assert.deepEqual(quoteStatus([], NOW), { quoteAgeHours: null, status: "OK" });
});

test("captions: option A, end #NBA, every digit a claim, no disclaimer", () => {
  const claims = (p, c) => [...p.commandCenter.claims, ...c.claims];
  const recap = review({ contentType: CONTENT_TYPE.RESULTS_RECAP, date: "2026-10-29", variant: null, anomalyCheck: null, anomalies: null, hasMiss: true, content: { correct: 2, missed: 1, gamesScheduled: 3 } });
  const r = exceptionCaption(recap, { evidenceRef: "x" });
  assert.deepEqual(ccCaptionProblems(r.caption, claims(recap, r), { hasMiss: true }), []);
  assert.throws(() => exceptionCaption({ ...recap, content: { correct: 3, missed: 0, gamesScheduled: 3 } }, { evidenceRef: "x" }));
  const model = exceptionCaption(review({ variant: "pts-model" }), { evidenceRef: "x" }).caption;
  assert.ok(!model.includes("OVER/UNDER") && model.endsWith("\n#NBA"));
  assert.ok(exceptionCaption(review(), { evidenceRef: "x" }).caption.includes("OVER/UNDER"));
});

test("committed 2026-10-30 slate: every game caption fits the rules", () => {
  const f = path.resolve(import.meta.dirname, "../../../public/data/nba/experimental-public/2026-10-30.json");
  if (!fs.existsSync(f)) return;
  const lane = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const g of lane.games) {
    const { players } = selectCaptionPlayers([...g.players.away, ...g.players.home], []);
    const pkg = review({ contentType: CONTENT_TYPE.NBA_GAME_POST, variant: "1", cells: [] });
    const { caption, claims } = exceptionCaption(pkg, { evidenceRef: "x", players, game: { awayName: g.away.name, homeName: g.home.name, winnerNickname: "Trail Blazers" } });
    assert.deepEqual(ccCaptionProblems(caption, claims), []);
  }
});
