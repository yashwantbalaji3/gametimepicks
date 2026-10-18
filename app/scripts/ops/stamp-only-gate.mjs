#!/usr/bin/env node
/**
 * mlb-lineup-refresh.yml / mlb-daily-production.yml helper (COST-001 Stage B): run AFTER `git add`, BEFORE
 * `git commit`. Judges the staged set with lib/ops/stamp-only-gate.mjs against HEAD.
 *
 *   exit 0  SUPPRESSED — every gated build input changed only in its stamps: those files are restored to
 *           HEAD (index and worktree) and new snapshots identical to the last committed one are unstaged
 *           and deleted. Free files (ops verdicts, admin status, internal provenance) stay staged.
 *   exit 1  PUBLISH — something a reader can see moved (or nothing gated was staged). The index is untouched.
 *   exit 2  ERROR — the gate could not judge. The index is untouched, so the workflow commits as before.
 *
 *   node app/scripts/ops/stamp-only-gate.mjs [--dry-run] [--now <iso>] [--heartbeat-hours <h>]
 *
 * Run from the repo root. Prints one JSON line with the verdict, reasons and the files it acted on.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decide, buildInputPredicate, ruleFor, DEFAULT_HEARTBEAT_HOURS } from "../../src/lib/ops/stamp-only-gate.mjs";

const arg = (f) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes("--dry-run");
const nowMs = arg("--now") ? Date.parse(arg("--now")) : Date.now();
const heartbeatHours = arg("--heartbeat-hours") != null ? Number(arg("--heartbeat-hours")) : DEFAULT_HEARTBEAT_HOURS;

const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
const gitOrNull = (...a) => { try { return git(...a); } catch { return null; } };

function main() {
  const ignoreSh = fs.readFileSync(path.join("app", "scripts", "vercel-ignore-build.sh"), "utf8");
  const isBuildInput = buildInputPredicate(ignoreSh) ?? (() => true);

  const staged = git("diff", "--cached", "--name-status", "--no-renames", "-z").split("\0").filter(Boolean);
  const changes = [];
  for (let i = 0; i < staged.length; i += 2) {
    const status = staged[i][0];
    const file = staged[i + 1];
    const before = status === "A" ? null : gitOrNull("show", `HEAD:${file}`);
    const after = status === "D" ? null : gitOrNull("show", `:${file}`);
    let priorSnapshot = null;
    if (status === "A" && ruleFor(file)?.snapshot) {
      const dir = path.posix.dirname(file);
      const names = (gitOrNull("ls-tree", "--name-only", "HEAD", `${dir}/`) ?? "").split("\n").filter((n) => /snapshot-\d{12}\.json$/.test(n)).sort();
      priorSnapshot = names.length ? gitOrNull("show", `HEAD:${names[names.length - 1]}`) : null;
    }
    changes.push({ path: file, status, before, after, buildInput: isBuildInput(file), priorSnapshot });
  }

  const out = decide({ changes, nowMs, heartbeatHours });
  if (out.verdict === "SUPPRESS" && !DRY) {
    if (out.restore.length) git("checkout", "HEAD", "--", ...out.restore);
    if (out.drop.length) {
      git("rm", "-q", "--cached", "--", ...out.drop);
      for (const f of out.drop) fs.rmSync(f, { force: true });
    }
  }
  console.log(JSON.stringify({ verdict: out.verdict, dryRun: DRY, reasons: out.reasons.slice(0, 12), restored: out.restore, dropped: out.drop, stillStaged: out.free }));
  return out.verdict === "SUPPRESS" ? 0 : 1;
}

let code = 2;
try { code = main(); } catch (e) { console.log(JSON.stringify({ verdict: "ERROR", reason: String(e?.message ?? e).slice(0, 300) })); }
process.exit(code);
