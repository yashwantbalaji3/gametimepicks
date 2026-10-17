/**
 * The ignore step survives Vercel's depth-10 clone (2026-10-15).
 *
 * Ignored deployments do not advance VERCEL_GIT_PREVIOUS_SHA, so after a run of ignored commits the last
 * deployed SHA falls outside `git clone --depth=10` and the script used to build unconditionally. It now
 * fetches that one commit (depth 1) and compares trees. These tests run the real script inside a real
 * depth-10 clone of a throwaway repository:
 *   skip      base beyond the clone, only non-inputs changed since  → fetched, exit 0
 *   build     base beyond the clone, a real input changed since     → fetched, exit 1
 *   fail-safe the fetch cannot succeed                              → exit 1, says why
 *   in-clone  base inside the clone                                 → no fetch, unchanged behaviour
 * GTP_GAP_FETCH_URL replaces the GitHub URL only here, so no test touches the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const SCRIPT = path.join(process.cwd(), "scripts", "vercel-ignore-build.sh");
const sh = fs.readFileSync(SCRIPT, "utf8");

function fixture({ inputChangeAfterBase }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-gap-"));
  const src = path.join(root, "src");
  fs.mkdirSync(src);
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true }); fs.writeFileSync(path.join(src, rel), body); };
  g(src, "init", "-q"); g(src, "config", "user.email", "t@example.invalid"); g(src, "config", "user.name", "t"); g(src, "config", "commit.gpgsign", "false");
  // allow fetching an arbitrary reachable SHA from the fixture "remote", as GitHub does
  g(src, "config", "uploadpack.allowAnySHA1InWant", "true");
  w("app/scripts/vercel-ignore-build.sh", sh); w("app/src/lib/x.ts", "1");
  g(src, "add", "-A"); g(src, "commit", "-q", "-m", "deployed");
  const base = g(src, "rev-parse", "HEAD").trim();
  for (let i = 0; i < 14; i++) { w("app/public/data/ops/heartbeat.json", String(i)); w("docs/n.md", String(i)); g(src, "add", "-A"); g(src, "commit", "-q", "-m", `ignored ${i}`); }
  if (inputChangeAfterBase) { w("app/src/lib/x.ts", "2"); g(src, "add", "-A"); g(src, "commit", "-q", "-m", "real input"); }
  const clone = path.join(root, "clone");
  g(root, "clone", "-q", "--depth=10", "--no-local", `file://${src}`, clone);
  return { root, src, clone, base };
}
const run = (fx, extraEnv = {}) => spawnSync("bash", [path.join(fx.clone, "app/scripts/vercel-ignore-build.sh")], {
  cwd: path.join(fx.clone, "app"), encoding: "utf8",
  env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: fx.base, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "", GTP_GAP_FETCH_URL: `file://${fx.src}`, ...extraEnv },
});
const inClone = (fx) => spawnSync("git", ["cat-file", "-e", `${fx.base}^{commit}`], { cwd: fx.clone }).status === 0;

test("POSITIVE CONTROL: the fixture really reproduces the gap (base is outside the depth-10 clone)", () => {
  const fx = fixture({ inputChangeAfterBase: false });
  try { assert.equal(inClone(fx), false, "the base must be missing from the shallow clone, or these tests prove nothing"); }
  finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("skip: base beyond the clone and only non-inputs changed → fetched alone, exit 0", () => {
  const fx = fixture({ inputChangeAfterBase: false });
  try {
    const r = run(fx);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /outside the depth-10 clone — fetched it alone/);
    assert.match(r.stdout, /no build-input changes/);
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("build: base beyond the clone and a real input changed → fetched, exit 1", () => {
  const fx = fixture({ inputChangeAfterBase: true });
  try {
    const r = run(fx);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /fetched it alone/);
    assert.match(r.stdout, /build inputs changed/);
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("fail-safe: when the commit cannot be fetched, it builds and says why", () => {
  const fx = fixture({ inputChangeAfterBase: false });
  try {
    for (const env of [{ GTP_GAP_FETCH_URL: `file://${fx.root}/does-not-exist` }, { GTP_GAP_FETCH_URL: "", VERCEL_GIT_PROVIDER: "", VERCEL_GIT_REPO_OWNER: "", VERCEL_GIT_REPO_SLUG: "" }]) {
      const r = run(fx, env);
      assert.equal(r.status, 1, `must build when the fetch is impossible: ${r.stdout}${r.stderr}`);
      assert.match(r.stdout, /could not be fetched .* — building/);
    }
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});

test("in-clone: a base inside the clone needs no fetch and behaves exactly as before", () => {
  const fx = fixture({ inputChangeAfterBase: false });
  try {
    const near = execFileSync("git", ["rev-parse", "HEAD~3"], { cwd: fx.clone, encoding: "utf8" }).trim();
    const r = run({ ...fx, base: near }, { GTP_GAP_FETCH_URL: `file://${fx.root}/does-not-exist` });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /fetched|could not be fetched/);
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
});
