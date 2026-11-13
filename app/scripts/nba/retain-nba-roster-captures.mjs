#!/usr/bin/env node
/**
 * Keep the exact bytes of the committed NBA roster captures a commit is about to overwrite (roster-index.mjs, RETAINED
 * CAPTURES), so a frozen receipt's roster sha256 always resolves to a committed file.
 *
 *   node scripts/nba/retain-nba-roster-captures.mjs <dated>.json [latest.json …]
 *
 * Prints the retained file of each named capture, as a path relative to app/, one per line (the workflow stages exactly
 * those) — including one an earlier step already wrote: the forecast window captures, resets its checkout, then commits,
 * so the file usually exists (untracked) by the time this runs. Staging a file that is already committed is a no-op.
 * Writes nothing for a capture already retained. Never fails the caller: an unreadable capture is skipped.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { retainRosterCaptures, retainedFilesFor } from "../../src/lib/sports/nba/roster-index.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.resolve(APP, "..", "data", "internal", "research", "nba", "rosters");
const names = process.argv.slice(2).filter((a) => /^(\d{4}-\d{2}-\d{2}|latest)\.json$/.test(a));
const captures = names.length ? names : ["latest.json"];
retainRosterCaptures(DIR, captures);
for (const f of retainedFilesFor(DIR, captures)) console.log(path.relative(APP, path.join(DIR, f)));
