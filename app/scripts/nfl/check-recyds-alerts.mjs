#!/usr/bin/env node
/**
 * N8 parity fix — the event-window's LAST data check: fail the run when receiving yards were withheld or the share view
 * could not be built/proven this window. Runs after the window's commits are pushed, so every other market is already
 * published; its non-zero exit makes the run conclusion `failure` (what cron-watchdog reads) and triggers the
 * workflow's "Notify on failure" webhook. Exports ERROR_LINE for that step when GITHUB_ENV is set.
 *
 * Usage: node scripts/nfl/check-recyds-alerts.mjs [alertFile]   (default: $GTP_RECYDS_ALERTS)
 * Exit: 0 = no alert line (or no file), 1 = at least one RECYDS_* line.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { recydsAlertSummary } from "../../src/lib/sports/nfl/receiving-yards-share-view.mjs";

/** ERROR_LINE for the failure webhook: prior line and failing-step context first, then the receiving-yards summary. */
export function combinedErrorLine({ prior, priorContext, recyds }) {
  const failed = String(priorContext ?? "").split(/[\s,]+/).filter((kv) => /=failure$/.test(kv));
  return [prior?.trim() || null, failed.length ? `earlier step(s) failed: ${failed.join(", ")}` : null, recyds].filter(Boolean).join(" | ").replace(/\n/g, " ");
}

const invokedDirectly = (() => { try { return fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1] ?? ""); } catch { return false; } })();
if (invokedDirectly) main();
function main() {
const file = process.argv[2] ?? process.env.GTP_RECYDS_ALERTS;
const text = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const s = recydsAlertSummary(text);
if (!s.count) { console.log("receiving-yards alerts: none"); process.exit(0); }
console.log(`::error::RECYDS ${s.errorLine}`);
for (const l of s.lines) console.log(`  ${l}`);
/* APPEND, never overwrite: an earlier failure (a failed publish, say) keeps its context. RECYDS_PRIOR_CONTEXT carries the
   outcome of the steps before this one (set by the workflow); an ERROR_LINE already exported is kept in front. */
const combined = combinedErrorLine({ prior: process.env.ERROR_LINE, priorContext: process.env.RECYDS_PRIOR_CONTEXT, recyds: s.errorLine });
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ERROR_LINE=${combined}\n`);
process.exit(1);
}
