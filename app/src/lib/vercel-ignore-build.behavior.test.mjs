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
