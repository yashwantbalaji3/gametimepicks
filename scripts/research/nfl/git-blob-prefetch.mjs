/**
 * Batch blob prefetch for PARTIAL clones (checkout `filter: blob:none`, as quality-gate.yml and
 * nfl-props-forward-shadow.yml use). Reading many historical blobs one `git show` at a time makes git lazy-fetch
 * each missing blob in its own round trip; this fetches every missing blob a phase needs in ONE promisor fetch
 * (the same fetch git's own lazy fetch issues, with the object ids on stdin).
 *
 * Performance only, never correctness: in a full clone it is a no-op, and anything it misses is still lazy-fetched
 * by git on read. It must never be run with GIT_NO_LAZY_FETCH set for the reads that follow.
 */
import { spawnSync } from "node:child_process";

const run = (cwd, args, opts = {}) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });

/** The promisor remote of a partial clone, or null in a full clone. */
export function promisorRemote(cwd) {
  const r = run(cwd, ["config", "--get-regexp", "^remote\\..*\\.promisor$"]);
  const line = (r.stdout ?? "").split("\n").find((l) => /\s+true$/i.test(l));
  return line ? line.replace(/^remote\.(.*)\.promisor\s+true$/i, "$1") : null;
}

/**
 * Prefetch the blobs named by `specs` (["<commit>:<path>", ...]). Paths absent at a commit are ignored.
 * Returns {partial, requested, missing, fetched}.
 */
export function prefetchBlobs(cwd, specs) {
  const remote = promisorRemote(cwd);
  const unique = [...new Set(specs ?? [])];
  if (!remote || !unique.length) return { partial: Boolean(remote), requested: unique.length, missing: 0, fetched: 0 };
  // resolve blob ids from the trees (present in a blob:none clone), one ls-tree per commit
  const byCommit = new Map();
  for (const s of unique) {
    const i = s.indexOf(":");
    const c = s.slice(0, i);
    if (!byCommit.has(c)) byCommit.set(c, []);
    byCommit.get(c).push(s.slice(i + 1));
  }
  const oids = new Set();
  for (const [commit, paths] of byCommit) {
    for (let k = 0; k < paths.length; k += 500) {
      const r = run(cwd, ["ls-tree", "-z", commit, "--", ...paths.slice(k, k + 500)]);
      for (const rec of (r.stdout ?? "").split("\0")) {
        const m = /^\d+ blob ([0-9a-f]{40,64})\t/.exec(rec);
        if (m) oids.add(m[1]);
      }
    }
  }
  // which of them are not local yet (checked WITHOUT triggering a lazy fetch)
  const check = run(cwd, ["cat-file", "--batch-check"], { input: [...oids].join("\n") + "\n", env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  const missing = (check.stdout ?? "").split("\n").filter((l) => / missing$/.test(l)).map((l) => l.split(" ")[0]);
  if (!missing.length) return { partial: true, requested: unique.length, missing: 0, fetched: 0 };
  const f = run(cwd, ["-c", "fetch.negotiationAlgorithm=noop", "fetch", remote, "--no-tags", "--no-write-fetch-head", "--recurse-submodules=no", "--filter=blob:none", "--stdin"], { input: missing.join("\n") + "\n" });
  if (f.status !== 0) {
    console.error(`prefetchBlobs: batch fetch of ${missing.length} blob(s) failed (${(f.stderr ?? "").trim().split("\n").at(-1)}); reads fall back to git's lazy fetch`);
    return { partial: true, requested: unique.length, missing: missing.length, fetched: 0 };
  }
  return { partial: true, requested: unique.length, missing: missing.length, fetched: missing.length };
}
