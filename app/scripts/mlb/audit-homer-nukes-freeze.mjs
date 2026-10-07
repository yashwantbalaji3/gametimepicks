#!/usr/bin/env node
/**
 * PREP (Stage 5D). Read-only audit: replays every committed version of each mlb/homer-nukes/<date>.json, in commit
 * order, through the write-once revision rule (lib/mlb/homer-nukes-freeze.mjs). "Now" is the version's own build
 * stamp (`generatedAt`, when membership was decided) with --basis built (default), or its commit time with
 * --basis committed (when it reached the repo: an upper bound).
 * Reports, per settled day, whether the graded Top 5 equals the board of record the rule would have kept, i.e.
 * whether any rewrite after first pitch changed what was graded. Commit time is when the version reached the repo,
 * a conservative upper bound on when it was built. Writes nothing.
 *
 *   node app/scripts/mlb/audit-homer-nukes-freeze.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendRevision, boardOfRecord } from "../../src/lib/mlb/homer-nukes-freeze.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DIR = "app/public/data/mlb/homer-nukes";
const git = (...a) => execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 256e6 });

const BASIS = process.argv.includes("--basis") ? process.argv[process.argv.indexOf("--basis") + 1] : "built";
const days = fs.readdirSync(path.join(REPO, DIR)).filter((f) => /^settled-\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(8, 18)).sort();
const out = [];
for (const date of days) {
  const rel = `${DIR}/${date}.json`;
  const commits = git("log", "--reverse", "--format=%H %cI", "--", rel).trim().split("\n").filter(Boolean).map((l) => l.split(" "));
  let log = null; const refusals = [];
  for (const [sha, at] of commits) {
    let b; try { b = JSON.parse(git("show", `${sha}:${rel}`)); } catch { continue; }
    const now = BASIS === "committed" ? at : (b.generatedAt ?? at);
    const r = appendRevision(log, b, new Date(now).toISOString());
    if (r.reason) refusals.push({ at, reason: r.reason }); else log = r.log;
  }
  const settled = JSON.parse(fs.readFileSync(path.join(REPO, DIR, `settled-${date}.json`), "utf8"));
  const graded = (settled.picks ?? settled.graded ?? []).map((p) => String(p.playerId ?? p.player));
  const rec = boardOfRecord(log);
  const kept = (rec?.members ?? []).map((m) => String(m.playerId ?? m.player));
  const same = graded.length === kept.length && graded.every((x) => kept.includes(x));
  out.push({ date, versions: commits.length, revisionsKept: log?.revisions.length ?? 0, lateRewrites: refusals.filter((r) => r.reason === "STARTED").length, gradedEqualsRecord: same, ...(same ? {} : { graded, kept }) });
}
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
else {
  for (const r of out) console.log(`${r.date} versions=${r.versions} kept=${r.revisionsKept} lateRewrites=${r.lateRewrites} gradedEqualsRecord=${r.gradedEqualsRecord}${r.gradedEqualsRecord ? "" : `  graded=${r.graded} record=${r.kept}`}`);
  const bad = out.filter((r) => !r.gradedEqualsRecord), late = out.filter((r) => r.lateRewrites);
  console.log(`\nbasis=${BASIS} · ${out.length} settled days · ${late.length} with a rewrite after first pitch · ${bad.length} where the graded Top 5 differs from the board of record`);
}
