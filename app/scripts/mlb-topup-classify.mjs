/**
 * Per-event append-only coverage classification report (Program 108-111 Lane C).
 *
 * Read-only and free: reads the frozen base board, classifies every scheduled event, and prints
 * the minimal set of events that would justify a paid provider request. It never calls a
 * provider, never writes an artifact, and never touches the base board.
 *
 * This is the evidence layer the scheduled top-up runs before any coverage action, so the
 * decision is observable in the run log even on days when nothing is fetched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyEvents, EVENT_STATES } from "./mlb-topup-decision.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

let board = null;
try {
  board = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/boards", `${todayEt}.json`), "utf8"));
} catch {
  console.log(`[classify] ${todayEt}: NO_BOARD — generation owns this, not the top-up`);
  process.exit(0);
}

const r = classifyEvents({ board, nowIso: new Date().toISOString() });
const counts = r.events.reduce((m, e) => ((m[e.state] = (m[e.state] ?? 0) + 1), m), {});

console.log(`[classify] ${todayEt} · mode=${r.mode} · events=${r.events.length}`);
for (const e of r.events) {
  console.log(`  ${String(e.gamePk ?? "?").padEnd(7)} ${e.state.padEnd(38)} ${e.label} — ${e.detail}`);
}
console.log(`[classify] summary ${JSON.stringify(counts)}`);
console.log(`[classify] minimal paid-request set: ${r.fetchTargets.length ? r.fetchTargets.join(",") : "NONE"}`);
if (r.blocked) console.log(`::warning::[classify] blocked by ${r.blocked}`);

// Post-start official additions are impossible by construction; state it explicitly so the run
// log carries the invariant rather than only the code asserting it.
const started = r.events.filter((e) => e.state === EVENT_STATES.STARTED).length;
console.log(`[classify] events frozen (first pitch passed): ${started} — official additions for these are refused`);
