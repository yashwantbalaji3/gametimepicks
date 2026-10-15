/**
 * NON_BUILD_GLOBS in scripts/vercel-ignore-build.sh are verified, not trusted (2026-10-15).
 *
 *   producer ⇒ reader   no file a glob matches is read by the build: the static import closure of every
 *                       `npm run build` step and every route under src/app contains none of them;
 *   reader ⇒ producer   every glob matches real files, so a rename can never turn it into a no-op;
 *   behaviour           on a throwaway git repo the real script skips a tests/specs/CI-only commit and still
 *                       builds the moment a commit also touches a real build input.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts", "vercel-ignore-build.sh");
const sh = fs.readFileSync(SCRIPT, "utf8");
const block = /# GTP-NON-BUILD-GLOBS-BEGIN\s*\nNON_BUILD_GLOBS=\(([\s\S]*?)\)\s*\n# GTP-NON-BUILD-GLOBS-END/.exec(sh);
const GLOBS = block ? [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];

/** git pathspec glob → RegExp over repo-relative paths ("**" spans directories, "*" does not). */
const toRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0000").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?") + "$");
const RES = GLOBS.map(toRe);
const excluded = (repoRel) => RES.some((re) => re.test(repoRel));

const walk = (d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f)).filter((f) => fs.statSync(f).isFile());

function buildClosure() {
  const steps = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).scripts.build.match(/scripts\/[\w./-]+\.(?:mjs|js|ts)/g) ?? [];
  const exts = [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json", ".cjs"];
  const resolve = (from, spec) => {
    const base = spec.startsWith("@/") ? path.join(APP, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [base, ...exts.map((e) => base + e), ...exts.map((e) => path.join(base, "index" + e))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return null;
  };
  const routeEntries = walk(path.join(APP, "src/app")).filter((f) => /\.(tsx?|mjs|js)$/.test(f) && !/\.test\./.test(f));
  const configs = ["next.config.mjs", "next.config.js", "src/middleware.ts", "tailwind.config.ts", "postcss.config.mjs"].map((p) => path.join(APP, p)).filter((f) => fs.existsSync(f));
  const entries = [...routeEntries, ...steps.map((s) => path.join(APP, s)).filter((f) => fs.existsSync(f)), ...configs];
  const seen = new Set(entries), stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (!/\.(tsx?|mjs|js|cjs|jsx)$/.test(f)) continue;
    for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g)) {
      const r = resolve(f, m[1]);
      if (r && !seen.has(r)) { seen.add(r); stack.push(r); }
    }
  }
  return { files: [...seen].map((f) => `app/${path.relative(APP, f).split(path.sep).join("/")}`), steps };
}

test("the ignore step declares a parseable, non-empty NON_BUILD_GLOBS block", () => {
  assert.ok(block, "NON_BUILD_GLOBS block missing or unparseable — this guard would check nothing");
  assert.ok(GLOBS.length > 0);
  for (const g of GLOBS) assert.ok(g.startsWith("app/"), `${g}: only paths under app/ are excluded from the app/ pathspec`);
});

test("producer ⇒ reader: no build step or route ever reads a file a glob excludes", () => {
  const { files, steps } = buildClosure();
  assert.ok(steps.length >= 8, `found only ${steps.length} build steps in package.json — the scan is not seeing the build`);
  assert.ok(files.length > 500, `closure of ${files.length} files is implausibly small`);
  assert.deepEqual(files.filter(excluded), [], "a file the deploy trigger now ignores is read by the build — remove it from NON_BUILD_GLOBS");
});

test("reader ⇒ producer: every glob matches real files", () => {
  const repoFiles = walk(APP).map((f) => `app/${path.relative(APP, f).split(path.sep).join("/")}`).filter((f) => !f.includes("/node_modules/") && !f.startsWith("app/out/") && !f.startsWith("app/.next/"));
  for (const [i, g] of GLOBS.entries()) assert.ok(repoFiles.some((f) => RES[i].test(f)), `${g} matches nothing — the rule is a no-op`);
});

test("behaviour: a tests/specs/CI-only commit SKIPS; adding any real build input BUILDS", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "non-build-globs-"));
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  g("init", "-q"); g("config", "user.email", "t@example.invalid"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  w("app/scripts/vercel-ignore-build.sh", sh); w("app/src/lib/x.ts", "1"); w("app/src/lib/x.test.mjs", "1"); w("app/e2e/a.spec.ts", "1"); w("app/scripts/ci/run.mjs", "1");
  g("add", "-A"); g("commit", "-q", "-m", "deployed");
  const base = g("rev-parse", "HEAD").trim();
  const run = () => spawnSync("bash", [path.join(dir, "app/scripts/vercel-ignore-build.sh")], { cwd: path.join(dir, "app"), encoding: "utf8", env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: base, VERCEL_PROJECT_PRODUCTION_URL: "", VERCEL_FORCE_BUILD: "" } });
  try {
    w("app/src/lib/x.test.mjs", "2"); w("app/e2e/a.spec.ts", "2"); w("app/scripts/ci/run.mjs", "2"); w(".github/workflows/w.yml", "x"); w("docs/n.md", "x");
    g("add", "-A"); g("commit", "-q", "-m", "tests, specs, CI only");
    const skip = run();
    assert.equal(skip.status, 0, `tests/specs/CI-only must skip: ${skip.stdout}${skip.stderr}`);
    w("app/src/lib/x.ts", "2"); g("add", "-A"); g("commit", "-q", "-m", "plus a real input");
    const build = run();
    assert.equal(build.status, 1, `a real build input must build: ${build.stdout}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
