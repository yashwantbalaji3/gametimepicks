/**
 * COST-001 Stage A (2026-10-09) · ONE PUSH, ONE BUILD.
 *
 * Every push to main is a Vercel deployment, and every deployment whose span touches a build input is a full
 * Production build. In the week to 2026-10-09: ~480 builds, 386 from bot data commits, 263 superseded by another
 * build within ten minutes. These pin the source-side reductions that need no change to the ignore step.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const wf = (name) => fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows", name), "utf8");

test("🔴 nfl-event-window pushes ONCE per run, from an always() step, after both commits", () => {
  const src = wf("nfl-event-window.yml");
  const pushes = [...src.matchAll(/^\s*(?:if )?git push\b/gm)];
  assert.equal(pushes.length, 1, "exactly one git push in the workflow");
  const step = src.slice(src.lastIndexOf("- name:", pushes[0].index));
  assert.match(step, /^- name: Publish this run's commits/, "the push lives in the publish step");
  assert.match(step, /if: \$\{\{ always\(\) \}\}/, "it runs whatever failed above, so no commit is stranded");
  const pushAt = pushes[0].index;
  for (const msg of ["auto: nfl event window", "auto: nfl settlement receipts"]) {
    const at = src.indexOf(msg); assert.ok(at > 0 && at < pushAt, `${msg} is committed before the single push`);
  }
  assert.match(step, /rev-list --count origin\/main\.\.HEAD/, "no push when the run committed nothing");
});

test("🔴 nba-results-refresh commits latest.json only when something a reader sees changed", () => {
  const src = wf("nba-results-refresh.yml");
  assert.match(src, /node app\/scripts\/nba\/results-publishable\.mjs "\$RESULTS\/latest\.json"/);
  assert.match(src, /git reset -q -- "\$RESULTS\/latest\.json"/, "the unpublishable refresh is put back");
  assert.doesNotMatch(src, /git reset -q -- "\$RESULTS\/"\s*$/m, "a new final in finals-<season>.json is never discarded with it");
});
