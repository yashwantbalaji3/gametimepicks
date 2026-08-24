#!/usr/bin/env node
/**
 * FOUNDER DECISION DRY-RUN — explain exactly which gates a supplied answer would move
 * (Program 199 · Release D). READ-ONLY: this script changes nothing, ever. Applying a decision
 * is a separate, explicit, reviewed commit; this exists so the founder can see the consequence
 * BEFORE answering and engineering can validate a token before acting on it.
 *
 *   npx tsx scripts/ops/founder-decision-dryrun.mjs --decision <id> --token <answer>
 *   npx tsx scripts/ops/founder-decision-dryrun.mjs --list
 */
import { FOUNDER_DECISIONS, reconcileDecisionsWithQueue } from "../../src/lib/launch/founder-decisions.mjs";
import { buildClosurePackets, executionQueue } from "../../src/lib/launch/closure-packets.mjs";
import { SPORT_ASSESSMENTS } from "../../src/lib/sports/sport-assessments.mjs";
import { readCurrentEvents, readProductReceipt, readRouteInventory, readEplCalibrationAuthority, readLadderReceipts } from "../../src/lib/launch/closure-packet-sources.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null; };

const NOW = new Date().toISOString(); // read-only report; not an artifact stamp
const packets = buildClosurePackets({
  assessments: SPORT_ASSESSMENTS, tickets: [], watches: [], founderGates: [],
  currentEvents: readCurrentEvents({ appDir: APP, nowIso: NOW }),
  productReceipt: readProductReceipt({ appDir: APP }),
  routeInventory: readRouteInventory({ appDir: APP }),
  calibrationAuthorities: { epl: readEplCalibrationAuthority({ appDir: APP }) },
  ladderReceipts: readLadderReceipts({ appDir: APP }),
  nowIso: NOW,
});
const queue = executionQueue(packets);

const problems = reconcileDecisionsWithQueue(queue.founderQueue);
if (problems.length) {
  console.error("DECISION/QUEUE DRIFT:"); for (const p of problems) console.error(`  ${p}`);
  process.exit(2);
}

if (process.argv.includes("--list")) {
  console.log(`${FOUNDER_DECISIONS.length} decisions, dependency-ordered, one-to-one with the founder queue:\n`);
  for (const d of FOUNDER_DECISIONS) {
    console.log(`  ${d.id}`);
    console.log(`    ${d.question}`);
    console.log(`    tokens: ${d.answerTokens.join(" | ")} · ${d.expectedTime}`);
  }
  process.exit(0);
}

const id = arg("--decision");
const token = arg("--token");
const d = FOUNDER_DECISIONS.find((x) => x.id === id);
if (!d) { console.error(`REFUSED: unknown decision '${id}' — run with --list`); process.exit(1); }
if (!token) { console.error("REFUSED: --token required (one of: " + d.answerTokens.join(" | ") + ")"); process.exit(1); }

const shape = d.answerTokens.some((t) => {
  const fixed = t.split(":")[0];
  return token === t || (t.includes("<") && token.startsWith(fixed + ":") && token.length > fixed.length + 1);
});
console.log(`\n${d.title}`);
console.log(`  token: ${token} — ${shape ? "VALID SHAPE" : "INVALID: expected one of " + d.answerTokens.join(" | ")}`);
if (!shape) process.exit(1);

console.log(`  answers queue item: [${d.queueItem}] (currently ${queue.founderQueue.some((q) => `${q.sport}:${q.stage}` === d.queueItem) ? "OPEN in the founder queue" : "not open — verify before applying"})`);
console.log(`  consequence: ${d.consequence}`);
console.log(`  engineering already complete: ${d.engineeringComplete}`);
console.log(`  never-share rule: ${d.neverShare}`);
console.log(`\nDRY RUN ONLY — nothing changed. Applying is a reviewed commit that cites this decision id and token, followed by the full gate.`);
