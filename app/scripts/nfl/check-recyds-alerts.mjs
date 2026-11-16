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
import { recydsAlertSummary } from "../../src/lib/sports/nfl/receiving-yards-share-view.mjs";

const file = process.argv[2] ?? process.env.GTP_RECYDS_ALERTS;
const text = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const s = recydsAlertSummary(text);
if (!s.count) { console.log("receiving-yards alerts: none"); process.exit(0); }
console.log(`::error::RECYDS ${s.errorLine}`);
for (const l of s.lines) console.log(`  ${l}`);
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `ERROR_LINE=${s.errorLine.replace(/\n/g, " ")}\n`);
process.exit(1);
