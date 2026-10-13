/**
 * scripts/ci/commit-generated.sh — two runs regenerating the same day's files must both land (P257).
 * Real git: a bare origin and two clones racing, exactly the 2026-09-11 daily-products failure.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const HELPER = path.resolve(process.cwd(), "..", "scripts/ci/commit-generated.sh");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });

function race(file, { generated = "data/gen/" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cg-"));
  const origin = path.join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const a = path.join(root, "a"), b = path.join(root, "b");
  git(root, "clone", "-q", origin, a);
  fs.mkdirSync(path.dirname(path.join(a, file)), { recursive: true });
  fs.writeFileSync(path.join(a, file), '{"v":0}\n');
  git(a, "add", "."); git(a, "commit", "-q", "-m", "seed"); git(a, "push", "-q", "origin", "HEAD:main");
  git(root, "clone", "-q", origin, b);
  // run A publishes first
  fs.writeFileSync(path.join(a, file), '{"v":"A"}\n'); git(a, "add", "."); git(a, "commit", "-q", "-m", "A"); git(a, "push", "-q", "origin", "HEAD:main");
  // run B regenerated the same file from the older checkout, then commits through the helper
  fs.writeFileSync(path.join(b, file), '{"v":"B"}\n'); git(b, "add", ".");
  const r = spawnSync("bash", [HELPER, "auto: B [skip ci]"], { cwd: b, encoding: "utf8", env: { ...process.env, GENERATED_PATHS: generated, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  return { r, origin, root };
}
const originFile = (origin, root, file) => { const c = path.join(root, "check"); git(root, "clone", "-q", origin, c); return fs.readFileSync(path.join(c, file), "utf8"); };

test("a same-day conflict on a generated file lands, with the later run's copy", () => {
  const { r, origin, root } = race("data/gen/receipt.json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /this run's \(later\) copy kept/);
  assert.equal(originFile(origin, root, "data/gen/receipt.json"), '{"v":"B"}\n');
});

test("a conflict outside the generated paths fails loud and forces nothing", () => {
  const { r, origin, root } = race("src/code.mjs");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /not a regenerable path/);
  assert.equal(originFile(origin, root, "src/code.mjs"), '{"v":"A"}\n', "the published copy is untouched");
});

test("the protected money files are never auto-resolved, even inside a generated prefix", () => {
  const { r } = race("app/public/data/mr-dub/portfolio.json", { generated: "app/public/data/" });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /not a regenerable path/);
});

// ── v1.7 shadow-integrity audit (docs/V17_WORKFLOW_AUDIT.md W1/W2) ────────────────────────────────────
test("W1: an unstaged stamp-only edit in the worktree does not block the rebase (run 35630279965 rebased five times without moving)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cg-"));
  const origin = path.join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const a = path.join(root, "a"), b = path.join(root, "b");
  git(root, "clone", "-q", origin, a);
  fs.mkdirSync(path.join(a, "data/gen"), { recursive: true });
  fs.writeFileSync(path.join(a, "data/gen/receipt.json"), '{"v":0}\n'); fs.writeFileSync(path.join(a, "data/gen/stamp.json"), '{"generatedAt":"t0"}\n');
  git(a, "add", "."); git(a, "commit", "-q", "-m", "seed"); git(a, "push", "-q", "origin", "HEAD:main");
  git(root, "clone", "-q", origin, b);
  // another writer lands first on a DIFFERENT file
  fs.writeFileSync(path.join(a, "data/gen/other.json"), '{"v":"A"}\n'); git(a, "add", "."); git(a, "commit", "-q", "-m", "A"); git(a, "push", "-q", "origin", "HEAD:main");
  // run B stages its receipt, and — like the daily-products commit step — leaves a stamp-only file modified but unstaged
  fs.writeFileSync(path.join(b, "data/gen/receipt.json"), '{"v":"B"}\n'); git(b, "add", "data/gen/receipt.json");
  fs.writeFileSync(path.join(b, "data/gen/stamp.json"), '{"generatedAt":"t1"}\n');
  const r = spawnSync("bash", [HELPER, "auto: B [skip ci]"], { cwd: b, encoding: "utf8", env: { ...process.env, GENERATED_PATHS: "data/gen/", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pushed \(attempt 2\)/, "rejected once, rebased, then landed");
  assert.equal(originFile(origin, root, "data/gen/receipt.json"), '{"v":"B"}\n');
  assert.equal(fs.readFileSync(path.join(root, "check", "data/gen/other.json"), "utf8"), '{"v":"A"}\n', "the other writer's work survives");
});

test("W2: a selector-shadow day file is never auto-resolved to the later copy — first publication wins, the run fails loud", () => {
  const { r, origin, root } = race("data/internal/products/selector-shadow/2026-09-22.json", { generated: "data/internal/products/" });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /not a regenerable path/);
  assert.equal(originFile(origin, root, "data/internal/products/selector-shadow/2026-09-22.json"), '{"v":"A"}\n', "the first publication is untouched");
});

// ── OPS-001 · ufc-fight-week run 38065746333 (2026-10-10 16:02Z): a rebase that cannot START ───────────
// The run rebuilt multi-/epl-<today>.json grids as a side effect; they were new on its checkout, so
// `restore --worktree` left them untracked. epl-matchweek committed the same paths first; the rebase refused
// ("untracked working tree files would be overwritten") behind a redirect, nothing was unmerged, and the loop
// pushed the same unrebased commit five times. The paid capture was discarded.
function untrackedCollision({ clean = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cg-"));
  const origin = path.join(root, "origin.git");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  const a = path.join(root, "a"), b = path.join(root, "b");
  git(root, "clone", "-q", origin, a);
  fs.mkdirSync(path.join(a, "grid"), { recursive: true });
  fs.writeFileSync(path.join(a, "grid/mlb-old.json"), '{"v":0}\n');
  git(a, "add", "."); git(a, "commit", "-q", "-m", "seed"); git(a, "push", "-q", "origin", "HEAD:main");
  git(root, "clone", "-q", origin, b);
  // the other lane publishes a NEW same-day grid first
  fs.writeFileSync(path.join(a, "grid/multi-2026-10-10.json"), '{"from":"epl"}\n');
  git(a, "add", "."); git(a, "commit", "-q", "-m", "epl"); git(a, "push", "-q", "origin", "HEAD:main");
  // the UFC run, on the older checkout: its own grid + a side-effect copy of the same new file + a tracked side effect
  fs.writeFileSync(path.join(b, "grid/ufc-2026-10-10.json"), '{"ufc":1}\n');
  fs.writeFileSync(path.join(b, "grid/multi-2026-10-10.json"), '{"from":"ufc side effect"}\n');
  fs.writeFileSync(path.join(b, "grid/mlb-old.json"), '{"v":"side effect"}\n');
  git(b, "add", "grid/ufc-2026-10-10.json");
  git(b, "restore", "--worktree", "--", "grid");
  if (clean) git(b, "clean", "-fdq", "--", "grid");
  const r = spawnSync("bash", [HELPER, "auto: ufc fight-week refresh [skip ci]"], { cwd: b, encoding: "utf8", env: { ...process.env, GENERATED_PATHS: "grid/ufc-", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  return { r, origin, root, b };
}

test("OPS-001: a rebase that cannot start fails at once, says what git said, and never re-pushes the unchanged commit", () => {
  const t0 = Date.now();
  const { r, origin, root } = untrackedCollision();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const out = r.stdout + r.stderr;
  assert.match(out, /rebase onto origin\/main could not start/);
  assert.match(out, /git: .*untracked working tree files would be overwritten/, "git's own reason is surfaced, not swallowed");
  assert.match(out, /push rejected \(attempt 1\)/);
  assert.doesNotMatch(out, /attempt 2|never landed after 5 attempts/, "no retry of a commit that did not move");
  assert.ok(Date.now() - t0 < 15_000, "fails in one attempt, not after the 30 s backoff ladder");
  assert.equal(originFile(origin, root, "grid/multi-2026-10-10.json"), '{"from":"epl"}\n', "the other lane's publication is untouched");
});

test("OPS-001: with the untracked side-effect grids cleaned (the ufc-fight-week fix), the same race lands and keeps both lanes' files", () => {
  const { r, origin, root } = untrackedCollision({ clean: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pushed \(attempt 2\)/, "rejected once, rebased, landed");
  assert.equal(originFile(origin, root, "grid/ufc-2026-10-10.json"), '{"ufc":1}\n', "UFC's own grid is published");
  assert.equal(fs.readFileSync(path.join(root, "check", "grid/multi-2026-10-10.json"), "utf8"), '{"from":"epl"}\n', "the other lane's grid survives");
  assert.equal(fs.readFileSync(path.join(root, "check", "grid/mlb-old.json"), "utf8"), '{"v":0}\n', "a tracked side effect is never published");
});
