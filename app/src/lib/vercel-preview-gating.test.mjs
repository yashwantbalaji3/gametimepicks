/**
 * COST-001 — automatic Vercel deployments are main-only; previews are opt-in by branch name.
 *
 * 2026-10-07: the Vercel bill passed $400 for the cycle and Build CPU was ~97% of it. Per-deployment
 * billing (`duration.cpuTimeForBilling`, reconciled to the invoice within ~4%) attributed 37% of the
 * 2026-09-25 → 10-06 spend to PREVIEW builds: 572 built previews in 12 days, one per push to any of
 * ~300 PR branches, each a full 2,760-page export on the 8-vCPU machine (~42 CPU-minutes). Nothing
 * consumed them — no workflow listens for `deployment_status`, no required check names Vercel, and
 * the quality-gate already runs the same `npm run build` on every PR. See
 * docs/COST_001_VERCEL_COST_CONTROL.md.
 *
 * `git.deploymentEnabled` stops Vercel CREATING the deployment, which matters: an Ignored Build Step
 * still clones the 400+ MB repo and bills ~16 CPU-minutes to skip. This rule costs nothing to apply.
 *
 * Vercel's documented semantics (docs/project-configuration/git-configuration): keys are minimatch
 * globs against the branch name; when a branch matches several keys, it deploys if ANY match is true.
 * These tests evaluate the committed config exactly that way, so a reorder, a typo in `main`, or a
 * `*` that silently fails to cover `claude/x` (single-star does not cross `/`) goes red here, not in
 * production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(APP, "package.json"));
const minimatch = require("minimatch");
const match = typeof minimatch === "function" ? minimatch : minimatch.minimatch;

const cfg = JSON.parse(fs.readFileSync(path.join(APP, "vercel.json"), "utf8"));
const rules = cfg.git?.deploymentEnabled;

/** Vercel's rule: unspecified ⇒ deploy; any matching `true` ⇒ deploy; otherwise a matching `false` blocks. */
function deploys(branch) {
  if (rules === undefined || rules === true) return true;
  if (rules === false) return false;
  const hits = Object.entries(rules).filter(([glob]) => match(branch, glob));
  if (hits.length === 0) return true;
  return hits.some(([, on]) => on === true);
}

test("the rule set is an object keyed by branch glob (a bare `false` would stop production)", () => {
  assert.equal(typeof rules, "object");
  assert.ok(rules !== null && !Array.isArray(rules));
});

test("production branch `main` always auto-deploys", () => {
  assert.equal(rules.main, true, "main must be an explicit `true` key");
  assert.equal(deploys("main"), true);
});

test("ordinary work branches never auto-deploy", () => {
  for (const b of [
    "claude/cost-001-vercel-cost-control",
    "claude/project-thread-489xyz",
    "s12-handoff",
    "p19-multisport-matrix",
    "fix/nfl/deep/nested",
    "dependabot/npm_and_yarn/next-15.5.9",
  ]) {
    assert.equal(deploys(b), false, `${b} would create a preview deployment`);
  }
});

test("a remote preview is still available on request via the preview/ prefix", () => {
  assert.equal(deploys("preview/truth-001"), true);
  assert.equal(deploys("preview/ux/sport-hub"), true);
});

test("the matcher is not vacuous — near-misses of `main` and `preview/` are blocked", () => {
  for (const b of ["mainline", "main-backup", "preview", "previews/x", "x/preview/y"]) {
    assert.equal(deploys(b), false, `${b} unexpectedly deploys`);
  }
});

test("the ignored-build script is still wired for the branches that do deploy", () => {
  assert.match(cfg.ignoreCommand ?? "", /vercel-ignore-build\.sh/);
});
