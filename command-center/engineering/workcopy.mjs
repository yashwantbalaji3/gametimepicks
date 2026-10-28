/**
 * ISOLATED WORKING COPY — where delegated engineering happens, never in the founder's checkout.
 *
 *   snapshot   the current command-center/ state (committed or not) becomes a commit object built through a
 *              temporary index — the founder's index, branch and files are not touched;
 *   create     `git worktree add --no-checkout -b cc/<task>` at that snapshot, then check out only the paths the
 *              command center needs (≈12 MB, not the 2.9 GB repo), and link app/node_modules for tests;
 *   changes    what the run changed, against the checked-out paths only (git diff + untracked files);
 *   keep       commit exactly the in-scope changes on cc/<task> through a temporary index (local; never pushed);
 *   discard    remove the worktree and its branch.
 *
 * Nothing here pushes, merges, or edits a tracked file outside the working copy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inScope } from "../contracts/engineering.mjs";

/** Repo paths the command center reads at runtime and in its tests. */
export const WORKCOPY_PATHS = Object.freeze([
  "command-center",
  "app/package.json",
  "app/public/brand",
  "app/scripts/build-mlb-social-content.mjs",
  "app/src/lib/simulation-theater/nfl-team-colors.mjs",
  "app/src/lib/simulation-theater/field-geometry.mjs",
  "data/internal/forecast-ledger/v1/nfl.jsonl",
  "data/internal/nfl/forecast-receipts/2026-10-25",
]);
const NODE_MODULES_LINK = "app/node_modules";

function git(cwd, args, { env, allowFail = false, input } = {}) {
  try {
    return execFileSync("git", args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (allowFail) return { failed: true, status: err.status, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
    throw new Error(`git ${args.join(" ")} failed: ${String(err.stderr ?? err.message).trim()}`);
  }
}

function withTempIndex(repo, fn) {
  const idx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-cc-idx-")), "index");
  try {
    return fn({ GIT_INDEX_FILE: idx });
  } finally {
    fs.rmSync(path.dirname(idx), { recursive: true, force: true });
  }
}

/** Commit object = HEAD + the current (possibly uncommitted) command-center/ tree. No ref, index or file changes. */
export function snapshotBase(repoRoot, { subtree = "command-center" } = {}) {
  const head = git(repoRoot, ["rev-parse", "HEAD"]);
  return withTempIndex(repoRoot, (env) => {
    git(repoRoot, ["read-tree", head], { env });
    git(repoRoot, ["add", "-A", "--", subtree], { env });
    const tree = git(repoRoot, ["write-tree"], { env });
    const sha = git(repoRoot, ["commit-tree", tree, "-p", head, "-m", `command-center snapshot for delegated engineering (base ${head.slice(0, 10)})`], { env });
    return { sha, head };
  });
}

/** Where worktrees live: the main repository's .claude/worktrees (the convention this repo already uses). */
export function worktreesDir(repoRoot) {
  const common = path.resolve(repoRoot, git(repoRoot, ["rev-parse", "--git-common-dir"]));
  return path.join(path.dirname(common), ".claude", "worktrees");
}

/**
 * @param {{ repoRoot: string, taskId: string, paths?: string[], nodeModulesFrom?: string|null }} o
 */
export function createWorkcopy({ repoRoot, taskId, paths = WORKCOPY_PATHS, nodeModulesFrom = path.join(repoRoot, NODE_MODULES_LINK) }) {
  const { sha, head } = snapshotBase(repoRoot);
  const branch = `cc/${taskId}`;
  const dir = path.join(worktreesDir(repoRoot), `cc-${taskId}`);
  git(repoRoot, ["worktree", "add", "--no-checkout", "-b", branch, dir, sha]);
  git(dir, ["checkout", sha, "--", ...paths]);
  if (nodeModulesFrom && fs.existsSync(nodeModulesFrom) && fs.existsSync(path.join(dir, "app"))) {
    fs.symlinkSync(nodeModulesFrom, path.join(dir, NODE_MODULES_LINK), "dir");
  }
  return { dir, branch, base: sha, head, paths: [...paths] };
}

/** What changed in the working copy since checkout, with a scope verdict per file. */
export function workcopyChanges(wc) {
  const files = new Map();
  const nameStatus = git(wc.dir, ["diff", "--name-status"]);
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, ...rest] = line.split("\t");
    files.set(rest.at(-1), status[0]);
  }
  const untracked = git(wc.dir, ["ls-files", "--others", "--exclude-standard"]);
  for (const f of untracked.split("\n").filter(Boolean)) {
    if (f === NODE_MODULES_LINK) continue;
    files.set(f, "A");
  }
  const list = [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, status]) => ({ file, status, inScope: inScope(file) }));
  let diff = git(wc.dir, ["diff", "--no-color"]);
  for (const f of list.filter((x) => x.status === "A")) {
    const r = git(wc.dir, ["diff", "--no-color", "--no-index", "--", "/dev/null", f.file], { allowFail: true });
    diff += `\n${typeof r === "string" ? r : r.stdout}`;
  }
  return { files: list, outOfScope: list.filter((x) => !x.inScope).map((x) => x.file), diff: diff.trim() };
}

/** Commit the in-scope changes on cc/<task>. Returns the new commit sha. Refuses if anything is out of scope. */
export function keepWorkcopy(wc, { message }) {
  const changes = workcopyChanges(wc);
  if (changes.outOfScope.length) throw new Error(`refusing to keep: out of scope ${changes.outOfScope.join(", ")}`);
  if (!changes.files.length) throw new Error("nothing to keep");
  return withTempIndex(wc.dir, (env) => {
    git(wc.dir, ["read-tree", wc.base], { env });
    git(wc.dir, ["add", "-A", "--", ...changes.files.map((f) => f.file)], { env });
    const tree = git(wc.dir, ["write-tree"], { env });
    const sha = git(wc.dir, ["commit-tree", tree, "-p", wc.base, "-m", message], { env });
    git(wc.dir, ["update-ref", `refs/heads/${wc.branch}`, sha, wc.base]);
    return sha;
  });
}

export function discardWorkcopy({ repoRoot, wc }) {
  git(repoRoot, ["worktree", "remove", "--force", wc.dir], { allowFail: true });
  if (fs.existsSync(wc.dir)) fs.rmSync(wc.dir, { recursive: true, force: true });
  git(repoRoot, ["worktree", "prune"], { allowFail: true });
  git(repoRoot, ["branch", "-D", wc.branch], { allowFail: true });
}

/** sha256-style fingerprint of the founder's checkout state (status + HEAD), to prove it did not change. */
export function checkoutFingerprint(repoRoot) {
  return `${git(repoRoot, ["rev-parse", "HEAD"])}\n${git(repoRoot, ["status", "--porcelain", "-uall"])}`;
}
