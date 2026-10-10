/**
 * TRUTH-001 · which revision did the public site actually serve before the start? (founder decision 4)
 *
 * Run: npx tsx --test src/lib/publication-evidence/served-revision.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { STATUS, eventCutoff, servedForecastOfRecord } from "./served-revision.mjs";

const START = "2026-09-27T19:10:00Z";
const WINDOW = { from: "2026-09-01T00:00:00Z", to: "2026-10-09T00:00:00Z" };
const rev = (id, generatedAt, extra = {}) => ({ id, generatedAt, contentHash: `h-${id}`, modelVersion: "mv", forecastVersion: "fv", ...extra });
const game = (id) => ({ gamePk: 1, status: "ready", hash: `h-${id}` });
const dep = (id, sha, readyAt, state = "READY") => ({ id, sha, readyAt, state });
const hashOf = (g) => g.hash;
/** Build content per deployment sha: which revision of the game each build carried. */
const builds = (map) => (sha) => (sha in map ? (map[sha] === "UNREADABLE" ? { ok: false } : { ok: true, game: map[sha] }) : { ok: false });
const run = (over) => servedForecastOfRecord({
  start: { scheduledStarts: [START] },
  evidenceWindow: WINDOW,
  hashOf,
  candidates: [rev("A", "2026-09-27T15:10:00Z"), rev("B", "2026-09-27T19:08:06Z")],
  ...over,
});

test("the 2026-09-27 shape: B was generated 2 min before first pitch but its deployment was READY after it — A is of record", () => {
  const r = run({
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T19:13:40Z")],
    servedAt: builds({ s1: game("A"), s2: game("B") }),
  });
  assert.equal(r.status, STATUS.SERVED);
  assert.equal(r.forecastOfRecord.revisionId, "A");
  assert.equal(r.forecastOfRecord.publishedAt, "2026-09-27T15:25:00Z");
  assert.equal(r.forecastOfRecord.generatedAt, "2026-09-27T15:10:00Z");
  assert.equal(r.deployment.id, "d1");
  assert.equal(r.cutoffBasis, "EARLIEST_SCHEDULED_START");
});

test("overlapping deployments: the LAST one READY before the cutoff is what served, not the last one started", () => {
  // d3 started first but became READY last (after the cutoff); d2 started later and was READY before it.
  const r = run({
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d3", "s3", "2026-09-27T19:20:00Z"), dep("d2", "s2", "2026-09-27T19:09:00Z")],
    servedAt: builds({ s1: game("A"), s2: game("B"), s3: game("B") }),
  });
  assert.equal(r.status, STATUS.SERVED);
  assert.equal(r.forecastOfRecord.revisionId, "B");
  assert.equal(r.forecastOfRecord.deploymentReadyAt, "2026-09-27T19:09:00Z");
});

test("failed, canceled or never-READY deployments serve nothing", () => {
  const r = run({
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T19:00:00Z", "ERROR"), dep("d3", "s3", null, "CANCELED")],
    servedAt: builds({ s1: game("A"), s2: game("B"), s3: game("B") }),
  });
  assert.equal(r.forecastOfRecord.revisionId, "A");
});

test("publishedAt is the first READY deployment of the unbroken run that served the same bytes", () => {
  const r = run({
    deployments: [dep("d0", "s0", "2026-09-27T12:00:00Z"), dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T17:00:00Z"), dep("d3", "s3", "2026-09-27T18:30:00Z")],
    candidates: [rev("Z", "2026-09-27T11:00:00Z"), rev("A", "2026-09-27T15:10:00Z")],
    servedAt: builds({ s0: game("Z"), s1: game("A"), s2: game("A"), s3: game("A") }),
  });
  assert.equal(r.forecastOfRecord.revisionId, "A");
  assert.equal(r.forecastOfRecord.publishedAt, "2026-09-27T15:25:00Z", "not d0, which served different bytes");
  assert.equal(r.forecastOfRecord.deploymentReadyAt, "2026-09-27T18:30:00Z");
  assert.equal(r.firstServingDeployment.id, "d1");
});

test("a rollback (a probe saw a different build after the serving deployment went READY) fails closed", () => {
  const r = run({
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T17:00:00Z")],
    servedAt: builds({ s1: game("A"), s2: game("B") }),
    candidates: [rev("A", "2026-09-27T15:10:00Z"), rev("B", "2026-09-27T16:50:00Z")],
    probes: [{ at: "2026-09-27T18:00:00Z", servedSha: "s1" }],
  });
  assert.equal(r.status, STATUS.PROBE_CONFLICT);
  assert.equal(r.forecastOfRecord, undefined, "no forecast of record is asserted");
  // A probe that agrees changes nothing.
  const ok = run({
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T17:00:00Z")],
    servedAt: builds({ s1: game("A"), s2: game("B") }),
    candidates: [rev("A", "2026-09-27T15:10:00Z"), rev("B", "2026-09-27T16:50:00Z")],
    probes: [{ at: "2026-09-27T18:00:00Z", servedSha: "s2" }, { at: "2026-09-27T16:00:00Z", servedSha: "s1" }],
  });
  assert.equal(ok.status, STATUS.SERVED);
  assert.equal(ok.forecastOfRecord.revisionId, "B");
});

test("revised start: an EARLIER revised schedule is the cutoff; a delay uses the actual start", () => {
  assert.deepEqual(eventCutoff({ scheduledStarts: ["2026-09-27T19:10:00Z", "2026-09-27T17:05:00Z"] }), { cutoff: "2026-09-27T17:05:00.000Z", basis: "EARLIEST_SCHEDULED_START" });
  assert.deepEqual(eventCutoff({ actualStartTime: "2026-09-27T20:41:00Z", scheduledStarts: ["2026-09-27T19:10:00Z"] }), { cutoff: "2026-09-27T20:41:00.000Z", basis: "ACTUAL_START" });
  assert.equal(eventCutoff({ scheduledStarts: [null, "nonsense"] }), null);
  // Moved earlier: the deployment READY at 17:00 is now after the cutoff, so A (READY 15:25) is of record.
  const r = run({
    start: { scheduledStarts: [START, "2026-09-27T16:30:00Z"] },
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T17:00:00Z")],
    servedAt: builds({ s1: game("A"), s2: game("B") }),
    candidates: [rev("A", "2026-09-27T15:10:00Z"), rev("B", "2026-09-27T16:00:00Z")],
  });
  assert.equal(r.forecastOfRecord.revisionId, "A");
  // A rain delay: the 19:13 deployment was READY before the real 20:41 start, so B is of record.
  const d = run({
    start: { actualStartTime: "2026-09-27T20:41:00Z", scheduledStarts: [START] },
    deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T19:13:40Z")],
    servedAt: builds({ s1: game("A"), s2: game("B") }),
  });
  assert.equal(d.forecastOfRecord.revisionId, "B");
  assert.equal(d.cutoffBasis, "ACTUAL_START");
});

test("fails closed: no start, evidence gaps, unreadable builds, not served, unmatched, generated too late", () => {
  const deployments = [dep("d1", "s1", "2026-09-27T15:25:00Z")];
  assert.equal(run({ start: {}, deployments, servedAt: builds({ s1: game("A") }) }).status, STATUS.NO_START_TIME);
  assert.equal(run({ evidenceWindow: { from: WINDOW.from, to: "2026-09-27T12:00:00Z" }, deployments, servedAt: builds({ s1: game("A") }) }).status, STATUS.EVIDENCE_GAP, "record captured before the cutoff");
  assert.equal(run({ evidenceWindow: { from: "2026-09-28T00:00:00Z", to: WINDOW.to }, deployments, servedAt: builds({ s1: game("A") }) }).status, STATUS.EVIDENCE_GAP, "record starts after the cutoff");
  assert.equal(run({ evidenceWindow: { from: "2026-09-27T16:00:00Z", to: WINDOW.to }, deployments, servedAt: builds({ s1: game("A") }) }).status, STATUS.EVIDENCE_GAP, "the serving deployment predates the record");
  assert.equal(run({ deployments, servedAt: builds({ s1: "UNREADABLE" }) }).status, STATUS.BUILD_UNREADABLE);
  assert.equal(run({ deployments, servedAt: builds({ s1: null }) }).status, STATUS.NOT_SERVED);
  assert.equal(run({ deployments, servedAt: builds({ s1: { gamePk: 1, status: "unavailable", hash: "x" } }) }).status, STATUS.NOT_SERVED);
  assert.equal(run({ deployments, servedAt: builds({ s1: game("Q") }) }).status, STATUS.SERVED_UNMATCHED);
  assert.equal(run({ deployments, candidates: [rev("A", "2026-09-27T19:30:00Z")], servedAt: builds({ s1: game("A") }) }).status, STATUS.SERVED_AFTER_GENERATION_CUTOFF);
  assert.equal(run({ deployments, candidates: [rev("A", null)], servedAt: builds({ s1: game("A") }) }).status, STATUS.SERVED_AFTER_GENERATION_CUTOFF, "no invented generation time");
});

test("a READY time within the record's uncertainty of the cutoff is ambiguous, either side, and never resolved", () => {
  for (const readyAt of ["2026-09-27T19:09:30Z", "2026-09-27T19:10:30Z"]) {
    const r = run({
      deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", readyAt)],
      servedAt: builds({ s1: game("A"), s2: game("B") }),
      readyUncertaintyMs: 60_000,
    });
    assert.equal(r.status, STATUS.AMBIGUOUS_NEAR_CUTOFF, readyAt);
    assert.equal(r.forecastOfRecord, undefined);
  }
  // Outside the margin it resolves normally.
  const r = run({ deployments: [dep("d1", "s1", "2026-09-27T15:25:00Z"), dep("d2", "s2", "2026-09-27T19:12:00Z")], servedAt: builds({ s1: game("A"), s2: game("B") }), readyUncertaintyMs: 60_000 });
  assert.equal(r.forecastOfRecord.revisionId, "A");
});

test("no clock, no network, no fs: the module is pure", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./served-revision.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bimport\b[^;]*from\s+["']node:/);
  assert.doesNotMatch(src, /Date\.now\(\)|new Date\(\)/);
});
