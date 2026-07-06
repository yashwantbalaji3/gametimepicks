/**
 * July 6: after the July-5 official settlement BOTH Bank Builder lanes lost and STOPPED (cycle 7). For
 * July-6 the model surfaces ONE disciplined card — Lane A (survival): Spain or Draw + Belgium or Draw,
 * two draw-protected double-chance legs from different SAME-DAY games (the settled 8-0 market family).
 * Lane B is a deliberate NO-PLAY: on a 2-game slate the only value-band legs are two BTTS selections the
 * model prices at ~market (no real edge) in the weakest settled market (BTTS 1-3) — we skip rather than
 * force a negative-to-fair "value" card.
 *
 * This restarts ONLY Lane A to a fresh $100 Step-1 cycle (prior cycle preserved in priorLane + the
 * ledger). Lane B is left STOPPED (its no-play is honest). Mirrors restart-both-lanes-0701.mjs.
 * NEVER touches canonical bankroll / crown / record — only the active-ladder structure. Dry-run by
 * default; --apply writes.
 *   cd app && npx tsx scripts/restart-lane-a-0706.mjs           # dry-run
 *   cd app && npx tsx scripts/restart-lane-a-0706.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LADDER = path.join(APP, "public", "data", "methodology", "launch", "dual-bank-builder-active.json");
const apply = process.argv.includes("--apply");
const nowIso = "2026-07-06T08:00:00Z"; // deterministic cycle-start stamp for the July-6 fresh cycle
const doc = JSON.parse(fs.readFileSync(LADDER, "utf8"));
const run = doc.run ?? doc;
const cur = run.laneA;
if (cur.laneStatus !== "stopped") {
  console.log(`  laneA is ${cur.laneStatus} (not stopped) — leaving as-is. No write.`);
  process.exit(0);
}
const prior = JSON.parse(JSON.stringify(cur));
const newCycle = (cur.cycle ?? 1) + 1;
run.laneA = {
  laneId: "A", label: `Lane A: lower-volatility survival lane (cycle ${newCycle})`,
  legs: [], steps: [{ step: 1, status: "active" }], laneStatus: "active", currentStep: 1,
  cycle: newCycle, cycleStartedAt: nowIso,
  note: `Restarted July-6 (operator-approved fresh cycle): fresh $100 Step-1 after the July-5 Step-1 loss (preserved in priorLane + the ledger). Settles against the July-6 official results.`,
  priorLane: prior,
};
console.log(`  laneA → restarted cycle ${newCycle}, fresh $100 Step 1 (prior cycle ${cur.cycle ?? 1} ${cur.laneStatus} preserved in priorLane)`);
console.log(`  laneB → left STOPPED (July-6 NO-PLAY: no disciplined value card on a 2-game slate)`);
console.log(`\n  1 lane restarted. Canonical bankroll/crown/record NOT touched (ladder structure only).`);
if (!apply) { console.log("DRY-RUN — no write."); process.exit(0); }
fs.writeFileSync(LADDER, JSON.stringify(doc, null, 2) + "\n");
console.log("APPLIED → Lane A restarted. Author bank-builder-approved.json (July-6, Lane A) → promote --apply next.");
