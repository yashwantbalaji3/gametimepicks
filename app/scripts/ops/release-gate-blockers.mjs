#!/usr/bin/env node
/**
 * Which in-progress runs block a release merge (lib/ops/release-gate-blockers.mjs). PROPOSAL, for founder review; the v1
 * gate does not call this.
 *
 *   node scripts/ops/release-gate-blockers.mjs [--ref origin/main] [--runs "name1,name2"] [--table]
 *
 * Workflows are read from --ref (default origin/main), never from the working tree, so a branch checkout cannot change
 * the classification. Without --runs the in-progress runs come from `gh run list --status in_progress`.
 * Prints BLOCKING lines and exits 1 if any run blocks; with --table it prints every workflow's class and exits 0.
 */
import { execFileSync } from "node:child_process";
import { classifyWorkflow, blockingRuns } from "../../src/lib/ops/release-gate-blockers.mjs";

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const REF = arg("--ref") ?? "origin/main";
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...a) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", maxBuffer: 1e8 });

const files = git("ls-tree", "--name-only", `${REF}:.github/workflows/`).trim().split("\n").filter((f) => /\.ya?ml$/.test(f));
const byName = new Map();
const rows = [];
for (const f of files) {
  const c = classifyWorkflow(git("show", `${REF}:.github/workflows/${f}`));
  if (c.name) byName.set(c.name, c);
  rows.push({ file: f, ...c });
}
if (argv.includes("--table")) {
  for (const r of rows.sort((a, b) => Number(a.writer) - Number(b.writer) || a.file.localeCompare(b.file))) console.log(`${r.writer ? "WRITER    " : "NON-WRITER"} ${r.file.padEnd(36)} ${r.name ?? "?"}${r.reasons.length ? "  " + r.reasons.join(" ") : ""}`);
  process.exit(0);
}
const names = arg("--runs") != null
  ? arg("--runs").split(",").map((s) => s.trim()).filter(Boolean)
  : JSON.parse(execFileSync("gh", ["run", "list", "--status", "in_progress", "--json", "workflowName"], { encoding: "utf8" })).map((r) => r.workflowName);
const blocking = blockingRuns(names, byName);
for (const b of blocking) console.log(`BLOCKING ${b.name}: ${b.reasons.join(" ")}`);
const passing = names.filter((n) => !blocking.some((b) => b.name === n));
if (passing.length) console.log(`not blocking (non-writers or exempt): ${passing.join(", ")}`);
process.exit(blocking.length ? 1 : 0);
