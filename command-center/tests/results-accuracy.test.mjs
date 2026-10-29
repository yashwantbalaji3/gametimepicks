/**
 * "Predicted winner vs final" (recap/results-accuracy.mjs + render/social-results.mjs, gtp-social-results@1.0).
 * Recomputed from committed data at pinned commits: the official forecast is the published lane's Elo side, the final
 * is the write-once finals record. Excluded games are listed, never counted; misses are drawn like hits; the design is
 * its own unapproved version.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO_ROOT, canonicalJson, sha256 } from "../lib/util.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { resultsAccuracy, resultsAccuracyCaptions, validateResultsAccuracyCaption, lanePath, finalsPath } from "../recap/results-accuracy.mjs";
import { validateCaption } from "../recap/caption-validator.mjs";
import { resultsHtml, renderResults, RESULTS_TEMPLATE } from "../render/social-results.mjs";
import { SOCIAL_TEMPLATE, SOCIAL_HANDLE, DISCLOSURES } from "../render/social-v2.mjs";
import { FORBIDDEN_TERMS } from "../../app/scripts/build-mlb-social-content.mjs";

const FULL = "d367dd50fac6"; // origin/main 2026-10-29 05:40Z results capture: the Oct 28 lane + all 12 finals
const PARTIAL = "2404817b2b20"; // ~00:30 ET Oct 29: the lane + 3 of 12 finals
const has = (c) => { try { execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } };
const skipFull = has(FULL) ? false : "commit missing";
const skipPartial = has(PARTIAL) ? false : "commit missing";
const DATE = "2026-10-28";
const visibleText = (html) => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();

test("Oct 28 recomputed from committed data: 8 of 12 correct, 4 missed (ATL, MIN, OKC, LAC), nothing excluded", { skip: skipFull }, async () => {
  const src = gitDataSource(REPO_ROOT, FULL);
  const b = await resultsAccuracy({ src, date: DATE });
  assert.equal(b.ok, true);
  assert.deepEqual([b.correct, b.total, b.missed, b.excluded.length, b.period, b.sport], [8, 12, 4, 0, "single day", "NBA"]);
  assert.deepEqual([b.accuracyDisplay, b.sampleSize.days, b.sampleSize.games], ["66.7%", 1, 12]);
  assert.ok(Math.abs(b.accuracy - 8 / 12) < 1e-12);
  assert.deepEqual(b.games.filter((g) => !g.correct).map((g) => g.predictedWinner), ["ATL", "MIN", "OKC", "LAC"]);
  const mia = b.games.find((g) => g.eventId === "401909881");
  assert.deepEqual([mia.away.abbr, mia.finalAway, mia.home.abbr, mia.finalHome, mia.predictedWinner, mia.estimateDisplay, mia.actualWinner, mia.correct], ["MIA", 129, "ATL", 117, "ATL", "66%", "MIA", false]);
  // WSH (lane, ESPN abbr) vs WAS (finals tricode) is one team: matched on the finals' espnAbbr
  assert.equal(b.games.find((g) => g.eventId === "401909882").correct, true);
  // every game was frozen before its tip
  for (const g of b.games) assert.ok(Date.parse(g.frozenAt) < Date.parse(g.tipUtc), g.eventId);
  // traceable: both sources pinned to the commit with their sha256, recomputed here from git
  assert.deepEqual(b.sources.map((s) => s.path), [lanePath(DATE), finalsPath("2026-27")]);
  for (const s of b.sources) {
    assert.equal(s.commit, src.commit);
    assert.equal(s.sha256, sha256(execFileSync("git", ["show", `${src.commit}:${s.path}`], { cwd: REPO_ROOT })));
  }
  for (const g of b.games) for (const k of ["final", "predicted", "correct"]) assert.ok(b.claims.some((c) => c.key === `${g.eventId}.${k}` && String(c.evidenceRef).includes("#")), `${g.eventId}.${k}`);
  // never a private or internal path
  assert.ok(b.sources.every((s) => s.path.startsWith("app/public/")));
  // deterministic: same commit → same bundle
  assert.equal(canonicalJson(await resultsAccuracy({ src: gitDataSource(REPO_ROOT, FULL), date: DATE })), canonicalJson(b));
});

test("partial night: games without an official final are excluded with a reason, never counted or shown as misses", { skip: skipPartial }, async () => {
  const b = await resultsAccuracy({ src: gitDataSource(REPO_ROOT, PARTIAL), date: DATE });
  assert.deepEqual([b.correct, b.total, b.missed, b.excluded.length], [2, 3, 1, 9]);
  assert.ok(b.excluded.every((x) => x.code === "NO_OFFICIAL_FINAL" && x.reason && x.game));
  const html = resultsHtml(b);
  assert.equal((html.match(/data-outcome=/g) ?? []).length, 3);
  assert.match(html, /Not graded:/);
});

test("exclusions: no published side, frozen after tip, no forecast, conflicting final — each listed, none counted", { skip: skipFull }, async () => {
  const real = gitDataSource(REPO_ROOT, FULL);
  const lane = JSON.parse(real.read(lanePath(DATE)));
  const fin = JSON.parse(real.read(finalsPath("2026-27")));
  lane.games[0].elo = { ...lane.games[0].elo, state: "NO_SIDE", favoured: null }; // MIA @ ATL
  lane.games[1].frozenAt = "2026-10-28T23:30:00Z"; // WSH @ CLE, after its 23:00Z tip
  const dropped = lane.games.splice(2, 1)[0]; // CHA @ DET: final exists, forecast does not
  fin.conflicts = [...(fin.conflicts ?? []), { providerEventId: "401909884", note: "test" }]; // PHI @ IND
  const src = { ...real, read: (p) => (p === lanePath(DATE) ? JSON.stringify(lane) : p === finalsPath("2026-27") ? JSON.stringify(fin) : real.read(p)) };
  const b = await resultsAccuracy({ src, date: DATE });
  const codes = Object.fromEntries(b.excluded.map((x) => [x.eventId, x.code]));
  assert.deepEqual(codes, { 401909881: "NO_PUBLISHED_WINNER", 401909882: "NOT_PRE_TIP", [dropped.providerEventId]: "NO_PUBLISHED_FORECAST", 401909884: "FINAL_UNDER_REVIEW" });
  assert.equal(b.total, 8);
  assert.equal(b.correct + b.missed, b.total);
  assert.ok(!b.games.some((g) => codes[g.eventId]));
});

test("card: own unapproved version, misses drawn as visibly as hits, brand footer, no betting words or 'probability'", { skip: skipFull }, async () => {
  const b = await resultsAccuracy({ src: gitDataSource(REPO_ROOT, FULL), date: DATE });
  assert.notEqual(RESULTS_TEMPLATE, SOCIAL_TEMPLATE);
  assert.equal(RESULTS_TEMPLATE, "gtp-social-results@1.1");
  for (const variant of ["portrait", "square"]) {
    const html = resultsHtml(b, { variant });
    assert.equal((html.match(/data-outcome="miss"/g) ?? []).length, 4);
    assert.equal((html.match(/data-result="miss"/g) ?? []).length, 4, "every miss carries a Missed pill");
    assert.equal((html.match(/data-outcome="hit"/g) ?? []).length, 8);
    assert.ok(html.includes(DISCLOSURES.NBA) && html.includes(SOCIAL_HANDLE));
    // 1.1: accuracy is the lead KPI with its sample size; the subtitle and the context / estimate lines are internal only
    assert.match(html, /data-correct="8" data-missed="4" data-total="12" data-accuracy="66.7%"/);
    const text = visibleText(html);
    assert.match(text, /predicted winner vs final/);
    assert.match(text, /66\.7% accuracy 8 of 12 graded games/);
    assert.doesNotMatch(text, /1 day ·|one day of results|long-term accuracy|estimate =|published before tip/);
    const plain = text.replace("not betting advice", "");
    for (const w of [...FORBIDDEN_TERMS, "odds", "bet", "parlay", "probability", "picks"]) assert.ok(!new RegExp(`\\b${w}\\b`).test(plain), w);
    assert.ok(!/approved/i.test(html), "the card never claims approval");
  }
});

test("render: portrait PNG exactly 1080×1350, square 1080×1080, text ≥ 22 px, same bundle → same bytes", { skip: skipFull, timeout: 180_000 }, async () => {
  const b = await resultsAccuracy({ src: gitDataSource(REPO_ROOT, FULL), date: DATE });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-results-"));
  const a = await renderResults(b, { outFile: path.join(dir, "a.png") });
  const a2 = await renderResults(b, { outFile: path.join(dir, "a2.png") });
  assert.deepEqual([a.width, a.height], [1080, 1350]);
  assert.equal(a.sha256, sha256(fs.readFileSync(path.join(dir, "a.png"))));
  assert.equal(a.sha256, a2.sha256, "same bundle, same machine → same PNG bytes");
  assert.equal(a.htmlSha256, a2.htmlSha256);
  assert.ok(a.minFontPx >= 22, `smallest text ${a.minFontPx}px`);
  assert.equal(a.designApproved, false);
  assert.equal(a.template, RESULTS_TEMPLATE);
  assert.match(a.altText, /66\.7% accuracy, 8 correct, 4 missed, 8 of 12 graded games/);
  const s = await renderResults(b, { outFile: path.join(dir, "s.png"), variant: "square" });
  assert.deepEqual([s.width, s.height], [1080, 1080]);
  assert.ok(s.minFontPx >= 22);
});

test("captions: factual + narrative state the miss count and sample size, and pass recap/caption-validator.mjs", { skip: skipFull }, async () => {
  const b = await resultsAccuracy({ src: gitDataSource(REPO_ROOT, FULL), date: DATE });
  const caps = resultsAccuracyCaptions(b);
  assert.deepEqual(caps.map((c) => c.tone), ["factual", "narrative"]);
  for (const c of caps) {
    assert.deepEqual(validateCaption(c.text, b), { ok: true, problems: [] }, c.text);
    assert.deepEqual(validateResultsAccuracyCaption(c.text, b), { ok: true, problems: [] }, c.text);
    assert.match(c.text, /\b4\b/);
    assert.match(c.text, /\b12 games\b/);
    assert.ok(c.text.length <= 280);
    assert.ok(!/\s{2}/.test(c.text), "no doubled spaces");
  }
  assert.match(caps[0].text, /8 of 12 correct, 4 missed \(ATL, MIN, OKC, LAC\)/);
  // the validators refuse: hidden misses, invented numbers, betting talk, "probability"
  const bad = (t) => validateResultsAccuracyCaption(t, b).problems.map((p) => p.code);
  assert.ok(bad("Our predicted winner went 8 of 12 on 12 games.").includes("MISS_NOT_DISCLOSED"));
  assert.ok(bad("Predicted winners: 9 of 12 correct, 4 missed, 12 games.").includes("UNTRACEABLE_NUMBER"));
  assert.ok(bad("Predicted winners 8 of 12, 4 missed, 12 games. Bet on us.").includes("FORBIDDEN_TERM"));
  assert.ok(bad("Predicted winners 8 of 12, 4 missed, 12 games, by win probability.").includes("FORBIDDEN_TERM"));
});

test("sport adapters: the card is sport-agnostic; a sport without an adapter refuses instead of guessing colours", { skip: skipFull }, async () => {
  const { SPORT_ADAPTERS } = await import("../render/social-results.mjs");
  assert.deepEqual(Object.keys(SPORT_ADAPTERS), ["NBA"]);
  for (const k of ["league", "teamOf", "finalsWord", "separator"]) assert.ok(k in SPORT_ADAPTERS.NBA, k);
  const b = await resultsAccuracy({ src: gitDataSource(REPO_ROOT, FULL), date: DATE });
  assert.throws(() => resultsHtml({ ...b, sport: "MLB" }), /no results-card adapter for MLB/);
});
