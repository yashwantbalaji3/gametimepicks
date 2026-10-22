/**
 * PRIVATE DATA DIRECTORY — where paid-market data (sportsbook prices, graded real lines) may be written. Node-only.
 *
 * FOUNDER DECISION (storage, 2026-10-22): raw or reconstructable sportsbook prices are never committed to the public
 * GitHub repository. Authorized captures are kept in secure private storage; grading and analysis run privately.
 *
 * A writer of such data takes its directory ONLY from an explicit `--out-dir` (cliDir) or `GTP_PRIVATE_DATA_DIR`, and
 * this resolver refuses, before anything is written or bought:
 *   - no directory given (there is no default; nothing falls back into the repository);
 *   - a relative path;
 *   - a path inside this repository;
 *   - a path inside ANY git working tree (a `.git` file or directory at the path or an ancestor). This also catches the
 *     sibling worktrees of this same public repository (gametimepicks-wt/…), which would publish on the next push.
 */
import fs from "node:fs";
import path from "node:path";

export const PRIVATE_DIR_ENV = "GTP_PRIVATE_DATA_DIR";

/** The deepest existing ancestor of `p` (p itself when it exists), resolved through symlinks. */
function realExisting(p) {
  let cur = path.resolve(p);
  for (;;) {
    try { return { real: fs.realpathSync(cur), rest: path.relative(cur, path.resolve(p)) }; } catch { /* keep climbing */ }
    const up = path.dirname(cur);
    if (up === cur) return { real: cur, rest: path.relative(cur, path.resolve(p)) };
    cur = up;
  }
}

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** The git working tree that contains `dir` (an ancestor holding `.git`), or null. */
export function gitTreeContaining(dir) {
  let cur = dir;
  for (;;) {
    if (fs.existsSync(path.join(cur, ".git"))) return cur;
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

/**
 * @param {{ cliDir?: string|null, env?: Record<string, string|undefined>, repoRoot: string }} opts
 * @returns {{ ok: true, dir: string, source: string } | { ok: false, reason: string }}
 */
export function resolvePrivateDataDir({ cliDir = null, env = process.env, repoRoot }) {
  const raw = cliDir ?? env?.[PRIVATE_DIR_ENV] ?? null;
  const source = cliDir != null ? "--out-dir" : PRIVATE_DIR_ENV;
  if (raw == null || String(raw).trim() === "") return { ok: false, reason: `no private data directory: pass --out-dir <absolute path outside the repository> or set ${PRIVATE_DIR_ENV}. There is no in-repository default.` };
  const s = String(raw).trim();
  if (!path.isAbsolute(s)) return { ok: false, reason: `${source} must be an absolute path (got ${JSON.stringify(s)})` };
  const { real, rest } = realExisting(s);
  const dir = path.join(real, rest);
  const repo = realExisting(repoRoot).real;
  if (inside(dir, repo)) return { ok: false, reason: `${source} ${dir} is inside the repository (${repo}); paid-market data is never written to the public repository` };
  const tree = gitTreeContaining(real);
  if (tree) return { ok: false, reason: `${source} ${dir} is inside a git working tree (${tree}); use a directory outside every repository` };
  return { ok: true, dir, source };
}
