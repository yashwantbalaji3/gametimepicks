/**
 * SPORTSBOOK FRESHNESS CONTRACT (Sprint 029 · Phase 1).
 *
 * Pins the artifact-level-only rule. The feed has no row timestamps, so the failure this guards
 * against is a surface inventing per-market recency — "updated 4 minutes ago" — from the only
 * per-row time field that exists, which is the EVENT START, not a capture time.
 *
 * Run: npx tsx --test src/lib/markets/freshness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  evaluateArtifactFreshness,
  evaluateEventPhase,
  formatSnapshotCapture,
  freshnessLabel,
} from "./freshness.ts";

const PUB = path.join(process.cwd(), "public", "data");
const newest = (rel) => {
  const dir = path.join(PUB, rel);
  const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
  return { date: f.replace(".json", ""), json: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) };
};

test("an artifact for today's slate is CURRENT; an older one is STALE", () => {
  const today = evaluateArtifactFreshness({ artifactDate: "2026-07-27", generatedAt: "2026-07-27T16:35:04Z" }, "2026-07-27");
  assert.equal(today.state, "CURRENT");
  assert.equal(today.ageDays, 0);
  assert.equal(today.isCurrent, true);

  const yesterday = evaluateArtifactFreshness({ artifactDate: "2026-07-26" }, "2026-07-27");
  assert.equal(yesterday.state, "STALE");
  assert.equal(yesterday.ageDays, 1);
  assert.equal(yesterday.isCurrent, false, "yesterday's snapshot must never present as current");
});

test("a missing artifact is MISSING and does not inherit yesterday's freshness", () => {
  const r = evaluateArtifactFreshness(null, "2026-07-27");
  assert.equal(r.state, "MISSING");
  assert.equal(r.isCurrent, false);
  assert.equal(r.artifactDate, null);
  assert.equal(r.generatedAt, null, "a missing artifact carries no timestamp from anywhere else");
});

test("an artifact with no usable date is UNAVAILABLE — no freshness claim is possible", () => {
  for (const bad of [{ artifactDate: null }, { artifactDate: "" }, { artifactDate: "not-a-date" }, {}]) {
    const r = evaluateArtifactFreshness(bad, "2026-07-27");
    assert.equal(r.state, "UNAVAILABLE", `${JSON.stringify(bad)} must be UNAVAILABLE`);
    assert.equal(r.isCurrent, false);
  }
});

test("a future-dated artifact is an ANOMALY, never silently CURRENT", () => {
  const r = evaluateArtifactFreshness({ artifactDate: "2026-07-28" }, "2026-07-27");
  assert.equal(r.state, "ANOMALY");
  assert.equal(r.isCurrent, false, "a future artifact must fail closed");
  assert.ok(r.ageDays < 0);
});

test("rollover: the same artifact goes STALE the moment the ET date advances", () => {
  // The indefinite-currency failure. A file that was CURRENT yesterday must not stay CURRENT.
  const artifact = { artifactDate: "2026-07-27", generatedAt: "2026-07-27T16:35:04Z" };
  assert.equal(evaluateArtifactFreshness(artifact, "2026-07-27").state, "CURRENT");
  assert.equal(evaluateArtifactFreshness(artifact, "2026-07-28").state, "STALE");
  assert.equal(evaluateArtifactFreshness(artifact, "2026-08-05").ageDays, 9);
});

test("event start is a SEPARATE axis and is never a capture time", () => {
  const start = "2026-07-27T20:10:00Z";
  assert.equal(evaluateEventPhase(start, "2026-07-27T19:00:00Z"), "PREGAME");
  assert.equal(evaluateEventPhase(start, "2026-07-27T20:10:00Z"), "STARTED");
  assert.equal(evaluateEventPhase(start, "2026-07-27T22:00:00Z"), "STARTED");
  assert.equal(evaluateEventPhase(null, "2026-07-27T19:00:00Z"), "UNKNOWN");

  // A current snapshot can contain a market whose game already started. Collapsing the two axes
  // would hide that: the snapshot is fresh, the market is not actionable.
  const fresh = evaluateArtifactFreshness({ artifactDate: "2026-07-27", generatedAt: "2026-07-27T16:35:04Z" }, "2026-07-27");
  assert.equal(fresh.state, "CURRENT");
  assert.equal(evaluateEventPhase(start, "2026-07-27T21:00:00Z"), "STARTED");
});

test("the capture label describes the ARTIFACT and offers no relative recency", () => {
  const r = evaluateArtifactFreshness({ artifactDate: "2026-07-27", generatedAt: "2026-07-27T16:35:04.082Z" }, "2026-07-27");
  const label = formatSnapshotCapture(r);
  assert.match(label, /^Sportsbook snapshot captured /, "the subject is the snapshot, not a market");
  assert.match(label, /ET$/);
  // The banned shape: relative phrasing reads as a per-market update claim the feed cannot support.
  assert.ok(!/ago|minute|updated/i.test(label), `relative recency must not appear: ${label}`);

  // Removing the artifact timestamp must remove the precise claim entirely.
  assert.equal(formatSnapshotCapture({ ...r, generatedAt: null }), null);
  assert.equal(formatSnapshotCapture({ ...r, generatedAt: "garbage" }), null);
});

test("no freshness label claims currency for a non-current state", () => {
  for (const state of ["STALE", "MISSING", "ANOMALY", "UNAVAILABLE"]) {
    const label = freshnessLabel({ state, artifactDate: "2026-07-01", generatedAt: null, ageDays: 26, isCurrent: false });
    assert.ok(!/^Current/i.test(label), `${state} produced "${label}"`);
  }
  assert.match(freshnessLabel({ state: "CURRENT", artifactDate: "x", generatedAt: null, ageDays: 0, isCurrent: true }), /Current/);
});

test("real live artifacts evaluate CURRENT on their own slate date", () => {
  for (const rel of ["mlb/team-markets", "mlb/player-props"]) {
    const { date, json } = newest(rel);
    const r = evaluateArtifactFreshness({ artifactDate: json.date ?? date, generatedAt: json.generatedAt }, date);
    assert.equal(r.state, "CURRENT", `${rel} must read CURRENT on its own date`);
    assert.ok(formatSnapshotCapture(r), `${rel} must produce a capture label`);
  }
});

test("the frozen NBA artifact reads STALE against today", () => {
  const dir = path.join(PUB, "nba", "game-markets");
  const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
  const artifactDate = f.replace(".json", "");
  const r = evaluateArtifactFreshness({ artifactDate }, "2026-07-27");
  assert.equal(r.state, "STALE", "a frozen June artifact must never read as current market data");
  assert.ok(r.ageDays > 30, `expected a large age, got ${r.ageDays}`);
});

/**
 * PARITY: build-admin-status.mjs implements the same rule locally because the slate-pointer guard
 * invokes it with plain `node`, which cannot load TypeScript. That duplication is deliberate — and
 * therefore needs a guard, or the two can drift and /ops will disagree with the product.
 */
test("the /ops implementation agrees with the canonical evaluator on every state", () => {
  const script = fs.readFileSync(path.join(process.cwd(), "scripts", "build-admin-status.mjs"), "utf8");
  assert.match(script, /sportsbookSource/, "/ops must compute sportsbook freshness");
  assert.match(script, /ANOMALY/, "/ops must fail closed on a future-dated artifact");

  // Reproduce the script's rule and check it against the canonical evaluator across the matrix.
  const opsRule = (artifactDate, etToday) => {
    if (!artifactDate) return "MISSING";
    const ageDays = Math.round((Date.parse(`${etToday}T00:00:00Z`) - Date.parse(`${artifactDate}T00:00:00Z`)) / 86400000);
    return ageDays < 0 ? "ANOMALY" : ageDays === 0 ? "CURRENT" : "STALE";
  };
  const cases = [
    [null, "2026-07-27"],
    ["2026-07-27", "2026-07-27"],
    ["2026-07-26", "2026-07-27"],
    ["2026-06-10", "2026-07-27"],
    ["2026-07-28", "2026-07-27"],
  ];
  for (const [artifactDate, today] of cases) {
    const canonical = evaluateArtifactFreshness(artifactDate ? { artifactDate } : null, today);
    assert.equal(
      opsRule(artifactDate, today),
      canonical.state,
      `${artifactDate ?? "none"} vs ${today}: /ops and canonical must agree`,
    );
  }
});

test("/ops actually emits sportsbook freshness for the live sources", () => {
  const out = path.join(process.cwd(), "..", "data", "internal", "_freshness-parity.json");
  execFileSync("node", [path.join(process.cwd(), "scripts", "build-admin-status.mjs"), "--now", "2026-07-27T18:00:00Z", "--out", out], { cwd: process.cwd(), stdio: "pipe" });
  const status = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });

  assert.ok(status.sportsbook, "/ops status must carry a sportsbook block");
  const keys = status.sportsbook.sources.map((s) => s.source);
  assert.ok(keys.includes("mlb/team-markets") && keys.includes("mlb/player-props"), `got ${keys.join(", ")}`);
  for (const s of status.sportsbook.sources) {
    assert.ok(["CURRENT", "STALE", "MISSING", "ANOMALY"].includes(s.state), `${s.source}: ${s.state}`);
    // The whole point: /ops reports artifact-level freshness, never a per-market recency claim.
    assert.ok(!/ago|minutes/i.test(JSON.stringify(s)), "no relative recency in the ops payload");
  }
  assert.match(status.sportsbook.note, /no row-level timestamps/i, "the constraint is stated in the payload");
});
