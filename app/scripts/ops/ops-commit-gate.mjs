#!/usr/bin/env node
/**
 * CLI for lib/ops/ops-commit-gate.mjs (writer-batching PROTOTYPE, 2026-10-17 — not wired to main).
 *
 *   node app/scripts/ops/ops-commit-gate.mjs            # run from the repo root after `git add`
 *
 * Compares the STAGED ops files with HEAD and prints COMMIT or SKIP plus the reasons. Exit 0 = COMMIT,
 * exit 10 = SKIP. Any error exits 0 (COMMIT): the gate fails open, toward pushing.
 */
import { execFileSync } from "node:child_process";

import { decideOpsCommit, OPS_FILES } from "../../src/lib/ops/ops-commit-gate.mjs";

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const blob = (spec) => { try { return git("show", spec); } catch { return null; } };

try {
  const staged = git("diff", "--cached", "--name-only").trim().split("\n").filter(Boolean);
  const opsPaths = new Set(Object.values(OPS_FILES));
  const head = {}, next = {};
  for (const [k, p] of Object.entries(OPS_FILES)) { head[k] = blob(`HEAD:${p}`); next[k] = blob(`:${p}`); }
  const r = decideOpsCommit({ head, next, otherChangedPaths: staged.filter((p) => !opsPaths.has(p)) });
  console.log(`ops-commit-gate: ${r.decision} — ${r.reasons.join("; ")}`);
  process.exit(r.decision === "SKIP" ? 10 : 0);
} catch (e) {
  console.log(`ops-commit-gate: COMMIT — gate error, failing open (${e?.message ?? e})`);
  process.exit(0);
}
