#!/usr/bin/env node
/**
 * REPLAY of the ops commit gate over real auto-refresh history (read-only; git only).
 *
 *   node app/scripts/ops/ops-commit-gate-replay.mjs [--since 2026-10-09T00:00Z] [--until 2026-10-17T01:11Z] [--ref origin/main]
 *
 * For each `auto-refresh:` commit on the first-parent history, in order, it reconstructs what main's HEAD would have
 * held for each ops file IF the earlier skipped auto-refresh commits had never been pushed: walk back to the last
 * commit that touched the file; if that commit is a skipped auto-refresh commit, use the file as it was before it
 * (recursively); otherwise use it as committed (other writers — nightly-settle, the publication-slo action riding other
 * workflows — keep their own commits). The run's own version is the file at the auto-refresh commit. Then it applies
 * decideOpsCommit and reports kept / skipped, with the reasons for every kept commit.
 */
import { execFileSync } from "node:child_process";

import { decideOpsCommit, OPS_FILES } from "../../src/lib/ops/ops-commit-gate.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SINCE = arg("--since", "2026-10-09T00:00Z"), UNTIL = arg("--until", "2026-10-17T01:11Z"), REF = arg("--ref", "origin/main");
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const blob = (spec) => { try { return git("show", spec); } catch { return null; } };

const commits = git("log", REF, "--first-parent", `--since=${SINCE}`, `--until=${UNTIL}`, "--extended-regexp", "--grep=^auto-refresh:", "--format=%H\t%cI\t%s")
  .trim().split("\n").filter(Boolean).map((l) => l.split("\t")).reverse();
const skipped = new Set();

/** The file as main would hold it just before commit `sha`, had the skipped auto-refresh commits never landed. */
function simHead(path, sha) {
  const last = git("log", "-1", "--first-parent", "--format=%H", `${sha}^`, "--", path).trim();
  if (!last) return null;
  if (skipped.has(last)) return simHead(path, last);
  return blob(`${last}:${path}`);
}

let kept = 0, maxHbLag = 0;
const rows = [];
for (const [sha, at, subject] of commits) {
  const files = git("show", "--format=", "--name-only", sha).trim().split("\n").filter(Boolean);
  const ops = new Set(Object.values(OPS_FILES));
  const head = {}, next = {};
  for (const [k, p] of Object.entries(OPS_FILES)) { head[k] = simHead(p, sha); next[k] = blob(`${sha}:${p}`); }
  const r = decideOpsCommit({ head, next, otherChangedPaths: files.filter((f) => !ops.has(f)) });
  if (r.decision === "SKIP") skipped.add(sha); else kept++;
  const hbLagH = (() => { try { return (Date.parse(JSON.parse(next.heartbeat).lastRunAt) - Date.parse(JSON.parse(head.heartbeat).lastRunAt)) / 36e5; } catch { return null; } })();
  if (r.decision === "SKIP" && hbLagH != null) maxHbLag = Math.max(maxHbLag, hbLagH);
  rows.push({ sha: sha.slice(0, 10), at, decision: r.decision, reasons: r.reasons });
  console.log(`${at.slice(0, 16)} ${sha.slice(0, 10)} ${r.decision.padEnd(6)} ${r.reasons.join("; ").slice(0, 160)}`);
}
const days = commits.length ? (Date.parse(commits.at(-1)[1]) - Date.parse(SINCE)) / 864e5 : 0;
console.log(`max age of main's heartbeat behind a skipped run: ${maxHbLag.toFixed(1)} h (floor 6 h; alarms at 26 h / 36 h)`);
console.log(`\nauto-refresh commits ${commits.length} → pushed ${kept}, skipped ${skipped.size} over ${days.toFixed(2)} days (${(skipped.size / days).toFixed(2)} pushes/day avoided)`);
if (argv.includes("--json")) console.log(JSON.stringify({ since: SINCE, until: UNTIL, commits: commits.length, kept, skipped: [...skipped], rows }));
