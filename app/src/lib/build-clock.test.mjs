/**
 * build-clock guards — Sprint 032 Phase 1.
 *
 * The whole point of the build marker is that it must never overstate freshness. These tests
 * pin the fail-closed contract hard: every degenerate input has to land on "unknown", and
 * "current" must be reachable ONLY from a positively-measured same-day clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyBuildClock, buildClockLabel } from "./build-clock.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "../..");

const marker = (buildEtDate, extra = {}) => ({
  schema: 1,
  builtAt: "2026-07-27T16:00:00.000Z",
  buildEtDate,
  commit: { shortSha: "abc12345" },
  environment: "vercel",
  ...extra,
});

// ── fail-closed contract ───────────────────────────────────────────────────

test("every degenerate marker classifies as unknown, never current", () => {
  const degenerate = [
    null,
    undefined,
    {},
    "not-an-object",
    42,
    { buildEtDate: null },
    { buildEtDate: "" },
    { buildEtDate: "today" },
    { buildEtDate: "2026-7-4" }, // unpadded — not the ET contract format
    { buildEtDate: "07-27-2026" }, // wrong order
    { buildEtDate: 20260727 }, // number, not string
  ];
  for (const input of degenerate) {
    const clock = classifyBuildClock(input, "2026-07-27");
    assert.equal(clock.status, "unknown", `expected unknown for ${JSON.stringify(input)}`);
    assert.equal(clock.ok, false, `unknown must never be ok for ${JSON.stringify(input)}`);
    assert.equal(clock.daysBehind, null);
    assert.equal(clock.buildEtDate, null);
  }
});

test("ok is true only for a same-day measured clock", () => {
  assert.equal(classifyBuildClock(marker("2026-07-27"), "2026-07-27").ok, true);
  for (const d of ["2026-07-26", "2026-07-25", "2026-07-01", "2026-07-28"]) {
    assert.equal(classifyBuildClock(marker(d), "2026-07-27").ok, false, `${d} must not be ok`);
  }
});

// ── classification boundaries ──────────────────────────────────────────────

test("classifies build clock age against today", () => {
  const cases = [
    ["2026-07-27", "current", 0],
    ["2026-07-26", "yesterday", 1],
    ["2026-07-25", "stale", 2],
    ["2026-07-22", "stale", 5],
    ["2026-07-21", "stale", 6],
    ["2026-07-20", "very_stale", 7], // 7 days is the very_stale boundary
    ["2026-06-27", "very_stale", 30],
    ["2026-07-28", "future", -1],
  ];
  for (const [buildDate, expected, days] of cases) {
    const clock = classifyBuildClock(marker(buildDate), "2026-07-27");
    assert.equal(clock.status, expected, `${buildDate} → ${expected}`);
    assert.equal(clock.daysBehind, days, `${buildDate} daysBehind`);
  }
});

test("classification crosses month and year boundaries correctly", () => {
  assert.equal(classifyBuildClock(marker("2026-06-30"), "2026-07-01").status, "yesterday");
  assert.equal(classifyBuildClock(marker("2025-12-31"), "2026-01-01").status, "yesterday");
  assert.equal(classifyBuildClock(marker("2026-02-28"), "2026-03-01").status, "yesterday");
});

test("passes through commit and environment metadata, tolerating absence", () => {
  const full = classifyBuildClock(marker("2026-07-27"), "2026-07-27");
  assert.equal(full.shortSha, "abc12345");
  assert.equal(full.environment, "vercel");
  assert.equal(full.builtAt, "2026-07-27T16:00:00.000Z");

  const bare = classifyBuildClock({ buildEtDate: "2026-07-27" }, "2026-07-27");
  assert.equal(bare.status, "current");
  assert.equal(bare.shortSha, null);
  assert.equal(bare.environment, null);
  assert.equal(bare.builtAt, null, "unparseable/absent builtAt must be null, not invented");

  const badTs = classifyBuildClock(marker("2026-07-27", { builtAt: "never" }), "2026-07-27");
  assert.equal(badTs.builtAt, null, "malformed builtAt must not survive");
});

test("a malformed today falls back to the real clock rather than throwing", () => {
  for (const bad of ["", "nonsense", "2026-7-1"]) {
    const clock = classifyBuildClock(marker("2026-07-27"), bad);
    assert.ok(["current", "yesterday", "stale", "very_stale", "future"].includes(clock.status));
  }
});

// ── labels ─────────────────────────────────────────────────────────────────

test("every status yields a non-empty operator label", () => {
  const seen = new Set();
  for (const d of ["2026-07-27", "2026-07-26", "2026-07-24", "2026-07-01", "2026-07-28"]) {
    const clock = classifyBuildClock(marker(d), "2026-07-27");
    const label = buildClockLabel(clock);
    assert.ok(label.length > 0);
    seen.add(clock.status);
  }
  const unknown = buildClockLabel(classifyBuildClock(null, "2026-07-27"));
  assert.match(unknown, /unknown/i);
  assert.equal(seen.size, 5, "expected all five measured statuses to be exercised");
});

test("labels never claim freshness the marker did not measure", () => {
  for (const d of ["2026-07-26", "2026-07-24", "2026-07-01"]) {
    const label = buildClockLabel(classifyBuildClock(marker(d), "2026-07-27"));
    assert.doesNotMatch(label, /\bis today\b/, `stale build must not read as today: ${label}`);
  }
});

// ── wiring guards ──────────────────────────────────────────────────────────

test("the build marker is emitted, published, and gitignored — never committed", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  const build = pkg.scripts.build;
  assert.match(build, /build-info\.mjs --emit/, "emit must run before next build");
  assert.match(build, /build-info\.mjs --publish/, "publish must run after the export exists");
  assert.ok(
    build.indexOf("--emit") < build.indexOf("next build"),
    "emit has to precede next build so next.config can bake the marker in",
  );
  assert.ok(
    build.indexOf("next build") < build.indexOf("--publish"),
    "publish has to follow next build so out/ exists",
  );

  const ignore = fs.readFileSync(path.join(APP, "..", ".gitignore"), "utf8");
  assert.match(ignore, /^app\/\.build-info\.json$/m, "the marker must stay out of git");

  // It is a build artifact: it must never be checked in under public/data either.
  assert.equal(
    fs.existsSync(path.join(APP, "public", "data", "build-info.json")),
    false,
    "build-info.json must not be committed into public/data — it is stamped per build",
  );
});

test("next.config bakes the marker in without recomputing it", () => {
  const cfg = fs.readFileSync(path.join(APP, "next.config.mjs"), "utf8");
  assert.match(cfg, /\.build-info\.json/, "config must read the emitted marker");
  assert.match(cfg, /NEXT_PUBLIC_BUILD_ET_DATE/);
  assert.doesNotMatch(
    cfg,
    /new Date\(\)|Date\.now\(\)/,
    "config must not stamp its own timestamp — one instant, one source of truth",
  );
});

// ── money guard ────────────────────────────────────────────────────────────

test("money file untouched", () => {
  const md5 = createHash("md5")
    .update(fs.readFileSync(path.join(APP, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3", "portfolio.json money file must be untouched");
});
