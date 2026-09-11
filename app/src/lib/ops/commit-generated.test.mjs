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
