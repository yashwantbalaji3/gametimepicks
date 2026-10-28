/**
 * D1 — daily content queue, freeze-time verifier, NBA/EPL results pathway, and the public-registry labels.
 * Real-data tests read the pinned commit (skipped if this clone lacks it); the verifier's rules are also pinned with
 * a synthetic data source so every branch is exercised.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { parseIntent } from "../orchestrator/intents.mjs";
import { queueDateOf } from "../orchestrator/queue-flow.mjs";
import { gitDataSource, dirDataSource } from "../recap/multisport-facts.mjs";
import { publicLabelOf, readPublicRegistry } from "../recap/public-registry.mjs";
import { verifyPregame, confirmAfterStart, nflVersions } from "../recap/freeze-verifier.mjs";
import { resultsBundles, resultsCaptions, validateResultsCaption, sameClubs } from "../recap/results-bundle.mjs";
import { renderResultsPng } from "../render/results-card.mjs";
import { parseXPostUrl, parseMetrics, checkCaption, pregamePackage } from "../contracts/post-queue.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { pngSize } from "../render/render-png.mjs";
import { FOUNDER, STRANGER, tempDir } from "./helpers.mjs";
import { QUEUE_PINNED, QUEUE_NOW, X_URL, hasPinned, seedApprovedCalendar } from "./queue-fixtures.mjs";

const pinned = () => gitDataSource(REPO_ROOT, QUEUE_PINNED);
const skip = hasPinned ? false : `pinned data commit ${QUEUE_PINNED.slice(0, 12)} is not in this clone`;

// ── registry labels ────────────────────────────────────────────────────────────────────────────────────────────
test("public labels: NFL is an Official Forecast with capability EXPERIMENTAL_PUBLIC, not product-eligible; fail closed", () => {
  const src = dirDataSource(REPO_ROOT);
  const nfl = publicLabelOf("NFL", src);
  assert.equal(nfl.term, "Official Forecast");
  assert.equal(nfl.capability, "EXPERIMENTAL_PUBLIC");
  assert.equal(nfl.productEligible, false);
  assert.ok(nfl.officialFamilies.includes("nfl_team"));
  assert.match(nfl.modelPerformanceNote, /not yet shown to out-predict/);
  assert.equal(publicLabelOf("MLB", src).productEligible, true);
  assert.ok(readPublicRegistry(src).retired.includes("Experimental model projections"));
  assert.throws(() => readPublicRegistry(dirDataSource(tempDir())), /no post/);
});

// ── freeze-time verifier (synthetic) ───────────────────────────────────────────────────────────────────────────
function receipt({ frozenAt, home = 0.6, side = "HOME", ph = 24, pa = 20 }) {
  return {
    providerEventId: "999", kickoffUtc: "2026-11-01T18:00Z", generatedAt: frozenAt,
    home: { abbr: "GB", name: "Green Bay Packers" }, away: { abbr: "CAR", name: "Carolina Panthers" },
    sideDecision: { publishedSide: side, frozenAt, abstention: null },
    forecastSummary: { winProbability: { home, away: Math.round((0.97 - home) * 1e4) / 1e4 }, projectedScore: { home: ph, away: pa } },
  };
}
function fixtureSource({ siteHome = 0.62, ledgerReceipt = null } = {}) {
  const root = tempDir("gtp-cc-freeze-");
  const w = (p, v) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), typeof v === "string" ? v : JSON.stringify(v)); };
  w("data/internal/nfl/forecast-receipts/2026-10-30/999.json", receipt({ frozenAt: "2026-10-30T12:00:00Z", home: 0.6 }));
  w("data/internal/nfl/forecast-receipts/2026-10-31/999.json", receipt({ frozenAt: "2026-10-31T12:00:00Z", home: 0.6 }));
  w("data/internal/nfl/forecast-receipts/2026-10-31/999-rev-1700Z.json", receipt({ frozenAt: "2026-10-31T17:00:00Z", home: 0.62 }));
  w("data/internal/nfl/forecast-receipts/2026-10-31/9990.json", receipt({ frozenAt: "2026-10-31T18:00:00Z", home: 0.9 })); // another event
  w("app/public/data/nfl/forecasts/2026-10-31.json", { forecasts: [{ ...receipt({ frozenAt: "2026-10-31T17:00:00Z", home: siteHome }), providerEventId: "999" }] });
  if (ledgerReceipt) w("data/internal/forecast-ledger/v1/nfl.jsonl", `${JSON.stringify({ family: "nfl_game_winner", eventId: "999", publicationStatus: "PUBLISHED", forecastId: "fl1-x", receiptId: ledgerReceipt })}\n`);
  return dirDataSource(root);
}
const nums = (home) => ({ side: "home", sideTeam: "GB", sideProbability: home, sideProbabilityDisplay: `${(Math.round(home * 1000) / 10).toFixed(1)}%`, projected: { home: 24, away: 20 }, abstention: null });

test("freeze-time verifier: a version with no published side is BLOCKED and builds no caption", () => {
  const root = tempDir("gtp-cc-noside-");
  const r = { ...receipt({ frozenAt: "2026-10-31T12:00:00Z" }), sideDecision: { publishedSide: null, frozenAt: "2026-10-31T12:00:00Z", abstention: "TOO_CLOSE" } };
  fs.mkdirSync(path.join(root, "data/internal/nfl/forecast-receipts/2026-10-31"), { recursive: true });
  fs.writeFileSync(path.join(root, "data/internal/nfl/forecast-receipts/2026-10-31/999.json"), JSON.stringify(r));
  const v = verifyPregame({ src: dirDataSource(root), eventId: "999", now: "2026-10-31T13:00:00Z", dataCommitAt: "2026-10-31T12:50:00Z" });
  assert.equal(v.code, "NO_PUBLISHED_SIDE");
  const pkg = pregamePackage({ date: "2026-11-01", slot: { id: "s" }, event: { providerEventId: "999", matchup: "CAR @ GB" }, verification: v, versionReceipt: r, dataCommit: null, label: { term: "Official Forecast" } });
  assert.equal(pkg.status, "BLOCKED");
  assert.equal(pkg.captions.length, 0);
});

test("freeze-time verifier: only the latest frozen version, matching the site, before kickoff, is READY", () => {
  const src = fixtureSource();
  assert.equal(nflVersions(src, "999").length, 3, "base files and same-day -rev- revisions, never another event's file");
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-10-29T00:00:00Z" }).code, "NOT_FROZEN");
  const mid = verifyPregame({ src, eventId: "999", now: "2026-10-31T13:00:00Z" });
  assert.equal(mid.status, "NEEDS_VERIFICATION", "the site already shows a newer version than the one frozen by now");
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-10-31T17:30:00Z", numbers: nums(0.62) }).status, "NEEDS_VERIFICATION", "no commit time (a working tree): freshness unknown, never READY");
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-10-31T17:30:00Z", numbers: nums(0.6204), dataCommitAt: "2026-10-31T17:10:00Z" }).status, "READY", "62.0% is 62.0%: no visible change, no redraft");
  const ready = verifyPregame({ src, eventId: "999", now: "2026-10-31T17:30:00Z", numbers: nums(0.62), dataCommitAt: "2026-10-31T17:10:00Z" });
  assert.equal(ready.status, "READY");
  assert.equal(ready.version.path, "data/internal/nfl/forecast-receipts/2026-10-31/999-rev-1700Z.json");
  assert.ok(ready.reasons.some((r) => /can still change until kickoff/.test(r)));
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-10-31T17:30:00Z", numbers: nums(0.6) }).code, "NUMBER_CHANGED");
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-10-31T17:30:00Z", numbers: nums(0.62), dataCommitAt: "2026-10-31T10:00:00Z" }).status, "NEEDS_VERIFICATION", "stale data can't prove the version is the latest");
  assert.equal(verifyPregame({ src: fixtureSource({ siteHome: 0.6 }), eventId: "999", now: "2026-10-31T17:30:00Z" }).status, "NEEDS_VERIFICATION", "site differs");
  assert.equal(verifyPregame({ src, eventId: "999", now: "2026-11-01T18:00:00Z" }).code, "WINDOW_CLOSED");
});

test("freeze-time verifier after kickoff: CONFIRMED or SUPERSEDED against the forecast of record", () => {
  const src = fixtureSource();
  assert.equal(confirmAfterStart({ src, eventId: "999", now: "2026-11-01T17:00:00Z", numbers: nums(0.62) }).status, "PENDING");
  const ok = confirmAfterStart({ src, eventId: "999", now: "2026-11-01T19:00:00Z", numbers: nums(0.62) });
  assert.equal(ok.status, "CONFIRMED");
  assert.match(ok.basis, /last version frozen before kickoff/);
  const sup = confirmAfterStart({ src, eventId: "999", now: "2026-11-01T19:00:00Z", numbers: nums(0.6) });
  assert.equal(sup.status, "SUPERSEDED");
  assert.match(sup.reasons[0], /correction/);
  const viaLedger = confirmAfterStart({ src: fixtureSource({ ledgerReceipt: "data/internal/nfl/forecast-receipts/2026-10-31/999.json" }), eventId: "999", now: "2026-11-01T19:00:00Z", numbers: nums(0.6) });
  assert.equal(viaLedger.status, "CONFIRMED", "the ledger row's receipt is the record when it exists");
  assert.equal(viaLedger.record.forecastId, "fl1-x");
});

test("freeze-time verifier on real data: SF @ ATL's record is the 16:58Z kickoff refresh", { skip }, () => {
  const src = pinned();
  const v = nflVersions(src, "401873017");
  assert.ok(v.length > 30);
  const r = confirmAfterStart({ src, eventId: "401873017", now: QUEUE_NOW, numbers: v.at(-1).numbers });
  assert.equal(r.status, "CONFIRMED");
  assert.match(r.record.path, /401873017-rev-1658Z\.json$/);
  assert.match(r.basis, /Forecast Ledger row/);
});

// ── NBA / EPL results ──────────────────────────────────────────────────────────────────────────────────────────
test("results pathway: NBA finals split into even cards; EPL forecasts matched (AFC Bournemouth = Bournemouth)", { skip }, () => {
  const src = pinned();
  const nba = resultsBundles({ src, sport: "NBA", date: "2026-10-26", label: publicLabelOf("NBA", src) });
  assert.deepEqual(nba.bundles.map((b) => b.games.length), [5, 4]);
  for (const b of nba.bundles) {
    assert.equal(b.tally, null, "NBA is results only: no forecast claim");
    for (const c of resultsCaptions(b)) assert.ok(validateResultsCaption(c.text, b).ok, c.text);
    assert.ok(!validateResultsCaption(`Our forecast had ${b.games[0].home.short} 61.0% to win.`, b).ok, "no forecast talk without forecast evidence");
  }
  const epl = resultsBundles({ src, sport: "EPL", date: "2026-10-25", label: publicLabelOf("EPL", src) });
  assert.equal(epl.refusals.length, 0);
  const games = epl.bundles.flatMap((b) => b.games);
  assert.equal(games.length, 5);
  assert.ok(games.every((g) => g.forecast), "every match has its published, settled forecast");
  assert.ok(sameClubs("Manchester United v Bournemouth", "Manchester United", "AFC Bournemouth"));
  assert.ok(!sameClubs("Bournemouth v Manchester United", "Manchester United", "AFC Bournemouth"), "home and away must line up");
  assert.ok(!sameClubs("West Ham United v Manchester United", "Newcastle United", "Leeds United"), "a shared “United” is not the same club");
  assert.ok(!sameClubs("Manchester City v Hull City", "Coventry City", "Manchester City"));
  const b = epl.bundles[0];
  for (const c of resultsCaptions(b)) assert.ok(validateResultsCaption(c.text, b).ok, c.text);
  if (b.tally.misses) assert.ok(validateResultsCaption("Our Official Forecast came in every time.", b).problems.some((p) => p.code === "MISS_NOT_DISCLOSED"));
  assert.ok(validateResultsCaption("Liverpool 7–0 Brighton & Hove Albion. Not betting advice.", b).problems.some((p) => p.code === "UNTRACEABLE_NUMBER"));
  assert.ok(validateResultsCaption("Experimental model projections were close.", b).problems.some((p) => p.code === "RETIRED_PHRASE"));
});

test("results card: 1080×1350, identical bytes on re-render, refuses without a registry label", { skip }, async () => {
  const src = pinned();
  const [b] = resultsBundles({ src, sport: "EPL", date: "2026-10-24", label: publicLabelOf("EPL", src) }).bundles;
  const dir = tempDir();
  const m1 = await renderResultsPng(b, { outFile: path.join(dir, "a.png") });
  const m2 = await renderResultsPng(b, { outFile: path.join(dir, "b.png") });
  assert.deepEqual(pngSize(fs.readFileSync(path.join(dir, "a.png"))), { width: 1080, height: 1350 });
  assert.equal(m1.sha256, m2.sha256);
  assert.match(m1.altText, /Most likely result came in/);
  await assert.rejects(renderResultsPng({ ...b, publicLabel: null }, { outFile: path.join(dir, "c.png") }), /no public label/);
});

// ── small parsers ──────────────────────────────────────────────────────────────────────────────────────────────
test("receipt and engagement parsers", () => {
  assert.equal(parseXPostUrl("https://twitter.com/GameTimePicks/status/2115300000000000001?s=20").url, X_URL);
  assert.ok(!parseXPostUrl("https://x.com/GameTimePicks").ok);
  assert.ok(!parseXPostUrl("https://evil.example/x.com/GameTimePicks/status/2115300000000000001").ok);
  assert.ok(!parseXPostUrl(X_URL, { expectedHandle: "@someoneelse" }).ok);
  assert.ok(parseXPostUrl(X_URL, { expectedHandle: "@gametimepicks" }).ok);
  assert.deepEqual(parseMetrics({ likes: "12", impressions: 400, replies: "" }).metrics, { likes: 12, impressions: 400 });
  assert.ok(!parseMetrics({ likes: 1.5 }).ok);
  assert.ok(!parseMetrics({}).ok);
  assert.equal(parseIntent("Team, prepare today's content queue from the approved calendar."), "daily-queue");
  assert.equal(parseIntent("Team, turn the revised weekly plan into a seven-day content calendar covering NFL, NBA, MLB, UFC and EPL."), "content-calendar");
  assert.equal(queueDateOf("content queue for 2026-10-30", QUEUE_NOW), "2026-10-30");
  assert.equal(queueDateOf("tomorrow's content queue", "2026-10-29T02:00:00Z"), "2026-10-29", "tomorrow is counted in US Eastern");
  const pkg = { claims: [{ display: "GB 26" }], label: { retiredPhrases: ["experimental sims"] }, noForecastClaims: true };
  assert.ok(checkCaption("GB 26. Not betting advice.", pkg).ok, "the disclaimer is not betting talk");
  assert.ok(!checkCaption("Bet on GB 26", pkg).ok);
  assert.ok(!checkCaption("Our forecast: GB 63.8% to win", pkg).ok);
});

// ── the queue end to end ───────────────────────────────────────────────────────────────────────────────────────
function queueOrchestrator({ tamper = false, seed = true, env = {} } = {}) {
  const dir = tempDir("gtp-cc-queue-");
  let now = QUEUE_NOW;
  const clock = () => now;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  if (seed) seedApprovedCalendar(store, undefined, { tamper });
  const o = createOrchestrator({ store, clock, outDir: dir, queueRender: false, calendarDataSource: pinned(), env: { GTP_CC_X_HANDLE: "GameTimePicks", ...env } });
  return { o, store, dir, setNow: (t) => { now = t; } };
}
const posts = (o, commandId) => o.state().posts.filter((p) => p.commandId === commandId);
const byPost = (o, postId) => o.state().posts.filter((p) => p.postId === postId).at(-1);

test("queue: refuses without an approved calendar, and when the approved calendar was altered", { skip }, async () => {
  for (const [opts, code] of [[{ seed: false }, "NO_APPROVED_CALENDAR"], [{ tamper: true }, "CALENDAR_DIGEST_MISMATCH"]]) {
    const { o } = queueOrchestrator(opts);
    const r = await o.handleCommand("Team, prepare today's content queue", FOUNDER);
    const c = o.state().commands.find((x) => x.commandId === r.commandId);
    assert.ok(c.refusals.some((x) => x.code === code), code);
    assert.equal(posts(o, r.commandId).length, 0);
  }
});

test("queue: one package per post from the approved calendar's chosen slots; nothing is approved by the calendar", { skip }, async () => {
  const { o, dir } = queueOrchestrator();
  const r = await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  const q = o.state().commands.find((c) => c.commandId === r.commandId).contributions.find((c) => c.artifactType === "post-queue").artifact;
  assert.equal(q.date, "2026-10-28");
  assert.equal(q.calendar.decisionId, "prop-d1fixture");
  assert.equal(q.dataCommit, QUEUE_PINNED);
  const kinds = (k) => q.packages.filter((p) => p.kind === k);
  assert.equal(kinds("nfl-recap").length, 13, "every settled NFL game Oct 25–27 that passes the gate, one post each");
  assert.ok(kinds("nfl-recap").every((p) => p.status === "READY" && p.captions.every((c) => c.check.ok)));
  assert.ok(kinds("results-recap").some((p) => p.sport === "NBA") && kinds("results-recap").some((p) => p.sport === "EPL"));
  assert.equal(kinds("explainer").length, 1);
  assert.ok(kinds("explainer")[0].captions.some((c) => c.source === "chatgpt-calendar-draft"), "ChatGPT's calendar draft rides along, labelled");
  assert.equal(kinds("x-reply")[0].status, "NEEDS_VERIFICATION");
  assert.equal(kinds("engagement")[0].status, "NEEDS_VERIFICATION", "the NBA schedule capture at the pinned commit is from Oct 27");
  assert.ok(q.skipped.some((s) => s.sport === "MLB"), "MLB recap is listed as skipped, with the reason");
  assert.ok(q.skipped.some((s) => s.format === "live-update"));
  assert.ok(!q.packages.some((p) => p.sport === "NBA" && p.kind === "player-analysis"), "unchosen slots are not queued");
  for (const p of q.packages) {
    for (const c of p.captions) assert.ok(c.digest && c.publishBundle.dataCommit === QUEUE_PINNED);
    assert.ok(p.label.term === "Official Forecast");
  }
  const ps = posts(o, r.commandId);
  assert.equal(ps.length, q.packages.filter((p) => p.status !== "BLOCKED").length, "one decision per post");
  assert.ok(ps.every((p) => p.lifecycle === "drafted"), "approving the calendar approved no post");
  assert.ok(fs.existsSync(path.join(dir, "strategies", `queue-2026-10-28-${r.commandId}.md`)));
  assert.equal((await o.handleCommand("Team, prepare today's content queue", FOUNDER)).duplicate, true, "same words, same data: same queue");
});

test("queue: per-post decisions, the manual X receipt, schedule and engagement — with every refusal", { skip }, async () => {
  const { o, store } = queueOrchestrator();
  const r = await o.handleCommand("Team, prepare today's content queue", FOUNDER);
  const recap = posts(o, r.commandId).find((p) => p.postId.endsWith("NFL:recap:401873017"));
  const [A] = recap.options;
  assert.equal((await o.decide({ decisionId: recap.decisionId, verdict: "approve", captionId: "A", digest: A.digest }, STRANGER)).code, "NOT_FOUNDER");
  assert.equal((await o.decide({ decisionId: recap.decisionId, verdict: "approve", captionId: "A", digest: "0".repeat(64) }, FOUNDER)).code, "APPROVAL_DIGEST_MISMATCH");
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "publish", url: X_URL }, FOUNDER).code, "APPROVAL_MISSING");
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "publish", url: X_URL }, STRANGER).code, "NOT_FOUNDER");
  const ok = await o.decide({ decisionId: recap.decisionId, verdict: "approve", captionId: "A", digest: A.digest }, FOUNDER);
  assert.ok(ok.ok);
  assert.match(ok.next, /Post it yourself/);
  assert.equal((await o.decide({ decisionId: recap.decisionId, verdict: "reject" }, FOUNDER)).verdict, "approve", "first decision wins");
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "engagement", metrics: { likes: 1 } }, FOUNDER).code, "NOT_PUBLISHED");
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "publish", url: "https://x.com/otheraccount/status/2115300000000000001" }, FOUNDER).code, "BAD_X_LINK");
  const pub = o.recordPost({ decisionId: recap.decisionId, action: "publish", url: X_URL }, FOUNDER);
  assert.ok(pub.ok);
  assert.equal(pub.receipt.provider, "manual-handoff");
  assert.equal(pub.receipt.bundleDigest, A.digest, "the receipt binds the exact approved caption bundle");
  assert.match(pub.receipt.verification, /does not fetch X/);
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "publish", url: X_URL }, FOUNDER).duplicate, true);
  const OTHER_URL = "https://x.com/GameTimePicks/status/2115300000000000002";
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "publish", url: OTHER_URL }, FOUNDER).code, "ALREADY_PUBLISHED", "a published post never claims a second link");
  assert.equal(store.list().filter((e) => e.kind === "publish-receipt").length, 1);
  const other = posts(o, r.commandId).find((p) => p.postId.endsWith("NFL:recap:401873022"));
  await o.decide({ decisionId: other.decisionId, verdict: "approve", captionId: "B", digest: other.options[1].digest }, FOUNDER);
  assert.equal(o.recordPost({ decisionId: other.decisionId, action: "publish", url: X_URL }, FOUNDER).code, "LINK_ALREADY_USED");
  assert.ok(o.recordPost({ decisionId: other.decisionId, action: "publish", url: OTHER_URL }, FOUNDER).ok, "…and the refused link stays free for its real post");
  // Two requests for one post (a queue built while the founder approved): only one approval can stand.
  const twin = { ...store.list().find((e) => e.kind === "decision-request" && e.data.decisionId === recap.decisionId).data, decisionId: "post-twin" };
  store.append("decision-request", "chief-of-staff", twin);
  assert.equal((await o.decide({ decisionId: "post-twin", verdict: "approve", captionId: "A", digest: A.digest }, FOUNDER)).code, "ALREADY_APPROVED");
  assert.equal(o.recordPost({ decisionId: recap.decisionId, action: "engagement", metrics: { likes: -2 } }, FOUNDER).code, "BAD_METRICS");
  assert.deepEqual(o.recordPost({ decisionId: recap.decisionId, action: "engagement", metrics: { likes: 12, impressions: "450" } }, FOUNDER).metrics, { likes: 12, impressions: 450 });
  assert.equal(o.state().posts.find((p) => p.decisionId === recap.decisionId).lifecycle, "published");
  assert.equal(o.state().posts.find((p) => p.decisionId === "post-twin").lifecycle, "superseded", "a duplicate request for a decided post is not left open");

  const xr = posts(o, r.commandId).find((p) => p.package.kind === "x-reply");
  assert.equal((await o.decide({ decisionId: xr.decisionId, verdict: "approve", captionId: "C", digest: xr.options[0].digest }, FOUNDER)).code, "SOURCES_NOT_CONFIRMED");
  const xok = await o.decide({ decisionId: xr.decisionId, verdict: "approve", captionId: "C", digest: xr.options[0].digest, sourcesConfirmed: true }, FOUNDER);
  assert.ok(xok.ok);
  assert.equal(store.list().find((e) => e.kind === "decision" && e.data.decisionId === xr.decisionId).data.sourcesConfirmed, true, "the confirmation is recorded with the decision");

  const eng = posts(o, r.commandId).find((p) => p.package.kind === "engagement");
  assert.equal((await o.decide({ decisionId: eng.decisionId, verdict: "approve", captionId: "A", digest: eng.options[0].digest }, FOUNDER)).code, "NOT_READY");
  assert.equal((await o.decide({ decisionId: eng.decisionId, verdict: "revise" }, FOUNDER)).code, "NOTE_REQUIRED");
  assert.ok((await o.decide({ decisionId: eng.decisionId, verdict: "revise", note: "wait for today's schedule" }, FOUNDER)).ok);
  assert.equal(byPost(o, eng.postId).lifecycle, "revise");

  // A second queue the same day: decided posts are not proposed again; open ones are, and the old request is superseded.
  const r2 = await o.handleCommand("Team, prepare today's post queue again", FOUNDER);
  const again = posts(o, r2.commandId);
  assert.ok(!again.some((p) => p.postId === recap.postId), "a published post is not proposed again");
  assert.ok(again.some((p) => p.postId === eng.postId), "a post sent back for revision is proposed again");
  const stale = posts(o, r.commandId).find((p) => p.postId.endsWith("NFL:recap:401873011"));
  assert.equal(stale.lifecycle, "superseded");
  assert.equal((await o.decide({ decisionId: stale.decisionId, verdict: "approve", captionId: "A", digest: stale.options[0].digest }, FOUNDER)).code, "SUPERSEDED");
});

test("queue: the NFL pregame post is freeze-verified at build, at approval and after kickoff", { skip }, async () => {
  const { o, store, setNow } = queueOrchestrator();
  const r = await o.handleCommand("Team, prepare tomorrow's content queue", FOUNDER);
  const tq = o.state().commands.find((c) => c.commandId === r.commandId).contributions.find((c) => c.artifactType === "post-queue").artifact;
  assert.ok(tq.skipped.some((s) => /no NBA finals for 2026-10-28/.test(s.reason)), "a game-day recap slot is built the next morning, and an empty one is said out loud");
  const noLink = tq.packages.find((p) => p.title === "Join: no link");
  assert.equal(noLink.status, "BLOCKED", "an X reply citing no specific post can't be confirmed");
  const pg = posts(o, r.commandId).find((p) => p.package.kind === "pregame-forecast");
  assert.equal(pg.package.status, "READY", pg.package.reasons.join("; "));
  assert.equal(pg.package.eventId, "401873023");
  assert.match(pg.options[0].text, /Green Bay Packers 63\.8% to win, projected CAR 20, GB 26/);
  assert.match(pg.options[0].text, /frozen Oct 27, 8:16 PM ET/, "the caption states which version it quotes");
  // Approval re-verifies against the data: 2 h later the commit is stale, so approval is refused.
  setNow("2026-10-28T15:30:00.000Z");
  assert.equal((await o.decide({ decisionId: pg.decisionId, verdict: "approve", captionId: "A", digest: pg.options[0].digest }, FOUNDER)).code, "VERIFICATION_CHANGED");
  setNow("2026-10-28T13:40:00.000Z");
  assert.ok((await o.decide({ decisionId: pg.decisionId, verdict: "approve", captionId: "A", digest: pg.options[0].digest }, FOUNDER)).ok);
  assert.equal(o.recordPost({ decisionId: pg.decisionId, action: "schedule", scheduledFor: "2026-10-30T00:30:00Z" }, FOUNDER).code, "AFTER_KICKOFF");
  assert.ok(o.recordPost({ decisionId: pg.decisionId, action: "schedule", scheduledFor: "2026-10-29T16:00:00Z" }, FOUNDER).ok);
  assert.equal(byPost(o, pg.postId).lifecycle, "scheduled");
  assert.ok(o.recordPost({ decisionId: pg.decisionId, action: "publish", url: X_URL, publishedAt: "2026-10-29T16:00:00Z" }, FOUNDER).ok);
  // After kickoff the next queue build re-checks the published post against the record.
  setNow("2026-10-30T13:00:00.000Z");
  await o.handleCommand("Team, prepare the content queue for 2026-10-30", FOUNDER);
  const check = store.list().find((e) => e.kind === "post-verification" && e.data.decisionId === pg.decisionId)?.data;
  assert.equal(check?.status, "CONFIRMED", "matches the last version frozen before kickoff at the pinned commit");
  assert.equal(byPost(o, pg.postId).checks.length, 1);
});
