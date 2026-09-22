/**
 * Behavioral mutation tests for the Vercel Ignored Build Step (Program 088-091 §12).
 *
 * The static guard (vercel-canonical-project.test.mjs) pins what the script SAYS; these pin what
 * it DOES, against a real throwaway git repo: exit 0 = Vercel skips the build, exit 1 = builds.
 * The five behaviors are load-bearing — a false skip freezes production silently, a false build
 * just wastes minutes — so every failure mode here must fail toward BUILDING.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");

let repo;
const shas = {};

/**
 * Files OUTSIDE app/ that `npm run build` reads (emit steps, research/compare/lab/ask pages, the
 * search index, and the three data/internal paths a PUBLIC route reads). Any change here must build;
 * the sibling data/internal churn (pregame archive etc.) must not — it feeds pipeline scripts only.
 * Audit: docs/V17_DEPLOY_TRIGGER_AUDIT.md (2026-09-22).
 */
const REPO_ROOT_BUILD_INPUTS = [
  "data/research-projection/v1/index.json",
  "data/compare-projection/v1/readiness.json",
  "data/lab-projection/v1/index.json",
  "data/ask-projection/v1/manifest.json",
  "data/internal/mlb/model-learning/calibrator-manifest.json",
  "data/internal/nfl/forecast-receipts/2026-w03.json",
  "data/internal/mlb/prediction-snapshots/2026-09-22/1.json",
];

function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8", ...opts });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function commit(label, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(repo, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  git(["add", "-A"]);
  git(["commit", "-q", "-m", label, "--no-gpg-sign"]);
  shas[label] = git(["rev-parse", "HEAD"]);
}

function runIgnore(env) {
  // cwd = <repo>/app, mirroring Vercel's root-directory execution.
  return spawnSync("bash", [SCRIPT], {
    cwd: path.join(repo, "app"),
    encoding: "utf8",
    env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: "", VERCEL_PROJECT_PRODUCTION_URL: "", ...env },
  });
}

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ignore-build-"));
  git(["init", "-q"]);
  git(["config", "user.email", "test@test.invalid"]);
  git(["config", "user.name", "fixture"]);
  commit("base", { "app/src/page.tsx": "v1", "docs/NOTES.md": "v1" });
  commit("docs-only", { "docs/NOTES.md": "v2" });
  commit("data-change", { "app/public/data/board.json": "{}" });
  commit("docs-tail", { "docs/NOTES.md": "v3" });
  commit("app-change", { "app/src/page.tsx": "v2" });
  // 2026-09-22 audit (docs/V17_DEPLOY_TRIGGER_AUDIT.md): repo-root build inputs outside app/.
  commit("internal-churn", { "data/internal/mlb/pregame-archive/freezes/2026-09-22/1.json": "{}" });
  for (const [i, rel] of REPO_ROOT_BUILD_INPUTS.entries()) commit(`input-${i}`, { [rel]: `{"v":${i}}` });
  // Leave HEAD where the older tests expect it; the new tests check out their own shas.
  git(["checkout", "-q", shas["app-change"]]);
});

after(() => fs.rmSync(repo, { recursive: true, force: true }));

test("docs-only span since deployed SHA → SKIP (exit 0)", () => {
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
  // Roll HEAD back so the span base→HEAD is docs-only.
  git(["checkout", "-q", shas["docs-only"]]);
  const r2 = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r2.status, 0, `expected skip, got: ${r2.stdout}${r2.stderr}`);
  // And from the full history tip (which includes app changes) the same base must BUILD:
  assert.equal(r.status, 1, `expected build from tip, got: ${r.stdout}`);
});

test("public-data change → BUILD (exit 1)", () => {
  git(["checkout", "-q", shas["data-change"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 1, `a generated-data commit must deploy: ${r.stdout}`);
});

test("app change → BUILD, and a docs-tail between them cannot strand it", () => {
  // Span docs-only → docs-tail contains data-change: even though HEAD-1..HEAD is docs-only,
  // the diff runs from the last DEPLOYED sha, so the data change still builds.
  git(["checkout", "-q", shas["docs-tail"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["docs-only"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 1, "a push batch ending in docs must not strand the app change");
});

test("unknown previous SHA / missing SHA → BUILD (fail open)", () => {
  assert.equal(runIgnore({ VERCEL_GIT_PREVIOUS_SHA: "0000000000000000000000000000000000000000" }).status, 1);
  assert.equal(runIgnore({}).status, 1);
});

test("duplicate project slug → SKIP regardless of span", () => {
  for (const host of ["gametimepicks.vercel.app", "gametimepicks-abc123.vercel.app"]) {
    const r = runIgnore({ VERCEL_PROJECT_PRODUCTION_URL: host, VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
    assert.equal(r.status, 0, `${host}: the duplicate must never build`);
    assert.match(r.stdout, /duplicate/);
  }
});

test("unknown project slug → falls through to diff logic (fail open)", () => {
  const r = runIgnore({
    VERCEL_PROJECT_PRODUCTION_URL: "some-future-rename.vercel.app",
    VERCEL_GIT_PREVIOUS_SHA: shas["base"],
  });
  assert.equal(r.status, 1, "an unrecognized project identity must BUILD, never skip");
});

test("⚠ VERCEL_FORCE_BUILD=1 → BUILD even with no app/ diff (env-var activation hatch)", () => {
  /*
   * The case this exists for: Vercel binds env vars at BUILD time, so a variable set in the
   * dashboard only takes effect on a new build. A same-commit redeploy reaches this script, finds no
   * app/ diff, and SKIPS — the redeploy succeeds and delivers nothing. Observed 2026-09-16 during the
   * Live activation: both flags were set, production was redeployed, and build-info.json came back
   * byte-identical because no build ran.
   */
  const noDiff = { VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] ?? shas["base"] };
  // Same inputs, hatch off: the normal skip still happens (so the hatch is what changes the answer).
  const skipped = runIgnore(noDiff);
  const forced = runIgnore({ ...noDiff, VERCEL_FORCE_BUILD: "1" });
  assert.equal(forced.status, 1, "the hatch must build");
  assert.match(forced.stdout, /VERCEL_FORCE_BUILD/);
  assert.notEqual(forced.status, skipped.status, "the hatch must actually change the outcome");
});

test("the hatch is opt-in — any other value leaves the diff logic untouched", () => {
  const base = { VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] ?? shas["base"] };
  const off = runIgnore(base);
  for (const v of ["", "0", "false", "true", "yes"]) {
    assert.equal(runIgnore({ ...base, VERCEL_FORCE_BUILD: v }).status, off.status,
      `VERCEL_FORCE_BUILD=${JSON.stringify(v)} must not change the decision — only "1" opts in`);
  }
});

// ── 2026-09-22 deploy-trigger audit (docs/V17_DEPLOY_TRIGGER_AUDIT.md) ─────────────────────────

test("`[skip ci]` in the commit message never skips a Vercel build — only the diff decides", () => {
  /*
   * Q1 of the audit: 503 pushes/7d, every one whose span touched app/ was built regardless of the
   * `[skip ci]` marker (361 DATA + 84 CODE), and every span without app/ changes was skipped (55).
   * The marker is a GitHub Actions convention; this script must not grow a message-based skip.
   */
  commit("data-skip-ci [skip ci]", { "app/public/data/board.json": '{"v":2}' });
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 1, `a [skip ci] data commit must still deploy: ${r.stdout}`);
  assert.doesNotMatch(fs.readFileSync(SCRIPT, "utf8"), /git log|--format|%s|VERCEL_GIT_COMMIT_MESSAGE/,
    "the script must not read the commit message at all");
});

test("repo-root build inputs outside app/ → BUILD (projections + the three read data/internal paths)", () => {
  // Each input-N commit changes exactly one repo-root file the build reads; base = its parent.
  for (const [i, rel] of REPO_ROOT_BUILD_INPUTS.entries()) {
    const head = shas[`input-${i}`];
    git(["checkout", "-q", head]);
    const parent = git(["rev-parse", `${head}^`]);
    const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: parent });
    assert.equal(r.status, 1, `${rel} is a build input — a change there must BUILD: ${r.stdout}`);
  }
  git(["checkout", "-q", shas["app-change"]]);
});

test("data/internal churn the build never reads → still SKIP (the extension is not a blanket data/ rule)", () => {
  /*
   * ~19 pregame-archive pushes/7d (300+ files each) plus settle receipts touch data/internal only.
   * They feed pipeline scripts, not `npm run build`; building them would add ~4% of builds for
   * byte-identical output. Fail-open still applies to everything the build DOES read (test above).
   */
  git(["checkout", "-q", shas["internal-churn"]]);
  const r = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["app-change"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(r.status, 0, `internal-only churn must skip: ${r.stdout}`);
  assert.match(r.stdout, /skipping build/);
});

test("after a FAILED deploy the base is the last SUCCESSFUL one, so the failed commit's data is carried by the next build", () => {
  /*
   * Q2 of the audit. Chain: base → docs-only → data-change (its deploy FAILED at the 45-min ceiling)
   * → docs-tail. Vercel sets VERCEL_GIT_PREVIOUS_SHA to the last SUCCESSFUL deployment (docs-only's
   * predecessor "base" here), so the docs-tail push spans the failed data change and BUILDS.
   * Had Vercel pointed at the failed commit itself, the same push would SKIP and strand the data —
   * the second assertion documents why the semantics matter (and why the script must never invent
   * a HEAD^ base of its own).
   */
  git(["checkout", "-q", shas["docs-tail"]]);
  const carried = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["base"] });
  const stranded = runIgnore({ VERCEL_GIT_PREVIOUS_SHA: shas["data-change"] });
  git(["checkout", "-q", shas["app-change"]]);
  assert.equal(carried.status, 1, "span from the last SUCCESSFUL deploy includes the failed data commit → BUILD");
  assert.equal(stranded.status, 0, "a base AT the failed commit would skip — Vercel's last-successful semantics prevent it");
  assert.doesNotMatch(fs.readFileSync(SCRIPT, "utf8"), /git (rev-parse|diff)[^\n]*HEAD[\^~]|BASE=[^\n]*HEAD[\^~]/,
    "the script must not fall back to a HEAD^ base of its own");
});
