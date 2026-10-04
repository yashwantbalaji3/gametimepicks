/**
 * SESSION 12 · THE FIRST COMMIT OF A SHADOW DAY FILE — OR AN HONEST "CANNOT TELL".
 *
 * The shadow report proves a day file was not rewritten by comparing it with the content of the commit that
 * FIRST added it (`git log --diff-filter=A`, oldest). nightly-settle checks out with `fetch-depth: 1`, and in a
 * shallow clone every file appears to be "added" by the shallow boundary commit — so on 2026-10-04 the committed
 * report named one bot commit (`697b131a6`, 14:48Z) as the first commit of every day file since 09-21, and
 * compared each file with ITSELF: "INTACT" was not a test. A local full-history run found the real first commits.
 *
 * Rule: an add-commit that is a SHALLOW BOUNDARY is not evidence — return null, and the report says UNVERIFIED.
 * IO is git only (no network); the repository is an argument so tests can build real full and shallow clones.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const git = (repo, args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** The shallow-boundary commits of `repo` (empty for a full clone). */
export function shallowBoundaries(repo) {
  try {
    if (git(repo, ["rev-parse", "--is-shallow-repository"]).trim() !== "true") return new Set();
    const file = path.resolve(repo, git(repo, ["rev-parse", "--git-path", "shallow"]).trim());
    return new Set(fs.readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
  } catch { return new Set(); }
}

/**
 * The oldest commit that added `rel`, with that content parsed by `parse`, or null when it cannot be known
 * (no history, or the "add" is only a shallow boundary).
 * @returns {{ hash: string, committedAt: string, content: any } | null}
 */
export function firstAddCommit(repo, rel, parse = JSON.parse, boundaries = shallowBoundaries(repo)) {
  try {
    const out = git(repo, ["log", "--diff-filter=A", "--format=%H%x09%cI", "--", rel]).trim().split("\n").filter(Boolean);
    if (!out.length) return null;
    const [hash, committedAt] = out.at(-1).split("\t"); // the oldest add wins
    if (boundaries.has(hash)) return null;               // a shallow boundary "adds" everything — not evidence
    return { hash, committedAt, content: parse(git(repo, ["show", `${hash}:${rel}`])) };
  } catch { return null; }
}
