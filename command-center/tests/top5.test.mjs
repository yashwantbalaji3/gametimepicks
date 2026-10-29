/**
 * Top 5 social boards (founder 2026-10-29): schedule math (time zones, DST, an NFL week that doesn't start on
 * Thursday), holds (after start, boards not ready, ineligible rows, coverage), the trust rule (published order only,
 * unavailable when no official board, never private research), stable ids across rebuilds and ledger copies, the
 * once-only send per week, per-template design approvals, image limits and deterministic grouping. Real data from a
 * pinned origin/main commit (skipped if absent); synthetic boards only where a case doesn't exist in real data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { gitDataSource } from "../recap/multisport-facts.mjs";
import { REPO_ROOT } from "../lib/util.mjs";
import { liveAuthorizationText } from "../orchestrator/publish-flow.mjs";
import { X_MEDIA_UPLOAD_URL, MAX_IMAGES } from "../publishers/x-api.mjs";
import {
  zonedInstant, earliestEligible, publishAtFor, nflWeeks, nflWeekFor, nflWeekTop5, dailyTop5, marketFromBoard, NFL_MARKETS, leadMinutes, etDateOf,
} from "../recap/top5-boards.mjs";
import { top5Draft, top5Finish, assignVersion, groupMarkets, X_MAX_IMAGES } from "../contracts/top5-packages.mjs";
import { recheckTop5 } from "../orchestrator/top5-flow.mjs";
import { SOCIAL_TEMPLATE, ASSET_MANIFEST } from "../render/social-v2.mjs";
import { TOP5_TEMPLATE, TOP5_ASSET_MANIFEST, top5Html } from "../render/social-top5.mjs";
import { FOUNDER, tempDir } from "./helpers.mjs";
import { seedApprovedCalendar, calendarFixture } from "./queue-fixtures.mjs";

/** origin/main 2026-10-29 16:59Z: NFL week 8 weekly boards (2-08.json, FULL_WEEK, 14 games) + the Oct 29 frozen board. */
const PINNED = "047c7f686b85a0739d823fec914e3d81cf6b84dc";
const has = (() => { try { execFileSync("git", ["cat-file", "-e", `${PINNED}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; } })();
const skip = has ? false : `pinned data commit ${PINNED.slice(0, 12)} is not in this clone`;
const NOW = "2026-10-29T17:30:00.000Z"; // 1:30 PM ET, TNF CAR @ GB kicks off 8:15 PM ET
const WEEKLY = "app/public/data/nfl/weekly-boards/2-08.json";
const real = has ? gitDataSource(REPO_ROOT, PINNED) : null;
/** A data source with one file patched (stands in for a later published version). */
const patched = (base, file, fn) => ({ ...base, read: (p) => { const raw = base.read(p); return p === file && raw ? JSON.stringify(fn(JSON.parse(raw))) : raw; } });
const extra = { template: TOP5_TEMPLATE, assetManifest: TOP5_ASSET_MANIFEST, dataCommit: PINNED, label: null };

// ── schedule math ────────────────────────────────────────────────────────────────────────────────────────────
test("schedule: event-local times in several zones, DST boundaries, earliest eligible game, lead before it", () => {
  // US fall-back 2026-11-01: 1:30 AM ET happens twice → the earlier (EDT) instant; 3:00 PM ET that day is EST
  assert.equal(zonedInstant("2026-11-01", "01:30", "America/New_York"), "2026-11-01T05:30:00.000Z");
  assert.equal(zonedInstant("2026-11-01", "13:00", "America/New_York"), "2026-11-01T18:00:00.000Z");
  assert.equal(zonedInstant("2026-10-31", "13:00", "America/New_York"), "2026-10-31T17:00:00.000Z");
  // spring-forward gap 2026-03-08 02:30 ET doesn't exist → just after the jump
  assert.equal(zonedInstant("2026-03-08", "02:30", "America/New_York"), "2026-03-08T07:30:00.000Z");
  // UK falls back on 2026-10-25, a week before the US: London 15:00 is 11:00 ET on Oct 25 but 10:00 ET on Nov 1
  assert.equal(zonedInstant("2026-10-24", "15:00", "Europe/London"), "2026-10-24T14:00:00.000Z");
  assert.equal(zonedInstant("2026-10-25", "15:00", "Europe/London"), "2026-10-25T15:00:00.000Z");
  assert.equal(zonedInstant("2026-11-07", "21:00", "Europe/Paris"), "2026-11-07T20:00:00.000Z");
  assert.equal(zonedInstant("2026-10-30", "19:00", "America/Los_Angeles"), "2026-10-31T02:00:00.000Z");
  // the earliest eligible game across zones; a postponed earlier game doesn't count
  const slate = [
    { id: "la", localDate: "2026-11-01", localTime: "10:00", tz: "America/Los_Angeles" },      // 18:00Z
    { id: "lon", localDate: "2026-11-01", localTime: "14:30", tz: "Europe/London" },           // 14:30Z
    { id: "ny", startUtc: "2026-11-01T17:00:00Z" },
    { id: "pp", localDate: "2026-11-01", localTime: "12:00", tz: "Europe/London", status: "STATUS_POSTPONED" },
  ];
  const first = earliestEligible(slate);
  assert.equal(first.id, "lon");
  assert.equal(first.start, "2026-11-01T14:30:00.000Z");
  assert.equal(publishAtFor(first.start, 120), "2026-11-01T12:30:00.000Z");
  // 2 h before a game the day after the US switch is computed on instants, not wall clocks
  assert.equal(publishAtFor(zonedInstant("2026-11-01", "13:00", "America/New_York"), 120), "2026-11-01T16:00:00.000Z");
  assert.deepEqual(leadMinutes({}), { daily: 120, weekly: 120 });
  assert.deepEqual(leadMinutes({ GTP_CC_TOP5_WEEKLY_LEAD_MIN: "90", GTP_CC_TOP5_DAILY_LEAD_MIN: "3" }), { daily: 120, weekly: 90 }, "configurable, and a nonsense value falls back (never silently 3 min)");
});

test("NFL week: first game from the schedule, also when the week doesn't start on Thursday", () => {
  const row = (id, week, dateUtc, status = "STATUS_SCHEDULED") => ({ providerEventId: id, shortName: id, dateUtc, statusRaw: status, seasonType: 2, week });
  const sched = { rows: [
    row("w17a", 17, "2026-12-25T18:00Z"), row("w17b", 17, "2026-12-28T01:20Z"),
    // week 18: Saturday doubleheader, no Thursday game; a postponed Friday game doesn't open the week
    row("w18p", 18, "2027-01-01T01:15Z", "STATUS_POSTPONED"), row("w18a", 18, "2027-01-02T21:30Z"), row("w18b", 18, "2027-01-03T01:00Z"), row("w18c", 18, "2027-01-03T18:00Z"),
  ] };
  const weeks = nflWeeks(sched);
  const w18 = nflWeekFor(weeks, "2026-12-29");
  assert.equal(w18.week, 18);
  assert.equal(w18.first.id, "w18a");
  assert.equal(new Date(w18.first.start).getUTCDay(), 6, "Saturday");
  assert.equal(publishAtFor(w18.first.start, 120), "2027-01-02T19:30:00.000Z");
  assert.equal(nflWeekFor(weeks, "2026-12-26").week, 17, "a week not over yet is still that week");
});

// ── the trust rule ───────────────────────────────────────────────────────────────────────────────────────────
test("NFL week 8 (real): the official weekly board exactly as published; ESTIMATE families unavailable; schedule 2 h before TNF", { skip }, () => {
  const m = nflWeekTop5({ src: real, date: "2026-10-29" });
  assert.equal(m.ok, true);
  assert.equal(m.period, "2026-W08");
  assert.equal(m.firstGame.name, "CAR @ GB");
  assert.equal(m.firstStartUtc, "2026-10-30T00:15:00.000Z");
  assert.equal(m.status, "READY", m.reasons.join("; "));
  assert.equal(m.coverage.complete, true);
  assert.equal(m.coverage.eventsInWeek, 14);
  assert.deepEqual(m.markets.map((x) => x.market), ["anytime_td", "player_reception_yds", "player_receptions"]);
  assert.deepEqual(m.unavailable.map((u) => u.market).sort(), ["player_pass_yds", "player_rush_yds"]);
  assert.ok(m.unavailable.every((u) => /not an official published board \(ESTIMATE/.test(u.reason)));
  // every shown row is the published row at the same position: no sort, no fill
  const pub = JSON.parse(real.read(WEEKLY));
  for (const mk of m.markets) {
    const b = pub.boards.find((x) => x.family === mk.market);
    assert.deepEqual(mk.rows.map((r) => r.playerId), b.rows.slice(0, 5).map((r) => r.playerId), mk.market);
    assert.equal(mk.publishedTopN, b.topN);
  }
  assert.deepEqual(m.markets[0].rows.map((r) => r.display), ["76.6%", "73.4%", "71.0%", "69.1%", "66.9%"]);
  // receptions: the producer ranks by `value` (Zay Flowers 5.78 → median 6 after two 7s) — shown as published
  assert.deepEqual(m.markets[2].rows.map((r) => `${r.name} ${r.display}`), ["Jaxon Smith-Njigba 8", "Puka Nacua 8", "Trey McBride 7", "CeeDee Lamb 7", "Zay Flowers 6"]);
  assert.equal(m.evidence.at(-1).path, WEEKLY);
  assert.match(m.evidence.at(-1).sha256, /^[0-9a-f]{64}$/);
  assert.equal(m.evidence.at(-1).commit, PINNED);
  const d = top5Draft({ model: m, leadMin: 120, now: NOW, extra });
  assert.equal(d.suggestedPublishAt, "2026-10-29T22:15:00.000Z");
  assert.equal(d.schedule.publishAtEt, "Thu 6:15 PM ET");
});

test("never re-rank: an order that contradicts its own key, or an excluded row, holds; ties keep the published order", () => {
  const src = { path: "x", sha256: "0" };
  const rows = (vals, part = {}) => vals.map((v, i) => ({ playerId: `p${i}`, name: `Player ${i}`, team: "BUF", opponent: "BAL", providerEventId: "1", kickoffUtc: "2026-11-01T18:00Z", participation: part[i] ?? "AVAILABLE", value: v, median: Math.round(v) }));
  const board = (vals, part) => ({ family: "player_receptions", metric: "median", state: "PUBLISHED", topN: 10, rows: rows(vals, part) });
  const shuffled = marketFromBoard({ sport: "NFL", board: board([7, 8, 6, 5, 4]), defs: NFL_MARKETS, source: src });
  assert.equal(shuffled.ok, false);
  assert.equal(shuffled.hold, true);
  assert.match(shuffled.reason, /hold for review rather than re-rank/);
  const tied = marketFromBoard({ sport: "NFL", board: board([8, 8, 7, 7, 6, 5]), defs: NFL_MARKETS, source: src });
  assert.deepEqual(tied.market.rows.map((r) => r.playerId), ["p0", "p1", "p2", "p3", "p4"], "a prefix of the published order");
  const out = marketFromBoard({ sport: "NFL", board: board([8, 7, 6, 5, 4], { 2: "OUT" }), defs: NFL_MARKETS, source: src });
  assert.equal(out.hold, true);
  assert.match(out.reason, /Player 2 is OUT/);
  const est = marketFromBoard({ sport: "NFL", board: { ...board([8]), state: "ESTIMATE", reason: "failed bar" }, defs: NFL_MARKETS, source: src });
  assert.equal(est.unavailable, true);
  const edge = marketFromBoard({ sport: "NFL", board: { ...board([8]), metric: "edge" }, defs: NFL_MARKETS, source: src });
  assert.match(edge.reason, /sportsbook lines|separate, gated/);
  const mixed = marketFromBoard({ sport: "NFL", board: { ...board([0.5]), family: "anytime_td", metric: "median" }, defs: NFL_MARKETS, source: src });
  assert.match(mixed.reason, /never mixed/);
});

test("an excluded row on the real board holds the weekly package (not back-filled)", { skip }, () => {
  const src = patched(real, WEEKLY, (j) => { j.boards[0].rows[1].participation = "OUT"; return j; });
  const m = nflWeekTop5({ src, date: "2026-10-29" });
  assert.equal(m.status, "BLOCKED");
  assert.ok(m.reasons.some((r) => /Javonte Williams is OUT/.test(r)));
  assert.ok(!m.markets.some((x) => x.market === "anytime_td"), "the market is not drawn with a gap filled");
});

test("unavailable: no official daily board for NBA / MLB / UFC / EPL / Ligue 1 — and private research is never read", { skip }, () => {
  const reads = [];
  const src = { ...real, read: (p) => { reads.push(p); return real.read(p); } };
  for (const sport of ["NBA", "MLB", "UFC", "EPL", "LIGUE1"]) {
    const d = dailyTop5({ src, sport, date: "2026-10-29" });
    assert.equal(d.ok, false, sport);
    assert.equal(d.unavailable, true, sport);
    assert.match(d.reason, /no official published .* Top Board for 2026-10-29/, sport);
  }
  assert.ok(real.read("data/internal/research/nba/top-boards/v0.1/2026-10-29.json"), "the private NBA board exists at this commit");
  assert.ok(!reads.some((p) => p.startsWith("data/internal")), "never read");
});

test("a daily sport with an official board (synthetic) builds one consolidated post, scheduled 2 h before its first game", () => {
  const board = { schemaVersion: 1, artifact: "results-top-boards", dataClass: "PUBLIC", date: "2026-11-07", publishedAt: "2026-11-07T10:00:00Z", firstKickoffUtc: zonedInstant("2026-11-07", "12:30", "Europe/London"), events: ["e1", "e2"],
    boards: [{ sport: "epl", propFamily: "anytime_scorer", label: "Anytime goalscorer", metric: "probability", rows: [1, 2, 3, 4, 5].map((i) => ({ rank: i, playerId: `s${i}`, name: `Scorer ${i}`, team: "ARS", opponent: "CHE", providerEventId: "e1", kickoffUtc: "2026-11-07T12:30:00Z", participation: "AVAILABLE", projection: { probability: 0.5 - i / 100 } })) }], ineligible: [] };
  const src = { label: "fixture", commit: null, read: (p) => (p === "app/public/data/results/top-boards/2026-11-07.json" ? JSON.stringify(board) : null) };
  const m = dailyTop5({ src, sport: "EPL", date: "2026-11-07" });
  assert.equal(m.ok, true);
  assert.equal(m.status, "READY", m.reasons.join("; "));
  const d = top5Draft({ model: m, leadMin: leadMinutes({}).daily, now: "2026-11-07T08:00:00Z", extra });
  assert.equal(d.kind, "top5-daily");
  assert.equal(d.baseId, "top5-day|EPL|2026-11-07");
  assert.equal(d.suggestedPublishAt, "2026-11-07T10:30:00.000Z", "12:30 London (GMT) − 2 h");
  assert.equal(d.schedule.publishAtEt, "Sat 5:30 AM ET");
  assert.equal(top5Draft({ model: m, leadMin: 120, now: "2026-11-07T12:30:00Z", extra }).status, "BLOCKED", "hold after start");
});

// ── holds ────────────────────────────────────────────────────────────────────────────────────────────────────
test("holds: boards not ready, coverage limitation recorded, after the first game, and a changed board at re-check", { skip }, () => {
  const none = { ...real, read: (p) => (p === WEEKLY ? null : real.read(p)) };
  assert.equal(nflWeekTop5({ src: none, date: "2026-10-29" }).notReady, true);
  const partial = patched(real, WEEKLY, (j) => ({ ...j, scope: { kind: "FULL_WEEK", eventsIncluded: 13, eventsDroppedAfterKickoff: 1 } }));
  const p = nflWeekTop5({ src: partial, date: "2026-10-29" });
  assert.equal(p.status, "BLOCKED");
  assert.equal(p.coverage.complete, false);
  assert.match(p.coverage.note, /13 of 14 games/);
  assert.ok(p.reasons.some((r) => /coverage limitation/.test(r)));
  const m = nflWeekTop5({ src: real, date: "2026-10-29" });
  const pkg = top5Finish(top5Draft({ model: m, leadMin: 120, now: NOW, extra }), { version: 1 });
  assert.equal(recheckTop5(pkg, { src: real, now: NOW }).status, "READY");
  assert.equal(recheckTop5(pkg, { src: real, now: "2026-10-30T00:15:00.000Z" }).status, "BLOCKED", "no pregame label after start");
  const changed = patched(real, WEEKLY, (j) => { j.boards[0].rows[4].probability = 0.66; j.boards[0].rows[4].value = 0.66; return j; });
  const r = recheckTop5(pkg, { src: changed, now: NOW });
  assert.equal(r.status, "BLOCKED");
  assert.match(r.reasons[0], /official published board changed/);
  // a refresh that rewrites the file (new generatedAt) but shows the same rows is not a change
  const restamped = patched(real, WEEKLY, (j) => ({ ...j, generatedAt: "2026-10-29T18:00:00Z" }));
  assert.equal(recheckTop5(pkg, { src: restamped, now: NOW }).status, "READY");
});

// ── images ───────────────────────────────────────────────────────────────────────────────────────────────────
test("images: ≤ X's 4, one market per image in a fixed order, overflow stated; HTML carries logo, labels and @GameTimePicksHQ", { skip }, () => {
  assert.equal(X_MAX_IMAGES, 4);
  assert.equal(MAX_IMAGES, 4);
  const mk = (market, priority) => ({ market, priority, title: market, rows: [{ rank: 1, name: "A", display: "1" }] });
  const six = [mk("f", 6), mk("b", 2), mk("e", 5), mk("a", 1), mk("d", 4), mk("c", 3)];
  const g1 = groupMarkets(six);
  const g2 = groupMarkets([...six].reverse());
  assert.deepEqual(g1, g2, "deterministic whatever the input order");
  assert.equal(g1.groups.length, 4);
  assert.ok(g1.groups.every((g) => g.length === 1));
  assert.deepEqual(g1.notShown.map((m) => m.market), ["e", "f"]);
  const m = nflWeekTop5({ src: real, date: "2026-10-29" });
  const many = { ...m, markets: [...m.markets, ...m.markets.map((x) => ({ ...x, market: `${x.market}-b`, priority: x.priority + 10 }))] };
  const d = top5Draft({ model: many, leadMin: 120, now: NOW, extra });
  assert.equal(d.groups.length, 4);
  assert.ok(d.reasons.some((r) => /image limit/.test(r)));
  assert.ok(d.captions.every((c) => /\(4 of 6 boards shown\)/.test(c.text)), "never implies all boards");
  assert.throws(() => top5Finish(d, { version: 1, media: [1, 2, 3, 4, 5].map((i) => ({ file: `${i}.png`, sha256: "x" })) }), /1–4/);
  const html = top5Html(m, [m.markets[0]], { index: 0, count: 3 });
  assert.match(html, /data:image\/png;base64,/, "the official logo, inlined");
  assert.match(html, /NFL · Week 8/);
  assert.match(html, /Anytime Touchdown/);
  assert.match(html, /data-handle="@GameTimePicksHQ"/);
  assert.match(html, /class="xmark"/);
  assert.match(html, /data-method="HIGHEST_PROBABILITY"/);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, "no remote asset");
  const visible = html.replace(/Not betting advice/g, "").replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>|<[^>]+>/g, " ");
  assert.doesNotMatch(visible, /odds|sportsbook|\bline\b|\bbet/i, "no odds or lines");
});

// ── queue, ids, ledger copies, once-only, design approvals ─────────────────────────────────────────────────────
function harness({ dir = tempDir("gtp-cc-top5-"), src = real, now = NOW, seed = true } = {}) {
  let t = now;
  const clock = () => t;
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  if (seed) seedApprovedCalendar(store, { ...calendarFixture(), slots: [] });
  let source = src;
  const xcalls = [];
  const oauth = { accessToken: async () => ({ ok: true, token: "AT-test" }), status: async () => ({ connected: true, scopes: ["tweet.read", "tweet.write", "media.write", "users.read", "offline.access"] }) };
  const fetch = async (url) => { xcalls.push(String(url)); return new Response(JSON.stringify(String(url) === X_MEDIA_UPLOAD_URL ? { data: { id: `M${xcalls.length}` } } : { data: { id: `21153000000000${String(xcalls.length).padStart(5, "0")}` } }), { status: String(url) === X_MEDIA_UPLOAD_URL ? 200 : 201 }); };
  const o = createOrchestrator({ store, clock, outDir: dir, queueRender: true, calendarDataSource: { ...src, read: (p) => source.read(p) }, env: { GTP_CC_X_HANDLE: "GameTimePicksHQ" },
    publishing: { oauth, fetch, refreshData: async () => ({ ok: true, detail: "test" }) } });
  return { o, dir, store, xcalls, setNow: (v) => { t = v; }, setSrc: (s) => { source = s; } };
}
const top5Posts = (o) => o.state().posts.filter((p) => p.package.kind === "top5-weekly");
const current = (o) => top5Posts(o).filter((p) => p.lifecycle !== "superseded").at(-1);
const approveA = (o, p) => o.decide({ decisionId: p.decisionId, verdict: "approve", captionId: "A", digest: p.options.find((x) => x.captionId === "A").digest }, FOUNDER);

test("queue: one weekly NFL package (no per-prop posts), stable id across rebuilds and a ledger copy, per-template design approval, once-only send per week", { skip, timeout: 600_000 }, async () => {
  const A = harness();
  await A.o.handleCommand("Team, prepare today's content queue (build 1)", FOUNDER);
  const first = top5Posts(A.o);
  assert.equal(first.length, 1, "one consolidated weekly post");
  const w = first[0];
  assert.equal(w.package.postId, "top5-week|NFL|2026-W08|v1");
  assert.equal(w.package.status, "READY", w.package.reasons.join("; "));
  assert.equal(w.package.mediaSet.length, 3);
  assert.ok(w.package.mediaSet.every((m) => m.width === 1080 && m.height === 1350 && m.template === TOP5_TEMPLATE));
  assert.equal(w.package.suggestedPublishAt, "2026-10-29T22:15:00.000Z");
  assert.equal(w.package.queueLabel, "WEEKLY TOP 5 · NFL Week 8");
  assert.ok(w.options.every((c) => c.check.ok), JSON.stringify(w.options.map((c) => c.check)));
  assert.ok(w.options.every((c) => c.publishBundle.packageId === w.package.postId && c.publishBundle.mediaSetSha256 && c.publishBundle.contentKey === w.package.contentKey));
  assert.doesNotMatch(w.options.map((c) => c.text).join(" "), /odds|\bbet|\bpicks?\b|value|edge|lock|https?:|hit rate/i);
  assert.deepEqual(w.package.appeared.map((x) => x.rows.length), [5, 5, 5], "the immutable record of what appeared");
  assert.equal(w.package.evidence.at(-1).sha256, w.package.boardSha256);
  assert.ok(!A.o.state().posts.some((p) => p.package.kind === "top5-board"), "per-prop NFL boards are no longer proposed");

  // rebuild: the same content keeps its id; nothing new is created for it
  await A.o.handleCommand("Team, prepare today's content queue (build 2)", FOUNDER);
  assert.deepEqual([...new Set(top5Posts(A.o).map((p) => p.package.postId))], ["top5-week|NFL|2026-W08|v1"]);
  assert.equal(top5Posts(A.o).filter((p) => p.lifecycle !== "superseded").length, 1);

  // per-template design approvals: the social approval doesn't approve Top 5; the old approval keeps working
  assert.equal((await approveA(A.o, current(A.o))).code, "DESIGN_NOT_APPROVED");
  A.store.append("design-approval", "founder", { template: "gtp-social@2.3", assetManifest: "gtp-social@2.3-assets.1", approvedBy: "founder", approvedAt: "2026-10-28T20:00:00Z" }); // historical record
  assert.ok(A.o.approveDesign({ template: SOCIAL_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER).ok);
  assert.equal((await approveA(A.o, current(A.o))).code, "DESIGN_NOT_APPROVED", "a new template is unapproved until approved itself");
  assert.equal(A.o.approveDesign({ template: TOP5_TEMPLATE, assetManifest: ASSET_MANIFEST }, FOUNDER).code, "UNKNOWN_DESIGN", "a template binds its own manifest");
  assert.equal(A.o.approveDesign({ template: "gtp-social@2.3", assetManifest: "gtp-social@2.3-assets.1" }, FOUNDER).code, "UNKNOWN_DESIGN", "only current versions are approvable");
  let dz = A.o.state().design;
  assert.equal(dz.template, SOCIAL_TEMPLATE);
  assert.equal(dz.approved, true, "the original fields, unchanged");
  assert.deepEqual(dz.templates.map((x) => [x.template, x.approved]), [[SOCIAL_TEMPLATE, true], [TOP5_TEMPLATE, false]]);
  assert.ok(A.o.approveDesign({ template: TOP5_TEMPLATE, assetManifest: TOP5_ASSET_MANIFEST }, FOUNDER).ok);
  assert.equal(A.o.approveDesign({ template: TOP5_TEMPLATE, assetManifest: TOP5_ASSET_MANIFEST }, FOUNDER).duplicate, true);
  dz = A.o.state().design;
  assert.ok(dz.templates.every((x) => x.approved));
  assert.equal(A.store.list().filter((e) => e.kind === "design-approval" && e.data.template === "gtp-social@2.3").length, 1, "history untouched");
  const p1 = current(A.o);
  assert.ok((await approveA(A.o, p1)).ok);

  // schedulable by the X publisher at its rule time; dry run passes the full gate with 3 images
  const P = A.o.publishing;
  const s = P.schedule({ decisionId: p1.decisionId }, FOUNDER);
  assert.ok(s.ok, JSON.stringify(s));
  assert.equal(s.job.dueAt, "2026-10-29T22:15:00.000Z");
  assert.equal(s.job.baseId, "top5-week|NFL|2026-W08");
  const dry = await P.publishNow({ decisionId: p1.decisionId, live: false }, FOUNDER);
  assert.equal(dry.state, "DRY_RUN", JSON.stringify(dry));
  assert.equal(dry.requests.filter((r) => r.url === X_MEDIA_UPLOAD_URL).length, 3);

  // live (mocked X): sent once
  assert.ok((await P.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER)).ok);
  const sent = await P.publishNow({ decisionId: p1.decisionId, live: true }, FOUNDER);
  assert.equal(sent.state, "PUBLISHED", JSON.stringify(sent));
  assert.ok(A.store.readClaim("xlive|top5-week|NFL|2026-W08|0"), "the once-only claim keys on the week's identity");
  const again = await P.publishNow({ decisionId: p1.decisionId, live: true }, FOUNDER);
  assert.equal(again.code, "ALREADY_PUBLISHED");

  // ledger copy (what sync-ledger carries: every entry, claim and image) → the other host sees the same id and claim
  const dirB = tempDir("gtp-cc-top5-b-");
  fs.cpSync(A.dir, dirB, { recursive: true });
  const B = harness({ dir: dirB, seed: false });
  await B.o.handleCommand("Team, prepare today's content queue (build 3)", FOUNDER);
  assert.deepEqual([...new Set(top5Posts(B.o).map((p) => p.package.postId))], ["top5-week|NFL|2026-W08|v1"], "same id after a ledger copy");
  assert.ok(B.store.readClaim("xlive|top5-week|NFL|2026-W08|0"));
  assert.equal((await B.o.publishing.publishNow({ decisionId: p1.decisionId, live: true }, FOUNDER)).code, "ALREADY_PUBLISHED");

  // the official board changes after the week was sent: nothing new is drafted (the week is done) and the copy never called X
  B.setSrc(patched(real, WEEKLY, (j) => { j.boards[0].rows[4].probability = 0.66; j.boards[0].rows[4].value = 0.66; return j; }));
  await B.o.handleCommand("Team, prepare today's content queue (build 4)", FOUNDER);
  assert.deepEqual([...new Set(top5Posts(B.o).map((p) => p.package.postId))], ["top5-week|NFL|2026-W08|v1"]);
  assert.equal(top5Posts(B.o).find((p) => p.decisionId === p1.decisionId).lifecycle, "published", "history untouched");
  assert.equal(B.xcalls.length, 0, "the copy never called X");

  // after the first game: held, never sent
  A.setNow("2026-10-30T00:16:00.000Z");
  const late = await A.o.publishing.publishNow({ decisionId: p1.decisionId, live: false }, FOUNDER);
  assert.equal(late.state, "MISSED");
});

test("versions: same content → same version; changed content → next version (pure)", () => {
  const priors = [{ postId: "top5-week|NFL|2026-W08|v1", contentKey: "k1", template: "t" }, { postId: "top5-week|NFL|2026-W08|v2", contentKey: "k2", template: "t" }, { postId: "top5-week|NFL|2026-W09|v1", contentKey: "k9", template: "t" }];
  assert.equal(assignVersion("top5-week|NFL|2026-W08", { contentKey: "k1", template: "t" }, priors), 1);
  assert.equal(assignVersion("top5-week|NFL|2026-W08", { contentKey: "k2", template: "t" }, priors), 2);
  assert.equal(assignVersion("top5-week|NFL|2026-W08", { contentKey: "k3", template: "t" }, priors), 3);
  assert.equal(assignVersion("top5-week|NFL|2026-W08", { contentKey: "k1", template: "t2" }, priors), 3, "a new template is a new version");
  assert.equal(assignVersion("top5-week|NFL|2026-W10", { contentKey: "k1", template: "t" }, priors), 1);
  assert.equal(etDateOf("2026-10-30T00:15:00Z"), "2026-10-29");
});

test("versions in the queue: a changed official board before approval drafts v2 and supersedes v1; v1 can't be approved", { skip, timeout: 600_000 }, async () => {
  const C = harness();
  await C.o.handleCommand("Team, prepare today's content queue (build 5)", FOUNDER);
  const v1 = current(C.o);
  assert.equal(v1.package.postId, "top5-week|NFL|2026-W08|v1");
  C.setSrc(patched(real, WEEKLY, (j) => { j.boards[0].rows[4].probability = 0.66; j.boards[0].rows[4].value = 0.66; return j; }));
  await C.o.handleCommand("Team, prepare today's content queue (build 6)", FOUNDER);
  const v2 = current(C.o);
  assert.equal(v2.package.postId, "top5-week|NFL|2026-W08|v2");
  assert.equal(C.o.state().posts.find((p) => p.decisionId === v1.decisionId).lifecycle, "superseded");
  assert.ok(C.o.approveDesign({ template: TOP5_TEMPLATE, assetManifest: TOP5_ASSET_MANIFEST }, FOUNDER).ok);
  assert.equal((await approveA(C.o, v1)).code, "SUPERSEDED");
  // the approval re-checks against the CURRENT data (the patched board): v2 matches it
  assert.ok((await approveA(C.o, v2)).ok);
  // and the board going back to the earlier content blocks v2 at the gate (re-check) — it never sends stale rows
  C.setSrc(real);
  assert.ok((await C.o.publishing.setPolicy({ mode: "live", capUsd: 5, authorization: liveAuthorizationText(5) }, FOUNDER)).ok);
  const r = await C.o.publishing.publishNow({ decisionId: v2.decisionId, live: true }, FOUNDER);
  assert.equal(r.code, "VERIFICATION_CHANGED");
  assert.equal(C.xcalls.length, 0);
});

test("individual NFL game posts get the 45-minute publishing time (pregame winner and Top 3 TD)", async () => {
  const { nflPregamePackage, nflTouchdownsPackage } = await import("../contracts/social-packages.mjs");
  const m = { eventId: "e1", away: { abbr: "CAR" }, home: { abbr: "GB" }, kickoff: "2026-10-30T00:15:00Z", candidates: [], favouredTeam: { name: "Green Bay Packers" }, winnerLabel: "Predicted Winner", kickoffLine: "k", frozenLine: "f", winProbabilityDisplay: "63.8%" };
  const td = (() => { try { return nflTouchdownsPackage({ date: "2026-10-29", m, extra: { template: "t", assetManifest: "a", dataCommit: "c" } }); } catch (err) { return { error: err.message }; } })();
  assert.equal(td.suggestedPublishAt, "2026-10-29T23:30:00.000Z");
  const pg = (() => { try { return nflPregamePackage({ date: "2026-10-29", m, extra: { template: "t", assetManifest: "a", dataCommit: "c" }, verification: { kickoffUtc: "2026-10-30T00:15:00Z", status: "READY", reasons: [] } }); } catch (err) { return { error: err.message }; } })();
  assert.equal(pg.suggestedPublishAt, "2026-10-29T23:30:00.000Z");
  assert.deepEqual([td.error, pg.error], [undefined, undefined], "both builders run on the model");
});
