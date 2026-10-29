/**
 * The private ops repo (gtp-ops) as assembled by deploy/assemble-ops-repo.mjs: every workflow action pinned to a commit
 * SHA; both workflows' sparse checkouts cover every public-repo path the code reads; the assembled tree holds nothing
 * credential-like; and the REAL Vercel entry (api/index.mjs) loads and answers in a folder with no public repo beside
 * it, after the same build command Vercel runs. Assembles the committed HEAD (uncommitted edits are not seen).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { CC_ROOT, REPO_ROOT } from "../lib/util.mjs";
import { assemble, scanTree, listFiles } from "../deploy/assemble-ops-repo.mjs";
import { tempDir } from "./helpers.mjs";

const WORKFLOWS = ["cc-publisher.yml", "cc-worker.yml"].map((w) => [w, fs.readFileSync(path.join(CC_ROOT, "deploy/github", w), "utf8")]);
const CODE_DIRS = ["contracts", "editorial", "engineering", "jobs", "lib", "orchestrator", "publishers", "recap", "render", "worker"];
const hasPublicMain = spawnSync("git", ["rev-parse", "--verify", "-q", "origin/main^{commit}"], { cwd: REPO_ROOT }).status === 0;

test("ops workflows: every action is pinned to a full commit SHA", () => {
  for (const [name, text] of WORKFLOWS) {
    const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    assert.ok(uses.length >= 3, name);
    for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${name}: ${u} is not pinned`);
  }
});

test("ops workflows: the sparse checkout covers every public-repo path the code reads", () => {
  const read = new Set();
  for (const d of CODE_DIRS) {
    for (const f of listFiles(path.join(CC_ROOT, d)).filter((f) => f.endsWith(".mjs"))) {
      const text = fs.readFileSync(path.join(CC_ROOT, d, f), "utf8");
      for (const m of text.matchAll(/["`]((?:app|data)\/[A-Za-z0-9_./-]+)/g)) read.add(m[1].replace(/\/$/, ""));
    }
  }
  read.delete("app/node_modules"); // Playwright, installed by the worker, not checked out
  assert.ok(read.size > 10);
  for (const [name, text] of WORKFLOWS) {
    const sparse = text.match(/sparse-checkout: \|\n((?: {12}\S+\n)+)/)[1].trim().split(/\s+/);
    const missing = [...read].filter((p) => !sparse.some((s) => p === s || p.startsWith(`${s}/`)));
    assert.deepEqual(missing, [], `${name} sparse checkout misses paths the code reads`);
  }
});

test("ops repo: the credential scan refuses a planted token, without echoing it", () => {
  const dir = tempDir("gtp-ops-scan-");
  fs.writeFileSync(path.join(dir, "ok.mjs"), "const url = `postgres://gtp_cc_app:${pw}@host/db`;\n");
  assert.deepEqual(scanTree(dir), []);
  const token = `github_pat_${"A1b2".repeat(10)}`;
  fs.writeFileSync(path.join(dir, "leak.md"), `token ${token}\n`);
  fs.mkdirSync(path.join(dir, "command-center/out"), { recursive: true });
  fs.writeFileSync(path.join(dir, "command-center/out/x.png"), "");
  const problems = scanTree(dir);
  assert.deepEqual(problems.map((p) => p.file).sort(), ["command-center/out/x.png", "leak.md"]);
  assert.ok(!JSON.stringify(problems).includes(token), "the finding never echoes the value");
});

test("ops repo: assembled from committed files; the real Vercel entry loads and answers with no public repo beside it", { skip: hasPublicMain ? false : "origin/main not fetched" }, () => {
  const out = path.join(tempDir("gtp-ops-assemble-"), "gtp-ops");
  const r = assemble({ repoRoot: REPO_ROOT, out });
  assert.throws(() => assemble({ repoRoot: REPO_ROOT, out }), /already exists/, "never overwrites");
  const files = listFiles(out);
  for (const f of ["api/index.mjs", "vercel.json", ".gitignore", "README.md", "SOURCE.json", ".github/workflows/cc-publisher.yml", ".github/workflows/cc-worker.yml", "command-center/package-lock.json"]) assert.ok(files.includes(f), f);
  assert.ok(!files.some((f) => /^command-center\/(out|node_modules)\//.test(f)));
  assert.equal(execFileSync("git", ["-C", out, "status", "--porcelain"], { encoding: "utf8" }), "", "one clean local commit");
  assert.equal(execFileSync("git", ["-C", out, "remote"], { encoding: "utf8" }), "", "no remote: nothing can be pushed by accident");
  const source = JSON.parse(fs.readFileSync(path.join(out, "SOURCE.json"), "utf8"));
  assert.equal(source.commandCenter.commit, r.sourceSha);

  // what Vercel does: the build command, then the function bundle (includeFiles) must hold every file it loads
  const vercel = JSON.parse(fs.readFileSync(path.join(out, "vercel.json"), "utf8"));
  execFileSync("sh", ["-c", vercel.buildCommand], { cwd: out });
  // Vercel refuses an empty output directory; the only static file is a crawl-nothing robots.txt
  assert.deepEqual(fs.readdirSync(path.join(out, vercel.outputDirectory)), ["robots.txt"]);
  assert.equal(fs.readFileSync(path.join(out, vercel.outputDirectory, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
  const micromatch = createRequire(path.join(REPO_ROOT, "app/package.json"))("micromatch");
  const include = vercel.functions["api/index.mjs"].includeFiles;
  fs.symlinkSync(path.join(CC_ROOT, "node_modules"), path.join(out, "command-center/node_modules"));
  const probe = `
    Object.assign(process.env, { DATABASE_URL: "postgres://gtp_cc_app:x@db.invalid/db?sslmode=require",
      GTP_CC_ORIGIN: "https://team.gametimepicks.yashwantbalaji.com", GTP_CC_RP_ID: "team.gametimepicks.yashwantbalaji.com",
      GH_DISPATCH_TOKEN: "placeholder", GH_OPS_OWNER: "o", GH_OPS_REPO: "gtp-ops" });
    const { default: h } = await import("./api/index.mjs");
    const out = {};
    for (const p of ["/brand/logo.png", "/api/state", "/api/cron/publish", "/"]) out[p] = (await h.fetch(new Request(process.env.GTP_CC_ORIGIN + p))).status;
    console.log(JSON.stringify(out));`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: out, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  assert.equal(run.status, 0, run.stderr);
  const status = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.deepEqual(status, { "/brand/logo.png": 200, "/api/state": 401, "/api/cron/publish": 404, "/": 200 });

  // the bundle glob holds the public snapshot and every runtime directory (a missing one fails only on Vercel)
  for (const f of listFiles(path.join(out, "app"))) assert.ok(micromatch.isMatch(`app/${f}`, include), `app/${f} is outside the function bundle`);
  for (const d of fs.readdirSync(path.join(out, "command-center"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const runtime = !["tests", "docs", "deploy", "node_modules", "scripts", "worker", "surfaces"].includes(d);
    if (runtime) assert.ok(micromatch.isMatch(`command-center/${d}/x.mjs`, include), `command-center/${d}/ is not in includeFiles`);
  }
});
