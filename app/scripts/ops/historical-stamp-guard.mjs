#!/usr/bin/env node
/**
 * Restore staged dated-historical files whose only change is their stamps (see lib/ops/historical-stamp-guard.mjs).
 * Run from the repo root after staging, before the "anything staged?" check:
 *
 *   node app/scripts/ops/historical-stamp-guard.mjs [--dry-run] [--today YYYY-MM-DD]
 *
 * Exit 0 always on success (restored or not). Exit 2 if it could not run — and in that case it has changed
 * nothing, so the caller publishes exactly what it staged, as before this guard existed.
 */
import { execFileSync } from "node:child_process";
import { decide, etDate } from "../../src/lib/ops/historical-stamp-guard.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const ti = args.indexOf("--today");
const today = ti >= 0 ? args[ti + 1] : etDate();

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 30 });
const show = (spec) => { try { return git("show", spec); } catch { return null; } };

let entries;
try {
  entries = git("diff", "--cached", "--name-status", "--no-renames").split("\n").filter(Boolean).map((l) => {
    const [status, ...p] = l.split("\t");
    return { status: status[0], file: p[p.length - 1] };
  });
} catch (e) {
  console.error(`historical-stamp-guard: could not read the index (${e.message}) — nothing changed`);
  process.exit(2);
}

const restore = [];
const counts = {};
for (const { status, file } of entries) {
  if (status !== "M" || !/\.jsonl?$/.test(file)) continue;
  const d = decide(file, status, show(`HEAD:${file}`), show(`:${file}`), today);
  counts[d.reason] = (counts[d.reason] ?? 0) + 1;
  if (d.restore) restore.push(file);
}

if (!dry && restore.length) {
  try {
    for (let i = 0; i < restore.length; i += 200) git("checkout", "HEAD", "--", ...restore.slice(i, i + 200));
  } catch (e) {
    // A partial restore is still safe (each restored file is its committed bytes), but say so loudly.
    console.error(`historical-stamp-guard: restore failed part-way (${e.message})`);
    process.exit(2);
  }
}
console.log(`historical-stamp-guard: today(ET)=${today} · ${dry ? "would restore" : "restored"} ${restore.length} dated file(s) whose only change was stamps · ${JSON.stringify(counts)}`);
