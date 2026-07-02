/**
 * July 1: both Bank Builder lanes were STOPPED (last cycle lost) and the operator APPROVED a fresh July-1
 * dual-lane cycle (bank-builder-approved.json, approvedAt 2026-07-01), which was injected into the daily
 * portfolio — but the ACTIVE LADDER was never restarted from its stopped state, so settle-daily-portfolio
 * finds a stale "settled" Step 1 and its guard aborts (lib 1W/1L vs loop 0W/0L). This restarts BOTH stopped
 * lanes to fresh $100 Step-1 cycles (prior cycle preserved in priorLane + the ledger) so the July-1 official
 * settlement can record the real result through the normal gated path.
 *
 * Mirrors the proven restart-both-lanes-0628.mjs. NEVER touches canonical bankroll / crown / record — only
 * the active-ladder structure. Dry-run by default; --apply writes.
 *   cd app && npx tsx scripts/restart-both-lanes-0701.mjs           # dry-run
 *   cd app && npx tsx scripts/restart-both-lanes-0701.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const apply = process.argv.includes("--apply");
const nowIso = "2026-07-01T08:00:00Z"; // deterministic cycle-start stamp for the July-1 fresh cycle
const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;
let restarted = 0;
for (const [k, letter] of [["laneA", "A"], ["laneB", "B"]]) {
  const cur = run[k];
  if (cur.laneStatus !== "stopped") { console.log(`  ${k} is ${cur.laneStatus} (not stopped) — leaving as-is`); continue; }
  const prior = JSON.parse(JSON.stringify(cur));
  const newCycle = (cur.cycle ?? 1) + 1;
  run[k] = {
    laneId: letter, label: `Lane ${letter}: ${letter === "A" ? "lower-volatility survival" : "value"} lane (cycle ${newCycle})`,
    legs: [], steps: [{ step: 1, status: "active" }], laneStatus: "active", currentStep: 1,
    cycle: newCycle, cycleStartedAt: nowIso,
    note: `Restarted July-1 (operator-approved fresh cycle): fresh $100 Step-1 after the prior Step loss (preserved in priorLane + the ledger). Settles against the July-1 official results.`,
    priorLane: prior,
  };
  restarted++;
  console.log(`  ${k} → restarted cycle ${newCycle}, fresh $100 Step 1 (prior cycle ${cur.cycle ?? 1} ${cur.laneStatus} preserved in priorLane)`);
}
console.log(`\n  ${restarted} lane(s) restarted. Canonical bankroll/crown/record NOT touched (ladder structure only).`);
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
console.log("APPLIED → both lanes restarted. Re-run settle_soccer_day.sh --date 2026-07-01 --apply next.");
