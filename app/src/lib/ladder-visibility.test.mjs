/**
 * LADDER CONSISTENCY (2026-07-30 — supersedes the 07-07 "methodology preview" split). The LIVE Bank
 * Builder ladder is 5 steps ($100 → $10K); the 7-step profit-locking ladder is a FUTURE methodology
 * (not settlement-implemented). The 07-30 public cleanup moved product mechanics off /methodology, so
 * the 7-step preview is now presented NOWHERE — the component survives only as the labelled spec, and
 * no route may mount it until settlement implements it. The 3-step Moonshot ladder is its own separate
 * product and stays on /moonshot (+ /today preview). These checks pin that split.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

const bbLadder = read("src/components/bank-builder/ladder-v2.tsx");
const moonLadder = read("src/components/moonshot/ladder-v2.tsx");
const bbPage = read("src/app/bank-builder/page.tsx");
const moonPage = read("src/app/moonshot/page.tsx");
const todayPage = read("src/app/today/page.tsx");

test("BB ladder component renders all 7 steps from the pure policy (roll/target/lock/roll-forward/cumulative)", () => {
  assert.match(bbLadder, /bankBuilderV2StepPolicy/, "derives from the spec (no drift)");
  assert.match(bbLadder, /STEPS = \[1, 2, 3, 4, 5, 6, 7\]/, "all 7 steps");
  for (const field of ["roll", "target", "lock", "rollForward", "cumulativeLocked", "targetMultiple", "maxLegs"]) {
    assert.match(bbLadder, new RegExp(`p\\.${field}`), `shows ${field}`);
  }
  assert.match(bbLadder, /v2 preview · live settlement runs v1/i, "states v2-preview / v1-live status");
});

test("Moonshot ladder component renders 3 days with profit-locking from the pure policy", () => {
  assert.match(moonLadder, /moonshotV2LadderPolicy/, "derives from the spec");
  assert.match(moonLadder, /DAYS = \[1, 2, 3\]/, "3 days");
  for (const field of ["roll", "target", "lock", "rollForward"]) {
    assert.match(moonLadder, new RegExp(`p\\.${field}`), `shows ${field}`);
  }
  assert.match(moonLadder, /high variance/i, "carries the volatility warning");
});

test("/bank-builder does NOT render the 7-step preview — the live product shows the implemented 5-step ladder only", () => {
  assert.ok(!/BankBuilderLadderV2/.test(bbPage), "the 7-step preview component is NOT on the live Bank Builder page");
  assert.ok(!/<details/.test(bbPage), "no collapsed <details> accordion");
});

test("the 7-step preview is presented NOWHERE as live — no route or shared component mounts it", () => {
  // Until the 7-step ladder is settlement-implemented, no surface may present it at all: the component
  // exists only as the labelled spec (pinned above with its "v2 preview · live settlement runs v1" tag).
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(app, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(e.name)) files.push(rel);
    }
  };
  walk("src/app");
  walk("src/components");
  const definition = path.join("src/components/bank-builder", "ladder-v2.tsx");
  const mounts = files.filter((rel) => rel !== definition && read(rel).includes("BankBuilderLadderV2"));
  assert.deepEqual(mounts, [], "no route or component mounts the 7-step preview");
  // Scanner sanity (known-positive): the same walk DOES see the Moonshot ladder's legitimate mount.
  assert.ok(
    files.some((rel) => rel === path.join("src/app/moonshot", "page.tsx") && read(rel).includes("MoonshotLadderV2")),
    "the scan mechanism finds a known ladder mount",
  );
});

test("/moonshot renders the full 3-step trajectory ladder (separate product)", () => {
  assert.match(moonPage, /<MoonshotLadderV2 /, "renders the trajectory ladder");
});

test("/today surfaces the Longshot lane status but NOT the Bank Builder 7-step (mounted nowhere)", () => {
  // The critical consistency invariant is preserved: the 7-step BankBuilderLadderV2 preview never appears
  // on the live /today surface. 2026-07-09 rebuild: the compact Daily Model Hub no longer embeds the
  // Moonshot ladder preview — it surfaces a compact Longshot Lab status card that links to /moonshot
  // (where the full 3-step trajectory ladder lives).
  assert.ok(!/BankBuilderLadderV2/.test(todayPage), "no BB 7-step preview on the live Today surface");
  assert.match(todayPage, /<LongshotLabStatus/, "Longshot lane status surfaced on the Today hub");
  // The status module (not the page) owns the outbound /moonshot link to the full 3-step ladder.
  const statusModules = read("src/components/today/status-modules.tsx");
  assert.match(statusModules, /ctaHref="\/moonshot"/, "the Longshot status links to /moonshot for the full ladder");
});
