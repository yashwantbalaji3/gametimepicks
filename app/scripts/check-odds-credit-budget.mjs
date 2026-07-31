/**
 * Odds API credit-budget check (Program 088-091 §6.6) — reads the credit ledger the newest
 * generated board already carries and flags anomalies. Never fails a run (exit 0 always),
 * never prints a key, and never invents numbers: a board without a credits block is reported
 * as UNKNOWN, not zero.
 *
 *   node app/scripts/check-odds-credit-budget.mjs            # report + ::warning + ops alert on anomaly
 *   ODDS_CREDIT_SPEND_WARN=500 ODDS_CREDIT_BALANCE_WARN=4000 node ...   # thresholds
 *
 * Anomaly signatures (from docs/API_USAGE_AND_CREDIT_AUDIT.md):
 *   - single-generation spend above ODDS_CREDIT_SPEND_WARN (default 500; normal is 12-62)
 *   - remaining balance below ODDS_CREDIT_BALANCE_WARN (default 4000 = 2x the 2000 hard floor)
 * Delivery: GitHub annotation always; ops webhook (warning kind) only when running in Actions
 * with OPS_WEBHOOK_URL present — routed through scripts/ops_alert.sh, same redaction contract.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");

const SPEND_WARN = Number(process.env.ODDS_CREDIT_SPEND_WARN || 500);
const BALANCE_WARN = Number(process.env.ODDS_CREDIT_BALANCE_WARN || 4000);

const newest = fs
  .readdirSync(BOARDS)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .at(-1);

if (!newest) {
  console.log("[credit-budget] no boards found — nothing to check");
  process.exit(0);
}

const board = JSON.parse(fs.readFileSync(path.join(BOARDS, newest), "utf8"));
const credits = board?.credits ?? null;
const spent = Number(credits?.spent);
const before = Number(credits?.before);

if (credits == null || (!Number.isFinite(spent) && !Number.isFinite(before))) {
  console.log(`[credit-budget] ${newest}: credits block absent/unreadable — status UNKNOWN (not zero)`);
  process.exit(0);
}

const problems = [];
if (Number.isFinite(spent) && spent > SPEND_WARN) {
  problems.push(`board generation spent ${spent} credits (warn > ${SPEND_WARN})`);
}
if (Number.isFinite(before) && before < BALANCE_WARN) {
  problems.push(`balance ${before} below warning threshold ${BALANCE_WARN} (hard floor 2000)`);
}

const line = `[credit-budget] ${newest}: spent=${Number.isFinite(spent) ? spent : "?"} balance-before=${Number.isFinite(before) ? before : "?"} (warn: spend>${SPEND_WARN}, balance<${BALANCE_WARN})`;
console.log(line);

if (problems.length === 0) {
  console.log("[credit-budget] within budget");
  process.exit(0);
}

const msg = `odds-credit-budget: ${problems.join("; ")}`;
console.log(`::warning::${msg}`);

if (process.env.GITHUB_ACTIONS === "true" && process.env.OPS_WEBHOOK_URL) {
  const alerter = path.resolve(APP, "..", "scripts", "ops_alert.sh");
  spawnSync("bash", [alerter], {
    stdio: "inherit",
    env: {
      ...process.env,
      OPS_ALERT_KIND: "warning",
      PHASE: "odds-credit-budget",
      EXIT_STATUS: "0",
      ERROR_LINE: msg,
    },
  });
}
process.exit(0);
