/**
 * QUALITY GATE CONTRACT (v1.4.1) — the CI job's shape, pinned where it now carries load.
 *
 *  QG1  types are still checked on every CI run: the build does it (no `ignoreBuildErrors`), the workflow builds,
 *       and the local gate still runs `tsc --noEmit` first. v1.4.1 removed the duplicate standalone CI step (31 s);
 *       if the build ever stops type-checking, that saving would silently become a hole.
 *  QG2  the phases that must fail loudly still do: both suite phases assert on `^not ok`, no step is
 *       continue-on-error, and the job timeout is unchanged at 25 minutes.
 *  QG3  the browser phase still runs all three engines over both specs, with retries unchanged.
 *
 * Run: npx tsx --test src/lib/ci/quality-gate-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.join(APP, "..");
const wf = fs.readFileSync(path.join(REPO, ".github/workflows/quality-gate.yml"), "utf8");
const quality = wf.slice(wf.indexOf("  quality:"), wf.indexOf("  python:"));
const nextConfig = fs.readFileSync(path.join(APP, "next.config.mjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
const pw = fs.readFileSync(path.join(APP, "playwright.config.ts"), "utf8");

test("QG1 every CI run still type-checks: the build does it, and nothing disables it", () => {
  assert.match(quality, /run: npm run build/, "the CI job must build (which type-checks)");
  assert.doesNotMatch(nextConfig, /ignoreBuildErrors|ignoreDuringBuilds/, "the build's own type/lint check must stay on — it is the ONLY type check in CI since v1.4.1");
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit", "the local script stays available");
  assert.match(pkg.scripts.gate, /typecheck/, "the local gate still type-checks first (fail fast for a developer)");
  assert.match(pkg.scripts.build, /next build/);
});

test("QG2 failures stay loud: both suite phases assert, nothing is continue-on-error, timeout unchanged", () => {
  assert.match(quality, /timeout-minutes: 25/, "the job timeout is not raised");
  assert.doesNotMatch(quality, /continue-on-error/, "a green step must mean the work passed");
  const asserts = [...quality.matchAll(/grep -cE '\^not ok'/g)];
  assert.equal(asserts.length, 2, "both the unit and rendered phases count failing TAP lines");
  assert.equal([...quality.matchAll(/\[ "\$\{fails:-0\}" -eq 0 \]/g)].length, 2, "…and both fail the step on any failure");
  for (const phase of ["--phase unit", "--phase post-build"]) assert.ok(quality.includes(phase), `${phase} runs in CI`);
  assert.match(quality, /node scripts\/audit-accessibility\.mjs/, "structural a11y still runs");
});

test("QG3 the browser phase keeps three engines, both specs and its retry policy", () => {
  assert.match(quality, /playwright install --with-deps chromium webkit firefox/);
  assert.match(quality, /playwright test e2e\/accessibility\.spec\.ts e2e\/route-assurance\.spec\.ts/);
  for (const project of ["chromium", "webkit-a11y", "firefox-a11y"]) assert.ok(pw.includes(`name: "${project}"`), `${project} project exists`);
  assert.match(pw, /retries: process\.env\.CI \? 1 : 0/, "retry policy unchanged");
  assert.match(pw, /workers: process\.env\.CI \? "100%" : undefined/, "CI uses one worker per vCPU (v1.4.1)");
  // Diagnostics on failure survive: CI retries once, and trace + video are both captured on that retry.
  assert.match(pw, /trace: "on-first-retry"/);
  assert.match(pw, /video: "on-first-retry"/);
  assert.match(pw, /screenshot: "only-on-failure"/);
  for (const spec of ["accessibility.spec.ts", "route-assurance.spec.ts"]) {
    for (const m of [...pw.matchAll(/testMatch: \/([^/]+)\//g)]) assert.ok(new RegExp(m[1]).test(spec), `${spec} runs on every a11y project`);
  }
});
