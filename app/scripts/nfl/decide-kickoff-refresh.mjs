#!/usr/bin/env node
/**
 * Decide whether an NFL pregame price refresh is owed RIGHT NOW. Reads committed artifacts and the
 * in-flight run state; spends nothing and dispatches nothing. The workflow acts on the decision.
 *
 * Emits GITHUB_OUTPUT keys `decision`, `state`, `reason` when running in Actions, and prints a line
 * either way. Exit 0 always: "no refresh owed" is an answer, not a failure.
 *
 * Usage: node scripts/nfl/decide-kickoff-refresh.mjs --now <iso> [--run-in-flight true|false] [--json <path>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideKickoffRefresh } from "../../src/lib/ops/kickoff-refresh.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const read = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(APP, rel), "utf8")); } catch { return null; } };

const nowIso = arg("now");
if (!nowIso) { console.error("REFUSED: --now is required — a spend decision is never made on an implicit clock"); process.exit(2); }

const schedule = read("public/data/nfl/schedule/latest.json");
if (!schedule?.rows) { console.error("REFUSED: canonical NFL schedule unreadable — kickoff proximity is never guessed"); process.exit(2); }
const capture = read("public/data/nfl/markets/latest.json");

const decision = decideKickoffRefresh({
  scheduleRows: schedule.rows,
  capture,
  nowIso,
  runInFlight: String(arg("run-in-flight", "false")).toLowerCase() === "true",
});

const line = `kickoff-refresh: ${decision.decision} · ${decision.state} · ${decision.reason}`;
console.log(line);
for (const e of decision.events.slice(0, 6)) console.log(`  T-${String(e.minutesToKickoff).padStart(3)}m  ${e.matchup ?? e.providerEventId}`);

const jsonPath = arg("json");
if (jsonPath) fs.writeFileSync(path.join(APP, "..", jsonPath), `${JSON.stringify({ nowIso, ...decision }, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `decision=${decision.decision}\nstate=${decision.state}\nreason=${decision.reason.replace(/\n/g, " ")}\n`);
}
