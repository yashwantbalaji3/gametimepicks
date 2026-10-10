/**
 * TRUTH-001 · the append-only MLB pregame-forecast recovery and the forecast-of-record correction proposals.
 *
 * Run: npx tsx --test src/lib/mlb/recovery/pregame-recovery.test.mjs
 *
 * Founder rules (2026-10-09): restore only forecasts with verifiable ORIGINAL pregame evidence; a commit time is not
 * publication — a Production deployment READY before first pitch is; uncertain cases stay quarantined; nothing is
 * regenerated or rewritten; nothing enters a public denominator by itself; no unreviewed regrade.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { classifyErasedGame, CLASS } from "./pregame-recovery.mjs";
import { stableHash } from "../../game-simulations/rng.ts";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const jsonl = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const hashOf = (g) => stableHash({ ...g, artifactHash: undefined });
const game = (status, extra = {}) => { const g = { gamePk: 1, status, completeness: { level: status === "unavailable" ? "unavailable" : "ready" }, ...extra }; return { ...g, artifactHash: hashOf(g) }; };
const FP = "2026-09-20T17:10:00Z";
const rev = (sha, commitTime, g, gen = commitTime) => ({ sha, commitTime, fileGeneratedAt: gen, game: g, predictions: g && { artifactHash: g.artifactHash } });
const dep = (id, readyAt, serves) => ({ id, commitSha: `${id}-sha`, readyAt, containsCommit: (sha) => serves.includes(sha) });

/* ── the classification rules (synthetic) ───────────────────────────────────────────────────────── */

test("served before first pitch → PUBLISHED_VERIFIED, with the deployment as evidence", () => {
  const g = game("ready", { v: 1 });
  const c = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T14:00:00Z", g), rev("z", "2026-09-20T18:00:00Z", game("unavailable"))], recomputeHash: hashOf, deployments: [dep("d1", "2026-09-20T14:07:00Z", ["a"])] });
  assert.equal(c.class, CLASS.PUBLISHED_VERIFIED);
  assert.equal(c.recovered.commit, "a");
  assert.equal(c.deployment.id, "d1");
  assert.equal(c.newerUnservedCommit, null);
});

test("a newer pre-pitch commit that was never served: the EARLIER served revision is the forecast of record", () => {
  const older = game("ready", { v: 1 }), newer = game("ready", { v: 2 });
  const c = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T14:00:00Z", older), rev("b", "2026-09-20T17:08:00Z", newer)], recomputeHash: hashOf,
    deployments: [dep("d1", "2026-09-20T14:07:00Z", ["a"]), dep("d2", "2026-09-20T17:14:00Z", ["a", "b"])] });
  assert.equal(c.class, CLASS.PUBLISHED_VERIFIED);
  assert.equal(c.recovered.commit, "a");
  assert.equal(c.newerUnservedCommit.commit, "b", "the unserved newer revision is recorded, not hidden");
});

test("committed before first pitch but never served in time → COMMITTED_UNVERIFIED (quarantined)", () => {
  const g = game("ready", { v: 1 });
  const c = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T17:08:00Z", g)], recomputeHash: hashOf, deployments: [dep("d1", "2026-09-20T17:12:00Z", ["a"])] });
  assert.equal(c.class, CLASS.COMMITTED_UNVERIFIED);
  assert.equal(c.deployment, null);
  assert.equal(c.recovered.tight, true);
});

test("never forecast, pulled before first pitch, or only post-start forecasts — never restored", () => {
  const u = game("unavailable");
  assert.equal(classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T14:00:00Z", u)], recomputeHash: hashOf }).class, CLASS.NOT_ACTUALLY_ERASED);
  const pulled = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T14:00:00Z", game("ready")), rev("b", "2026-09-20T16:00:00Z", u)], recomputeHash: hashOf });
  assert.equal(pulled.class, CLASS.NOT_ACTUALLY_ERASED, "the last pre-pitch revision had already withdrawn it");
  const postStart = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T18:06:00Z", game("ready"))], recomputeHash: hashOf });
  assert.equal(postStart.class, CLASS.UNRECOVERABLE);
  const genAfter = classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T17:09:00Z", game("ready"), "2026-09-20T17:11:00Z")], recomputeHash: hashOf });
  assert.equal(genAfter.class, CLASS.UNRECOVERABLE, "generated after first pitch, even if committed 'before'");
});

test("a revision whose stored hash does not recompute is never restored", () => {
  const g = { ...game("ready", { v: 1 }), artifactHash: "tampered" };
  assert.equal(classifyErasedGame({ firstPitchUtc: FP, revisions: [rev("a", "2026-09-20T14:00:00Z", g)], recomputeHash: hashOf, deployments: [dep("d", "2026-09-20T14:05:00Z", ["a"])] }).class, CLASS.UNRECOVERABLE);
});

/* ── the committed package (real history) ─────────────────────────────────────────────────────── */

const recoveries = jsonl("app/public/data/mlb/corrections/pregame-forecast-recoveries.jsonl");

test("243 erased games, each recorded once, with the classes the evidence supports", () => {
  assert.equal(recoveries.length, 243);
  assert.equal(new Set(recoveries.map((r) => r.key)).size, 243);
  const by = recoveries.reduce((m, r) => ({ ...m, [r.class]: (m[r.class] ?? 0) + 1 }), {});
  assert.deepEqual(by, { PUBLISHED_VERIFIED: 227, COMMITTED_UNVERIFIED: 4, UNRECOVERABLE: 4, NOT_ACTUALLY_ERASED: 8 });
  for (const r of recoveries) {
    assert.equal(r.quarantined, r.class !== CLASS.PUBLISHED_VERIFIED, r.key);
    assert.match(r.resultsEffect, /^NONE/, "no record enters a denominator by itself");
    if (r.class === CLASS.PUBLISHED_VERIFIED) {
      const fp = Date.parse(r.firstPitchUtc);
      assert.ok(Date.parse(r.publication.readyAt) < fp, `${r.key}: served before first pitch`);
      assert.ok(Date.parse(r.original.committedAt) < fp && Date.parse(r.original.fileGeneratedAt) < fp, r.key);
      assert.equal(r.original.hashVerified, true);
      assert.equal(r.publication.kind, "PRODUCTION_DEPLOYMENT_READY");
    }
  }
});

test("pinned (real): PHI @ NYM 823570 restores the 2026-09-20 pregame forecast, hash re-derived from git", () => {
  const r = recoveries.find((x) => x.key === "2026-09-20|823570");
  assert.equal(r.class, CLASS.PUBLISHED_VERIFIED);
  assert.ok(r.original.commit.startsWith("dcc2044962"));
  const file = JSON.parse(execFileSync("git", ["show", `${r.original.commit}:app/public/data/mlb/full-game-simulations/2026-09-20.json`], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString());
  const g = file.games.find((x) => x.gamePk === 823570);
  assert.equal(hashOf(g), r.original.artifactHash, "the stored value is the original bytes' hash");
  assert.equal(r.original.values.picks.moneyline.team, "NYM");
  // The public file at HEAD is untouched: still the post-start "unavailable" it became.
  const head = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/full-game-simulations/2026-09-20.json"), "utf8")).games.find((x) => x.gamePk === 823570);
  assert.equal(head.status, "unavailable");
});

/* ── forecast-of-record correction proposals (founder Option B) ───────────────────────────────── */

test("BAL @ NYY 823491: the graded forecast was never served; the public one is referenced; NOT applied", () => {
  const all = jsonl("app/public/data/mlb/corrections/forecast-of-record-corrections.jsonl");
  assert.equal(all.length, 14);
  assert.ok(all.every((c) => c.status === "PROPOSED_NOT_APPLIED"));
  const c = all.find((x) => x.gamePk === 823491);
  assert.equal(c.gradedForecast.generatedAt, "2026-09-25T20:04:50.000Z");
  assert.equal(c.gradedForecast.publicationEvidence, null);
  assert.ok(c.publicForecastOfRecord.commit.startsWith("f51be27b62"));
  assert.ok(Date.parse(c.publicForecastOfRecord.publication.readyAt) < Date.parse(c.firstPitchUtc));
  const ml = c.publicForecastOfRecord.grades.find((g) => g.market === "moneyline");
  assert.equal(ml.modelProbability, 0.544);
  assert.deepEqual(c.resultsEffectIfApplied.outcomeChangedMarkets, []);
  // The graded ledger still carries the original grade: no silent regrade.
  const graded = jsonl("app/public/data/mlb/results/game-predictions-graded.jsonl").filter((g) => g.gamePk === 823491);
  assert.equal(graded.find((g) => g.market === "moneyline").modelProbability, 0.56);
});
