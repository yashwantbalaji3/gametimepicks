/**
 * TRUTH-001 · Option B grader switch (PROPOSAL, opt-in): the MLB grader grades the revision a READY Production
 * deployment SERVED before the start, and refuses whenever the evidence cannot decide it. The default rule is
 * unchanged. The shapes are the real ones found by the shadow (classification.json, 2026-10-10; re-run 2026-10-17).
 *
 * Run: npx tsx --test src/lib/mlb/prediction/served-forecast-selector.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeDate } from "./grade-games.mjs";
import { makeServedRevisionSelector, candidatesForGame, summariseRefusals, SELECTOR_REFUSAL, FORECAST_OF_RECORD_RULE } from "./served-forecast-selector.mjs";
import { STATUS } from "../../publication-evidence/served-revision.mjs";

const PK = 823579;
const SCHED = "2026-09-04T23:10:00Z";
const WINDOW = { from: "2026-09-01T00:00:00Z", to: "2026-10-09T00:00:00Z" };

// A prediction row as the dated artifact carries it. `hash` stands in for artifactHash.
const pred = (hash, over = {}) => ({
  gamePk: PK, slateDate: "2026-09-04", awayTeam: "SF", homeTeam: "NYM", artifactHash: hash, status: "ready",
  moneyline: { side: "away", team: "SF", simulationProbability: 0.508, marketImpliedProbability: 0.37 },
  total: { pick: "UNDER", line: 7.5, overProbability: 0.391, underProbability: 0.609, marketImpliedOver: 0.5 },
  runLine: { pick: "NYM +1.5", pickSide: "home", pickLine: 1.5, coverProbability: 0.638 },
  ...over,
});
// The revision the site served (A, a commit from the afternoon) and the one the old rule graded (B, a snapshot
// generated 10 s before the scheduled start, never deployed before first pitch). B picked the other side.
const A = pred("hA");
const B = pred("hB", {
  moneyline: { side: "home", team: "NYM", simulationProbability: 0.527, marketImpliedProbability: 0.63 },
  total: { pick: "UNDER", line: 7.5, overProbability: 0.358, underProbability: 0.642, marketImpliedOver: 0.5 },
  runLine: { pick: "SF +1.5", pickSide: "away", pickLine: 1.5, coverProbability: 0.67 },
});
const rev = (source, generatedAt, rows) => ({ source, generatedAt, byGamePk: new Map(rows.map((r) => [r.gamePk, r])) });
const REVS = [rev("git:7942eb5dba66", "2026-09-04T20:57:41.000Z", [A]), rev("snapshot:2026-09-04/snapshot-202609042309.json", "2026-09-04T23:09:50.000Z", [B])];
const FINAL = { gamePk: PK, isFinal: true, homeRuns: 10, awayRuns: 6 }; // NYM 10, SF 6
const dep = (id, sha, readyAt, state = "READY", createdAt = readyAt) => ({ id, sha, readyAt, state, createdAt });
const builds = (map) => (sha) => (sha in map ? (map[sha] === "UNREADABLE" ? { ok: false } : { ok: true, game: map[sha] }) : { ok: false });
const ACTUAL = new Map([[PK, { from: "2026-09-04T23:10:20.805Z", to: "2026-09-04T23:10:30.805Z" }]]);

const selector = (over = {}) => makeServedRevisionSelector({
  deployments: [dep("d1", "s1", "2026-09-04T21:04:12.644Z"), dep("d2", "s2", "2026-09-04T22:56:06.759Z")],
  evidenceWindow: WINDOW,
  servedGameAt: (sha) => builds({ s1: A, s2: A, s3: B })(sha),
  actualStartByGamePk: ACTUAL,
  recordClock: { earlyMs: 5000, lateMs: 5000 },
  ...over,
});
const run = (selectRevision, alreadyGraded = new Set()) => gradeDate({ revisions: REVS, finals: [FINAL], firstPitchByGamePk: new Map([[PK, SCHED]]), alreadyGraded, selectRevision });
const byMarket = (rows) => Object.fromEntries(rows.map((r) => [r.market, r]));

test("default rule is unchanged: the newest revision generated before first pitch (B) is graded, no refusals", () => {
  const { graded, skipped } = run(null);
  const m = byMarket(graded);
  assert.equal(m.moneyline.forecastSource, "snapshot:2026-09-04/snapshot-202609042309.json");
  assert.equal(m.moneyline.pick, "NYM (home)");
  assert.equal(m.moneyline.outcome, "WIN");
  assert.deepEqual(skipped.notOfRecord, []);
});

test("Option B: the SERVED revision (A) is graded — the 823579 shape, where the outcome flips", () => {
  const { graded, skipped } = run(selector());
  const m = byMarket(graded);
  assert.equal(graded.length, 3);
  assert.equal(m.moneyline.forecastSource, "git:7942eb5dba66");
  assert.equal(m.moneyline.forecastGeneratedAt, "2026-09-04T20:57:41.000Z");
  assert.equal(m.moneyline.pick, "SF (away)");
  assert.equal(m.moneyline.outcome, "LOSS", "the public saw SF; SF lost — a WIN the public never saw is not on the record");
  assert.equal(m.run_line.pick, "NYM +1.5");
  assert.equal(m.run_line.outcome, "WIN");
  assert.deepEqual(skipped.notOfRecord, []);
});

test("never public: the serving build showed the game unavailable → refused NOT_SERVED, nothing graded, not a loss", () => {
  const { graded, skipped } = run(selector({ servedGameAt: (sha) => builds({ s1: { gamePk: PK, status: "unavailable" }, s2: { gamePk: PK, status: "unavailable" } })(sha) }));
  assert.equal(graded.length, 0);
  assert.equal(skipped.notOfRecord.length, 1);
  assert.equal(skipped.notOfRecord[0].status, STATUS.NOT_SERVED);
  assert.equal(skipped.missingPreEvent.length, 0, "a refusal is not re-labelled as a missing artifact");
});

test("ambiguous near the start (a build READY inside the record's clock band) → refused, never a guess", () => {
  const { graded, skipped } = run(selector({
    deployments: [dep("d1", "s1", "2026-09-04T21:04:12Z"), dep("d3", "s3", "2026-09-04T23:10:25Z")],
    servedGameAt: (sha) => builds({ s1: A, s3: B })(sha),
    recordClock: { earlyMs: 60_000, lateMs: 600_000 },
  }));
  assert.equal(graded.length, 0);
  assert.equal(skipped.notOfRecord[0].status, STATUS.AMBIGUOUS_NEAR_CUTOFF);
});

test("an untrusted FAILURE record near the start → refused AMBIGUOUS_DEPLOYMENT_STATE (GitHub logged one READY as FAILURE)", () => {
  const { graded, skipped } = run(selector({
    deployments: [dep("d1", "s1", "2026-09-04T21:04:12Z"), dep("dX", "s3", null, "FAILURE", "2026-09-04T23:40:00Z")],
    untrustedStates: { states: ["FAILURE"], lagMs: 3_600_000 },
  }));
  assert.equal(graded.length, 0);
  assert.equal(skipped.notOfRecord[0].status, STATUS.AMBIGUOUS_DEPLOYMENT_STATE);
});

test("evidence gap: a record not captured through the start refuses tonight and grades once the record covers it", () => {
  const early = run(selector({ evidenceWindow: { from: WINDOW.from, to: "2026-09-04T23:00:00Z" } }));
  assert.equal(early.graded.length, 0);
  assert.equal(early.skipped.notOfRecord[0].status, STATUS.EVIDENCE_GAP);
  const later = run(selector());
  assert.equal(later.graded.length, 3, "the refusal does not stick: nothing was written for the game");
});

test("824424 shape: served revision generated after the SCHEDULED start but before the actual one is HELD until the timing amendment", () => {
  const SCHED2 = "2026-09-04T18:10:00Z";
  const revs = [rev("git:old", "2026-09-04T10:00:00Z", [pred("hOld")]), rev("git:5b6909de853c", "2026-09-04T18:31:58.000Z", [pred("hNew")])];
  const actual = new Map([[PK, { from: "2026-09-04T19:15:01.585Z", to: "2026-09-04T19:15:11.585Z" }]]);
  const opts = {
    deployments: [dep("d1", "s1", "2026-09-04T12:00:00Z"), dep("d2", "s2", "2026-09-04T18:40:02.616Z")],
    servedGameAt: (sha) => builds({ s1: pred("hOld"), s2: pred("hNew") })(sha),
    actualStartByGamePk: actual,
  };
  const go = (o) => gradeDate({ revisions: revs, finals: [FINAL], firstPitchByGamePk: new Map([[PK, SCHED2]]), selectRevision: selector({ ...opts, ...o }) });
  const held = go({});
  assert.equal(held.graded.length, 0);
  assert.equal(held.skipped.notOfRecord[0].status, SELECTOR_REFUSAL.HELD_GENERATED_AFTER_SCHEDULED_START);
  const allowed = go({ allowGeneratedAfterScheduledStart: true });
  assert.equal(allowed.graded[0].forecastSource, "git:5b6909de853c");
});

test("a frozen copy carried byte for byte is the EARLIEST revision with those bytes", () => {
  const revs = [rev("git:first", "2026-09-04T12:00:00Z", [A]), rev("snapshot:copy", "2026-09-04T22:00:00Z", [A]), ...REVS.slice(1)];
  const c = candidatesForGame(revs, PK);
  assert.deepEqual(c.map((x) => [x.id, x.contentHash]), [["git:first", "hA"], ["snapshot:2026-09-04/snapshot-202609042309.json", "hB"]]);
  const { graded } = gradeDate({ revisions: revs, finals: [FINAL], firstPitchByGamePk: new Map([[PK, SCHED]]), selectRevision: selector() });
  assert.equal(graded[0].forecastSource, "git:first");
});

test("candidates never include an unavailable row or a row without a content hash", () => {
  const revs = [rev("a", "2026-09-04T10:00:00Z", [{ gamePk: PK, status: "unavailable", artifactHash: "hU" }]), rev("b", "2026-09-04T11:00:00Z", [{ gamePk: PK, status: "ready" }])];
  assert.deepEqual(candidatesForGame(revs, PK), []);
});

test("an already-graded game is never re-selected or regraded (append-only), whatever the rule", () => {
  const { graded, skipped } = run(selector(), new Set([`${PK}:moneyline`]));
  assert.equal(graded.length, 0);
  assert.equal(skipped.alreadyGraded, 1);
  assert.equal(FORECAST_OF_RECORD_RULE.SERVED, "SERVED_BEFORE_START");
});

/* ── Classification edges (added 2026-10-17 with the restatement proposal) ─────────────────────────────────────────
 * Each one pins a refusal the restatement relies on: an unreadable build is never read as "not served", "never public"
 * is never inferred across an ambiguous window, the ±60 s / −600 s clock bands refuse on both sides of the start,
 * and content invariance (every possible build carried the same bytes) is NOT applied by the resolver as written. */

const refusedAs = (res, status) => {
  assert.equal(res.graded.length, 0, "a refused game writes no graded row");
  assert.equal(res.skipped.notOfRecord.length, 1);
  assert.equal(res.skipped.notOfRecord[0].status, status);
  assert.equal(res.skipped.missingPreEvent.length, 0, "a refusal is not re-labelled as a missing artifact");
};

test("unreadable serving build → refused BUILD_UNREADABLE, never read as NOT_SERVED (the 2026-09-07 shape: the build had no dated file)", () => {
  const res = run(selector({ servedGameAt: (sha) => builds({ s1: A, s2: "UNREADABLE" })(sha) }));
  refusedAs(res, STATUS.BUILD_UNREADABLE);
  assert.match(res.skipped.notOfRecord[0].reason, /d2/);
});

test("an unreadable EARLIER build only stops the publishedAt walk-back; the serving build still decides the grade", () => {
  const sel = selector({ servedGameAt: (sha) => builds({ s1: "UNREADABLE", s2: A })(sha) });
  const out = sel(PK, SCHED, REVS);
  assert.equal(out.revision.source, "git:7942eb5dba66");
  assert.equal(out.evidence.publishedAt, "2026-09-04T22:56:06.759Z", "publishedAt is never pushed earlier than evidence shows");
  assert.equal(run(sel).graded.length, 3);
});

test("never public: the serving build carries no row at all for the game → refused NOT_SERVED", () => {
  refusedAs(run(selector({ servedGameAt: (sha) => builds({ s1: A, s2: null })(sha) })), STATUS.NOT_SERVED);
});

test("never public is never inferred across an ambiguous window, in either direction", () => {
  const near = [dep("d1", "s1", "2026-09-04T21:04:12Z"), dep("d3", "s3", "2026-09-04T23:10:25Z")];
  const unavail = { gamePk: PK, status: "unavailable" };
  // the build surely serving before the start showed it unavailable, a build READY inside the band carried A
  refusedAs(run(selector({ deployments: near, servedGameAt: (sha) => builds({ s1: unavail, s3: A })(sha) })), STATUS.AMBIGUOUS_NEAR_CUTOFF);
  // the mirror: A was serving, the build inside the band showed it unavailable
  refusedAs(run(selector({ deployments: near, servedGameAt: (sha) => builds({ s1: A, s3: unavail })(sha) })), STATUS.AMBIGUOUS_NEAR_CUTOFF);
});

// A later actual start so a build can carry B (generated 23:09:50Z) and still be READY before it.
const LATE = new Map([[PK, { from: "2026-09-04T23:12:00.000Z", to: "2026-09-04T23:12:10.000Z" }]]);
const withBuild = (readyAt, clock) => selector({
  deployments: [dep("d1", "s1", "2026-09-04T21:04:12Z"), dep("d3", "s3", readyAt)],
  servedGameAt: (sha) => builds({ s1: A, s3: B })(sha),
  actualStartByGamePk: LATE,
  recordClock: clock,
});
const TYPICAL = { earlyMs: 60_000, lateMs: 60_000 }; // the ±60 s GitHub ambiguity margin
const CONSERVATIVE = { earlyMs: 60_000, lateMs: 600_000 }; // GitHub's worst observed clock: up to 10 min late

test("±60 s margin, early side: READY recorded 45 s before the start is ambiguous; 61 s before verifies that build", () => {
  refusedAs(run(withBuild("2026-09-04T23:11:15Z", TYPICAL)), STATUS.AMBIGUOUS_NEAR_CUTOFF);
  const ok = run(withBuild("2026-09-04T23:10:59Z", TYPICAL));
  assert.equal(ok.graded.length, 3);
  assert.equal(byMarket(ok.graded).moneyline.forecastSource, "snapshot:2026-09-04/snapshot-202609042309.json");
});

test("±60 s margin, late side: READY recorded 55 s after the latest possible start is ambiguous; 61 s after leaves the earlier build of record", () => {
  refusedAs(run(withBuild("2026-09-04T23:13:05Z", TYPICAL)), STATUS.AMBIGUOUS_NEAR_CUTOFF);
  const ok = run(withBuild("2026-09-04T23:13:11Z", TYPICAL));
  assert.equal(byMarket(ok.graded).moneyline.forecastSource, "git:7942eb5dba66");
});

test("GitHub conservative band (−600 s): READY recorded 9 min after the start is still ambiguous; 10 min + 1 s after is not", () => {
  refusedAs(run(withBuild("2026-09-04T23:21:10Z", CONSERVATIVE)), STATUS.AMBIGUOUS_NEAR_CUTOFF);
  const ok = run(withBuild("2026-09-04T23:22:11Z", CONSERVATIVE));
  assert.equal(byMarket(ok.graded).moneyline.forecastSource, "git:7942eb5dba66");
});

test("content invariance is NOT applied: ambiguous even when every possible serving build carried the same bytes (founder decision to change)", () => {
  const res = run(selector({
    deployments: [dep("d1", "s1", "2026-09-04T21:04:12Z"), dep("d3", "s3", "2026-09-04T23:10:25Z")],
    servedGameAt: (sha) => builds({ s1: A, s3: A })(sha),
  }));
  refusedAs(res, STATUS.AMBIGUOUS_NEAR_CUTOFF);
});

test("served bytes matching no recorded revision → refused SERVED_UNMATCHED, never graded from the nearest revision", () => {
  refusedAs(run(selector({ servedGameAt: (sha) => builds({ s1: A, s2: pred("hZ") })(sha) })), STATUS.SERVED_UNMATCHED);
});

test("a start before the deployment record begins (GitHub has none before 2026-07-31 22:07Z) → refused EVIDENCE_GAP", () => {
  refusedAs(run(selector({ evidenceWindow: { from: "2026-09-05T00:00:00Z", to: WINDOW.to } })), STATUS.EVIDENCE_GAP);
});

test("refusal monitoring: a mixed slate grades the served game, refuses the other, and the tally counts it by status", () => {
  const PK2 = 824226;
  const other = { ...pred("hX"), gamePk: PK2, awayTeam: "MIN", homeTeam: "DET" };
  const revs = [rev("git:7942eb5dba66", "2026-09-04T20:57:41.000Z", [A, other])];
  const sel = selector({ servedGameAt: (sha, gamePk) => (gamePk === PK2 ? { ok: true, game: { gamePk: PK2, status: "unavailable" } } : { ok: true, game: A }) });
  const { graded, skipped } = gradeDate({
    revisions: revs,
    finals: [FINAL, { gamePk: PK2, isFinal: true, homeRuns: 7, awayRuns: 2 }],
    firstPitchByGamePk: new Map([[PK, SCHED], [PK2, SCHED]]),
    selectRevision: sel,
  });
  assert.deepEqual([...new Set(graded.map((g) => g.gamePk))], [PK]);
  const tally = summariseRefusals(skipped.notOfRecord);
  assert.equal(tally.total, 1);
  assert.equal(tally.byStatus.NOT_SERVED, 1);
  assert.equal(tally.byStatus.AMBIGUOUS_NEAR_CUTOFF, 0, "every status is listed, zeros included, so a monitor can alert on any of them");
  assert.equal(tally.byStatus.HELD_GENERATED_AFTER_SCHEDULED_START, 0);
  assert.equal("SERVED" in tally.byStatus, false);
  assert.deepEqual(summariseRefusals([]).total, 0);
});
