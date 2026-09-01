#!/usr/bin/env node
/**
 * MEMORY.md MUST FIT ITS LOADER.
 *
 *   node app/scripts/ops/check-memory-size.mjs [--dir <memory dir>] [--limit-kb 24.4]
 *
 * The session memory index is loaded whole at the start of every session. When it exceeds the
 * loader's limit only PART of it arrives — silently. Observed 2026-09-01: 27.7 KB against a 24.4 KB
 * limit, so an unknown tail of 165 hard-won entries was simply not there, and nothing said so. A
 * memory that is too large to load is not a memory; it is a file.
 *
 * The fix is compaction with an audit trail, not deletion: aged program narratives move to
 * MEMORY_ARCHIVE.md and their topic files stay exactly where they were. This checks the result.
 *
 * WHY THIS IS NOT IN CI. The memory directory lives outside the repository, under the user's own
 * `~/.claude` tree. CI has no such directory, so this reports SKIPPED there — loudly, with the
 * reason. That is deliberate: the failure mode this whole program is repairing is a check that
 * cannot see its subject and reports success anyway.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const LIMIT_KB = Number(arg("--limit-kb", "24.4"));
const DEFAULT_DIR = path.join(os.homedir(), ".claude", "projects", "-Users-yashwantbalaji", "memory");
const DIR = arg("--dir", DEFAULT_DIR);
const INDEX = path.join(DIR, "MEMORY.md");
const ARCHIVE = path.join(DIR, "MEMORY_ARCHIVE.md");

if (!fs.existsSync(INDEX)) {
  console.log(`[memory] SKIPPED — no memory index at ${INDEX}`);
  console.log("[memory] (this machine has no session memory directory; the check has not run, it has not passed)");
  process.exit(0);
}

const bytes = fs.statSync(INDEX).size;
const limit = LIMIT_KB * 1024;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`[memory] MEMORY.md ${kb(bytes)} against a ${LIMIT_KB} KB limit`);

if (fs.existsSync(ARCHIVE)) {
  console.log(`[memory] archive present: ${kb(fs.statSync(ARCHIVE).size)}`);
  /*
   * The archive is only trustworthy if the files it points at still exist. An archive of dead links
   * would let compaction look like preservation while quietly losing the history.
   */
  const dangling = [];
  for (const line of fs.readFileSync(ARCHIVE, "utf8").split("\n")) {
    const m = /\]\(([^)]+\.md)\)/.exec(line);
    if (m && !fs.existsSync(path.join(DIR, m[1]))) dangling.push(m[1]);
  }
  if (dangling.length) {
    console.error(`[memory] REFUSED: ${dangling.length} archived pointer(s) name a file that no longer exists:`);
    for (const d of dangling.slice(0, 5)) console.error(`           ${d}`);
    process.exit(2);
  }
  console.log("[memory] every archived pointer resolves");
}

if (bytes > limit) {
  console.error(`[memory] OVER LIMIT by ${kb(bytes - limit)} — part of the index is not being loaded.`);
  console.error("[memory] Move the oldest program narratives to MEMORY_ARCHIVE.md; keep their topic files.");
  process.exit(1);
}

console.log(`[memory] OK · ${kb(limit - bytes)} headroom`);
