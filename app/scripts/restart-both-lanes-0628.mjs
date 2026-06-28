/**
 * June 28: both Bank Builder lanes LOST on June 27 (stopped). Restart BOTH to fresh $100 Step-1 cycles
 * (prior lost lanes preserved in priorLane + the ledger). June 28 is a 1-WC-game day with no
 * bankBuilderEligible card, so the activation will leave them AWAITING a qualified card (honest — no forced
 * low-quality card). NEVER touches canonical bankroll/crown/record.
 *   cd app && npx tsx scripts/restart-both-lanes-0628.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const apply = process.argv.includes("--apply");
const nowIso = new Date().toISOString();
const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;
for (const [k, letter] of [["laneA", "A"], ["laneB", "B"]]) {
  const cur = run[k];
  if (cur.laneStatus !== "stopped") { console.log(`  ${k} is ${cur.laneStatus} (not stopped) — leaving as-is`); continue; }
  const prior = JSON.parse(JSON.stringify(cur));
  const newCycle = (cur.cycle ?? 1) + 1;
  run[k] = {
    laneId: letter, label: `Lane ${letter}: ${letter === "A" ? "lower-volatility survival" : "value"} lane (cycle ${newCycle})`,
    legs: [], steps: [{ step: 1, status: "active" }], laneStatus: "active", currentStep: 1,
    cycle: newCycle, cycleStartedAt: nowIso,
    note: `Restarted June-28 (operator-directed): fresh $100 Step-1 after the June-27 Step loss (preserved in priorLane + the ledger). June-28 is a 1-WC-game slate, so this lane AWAITS a qualified card.`,
    priorLane: prior,
  };
  console.log(`  ${k} → restarted cycle ${newCycle}, fresh $100 Step 1 (prior cycle ${cur.cycle} ${cur.laneStatus} preserved)`);
}
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
console.log("APPLIED → both lanes restarted. Run activate-daily-portfolio --date 2026-06-28 --apply next.");
