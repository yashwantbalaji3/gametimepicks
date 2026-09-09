#!/usr/bin/env node
/** Freeze and replay-verify the current Week-1 private shadow cohort before any kickoff. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { simulateJointMatchup } from "../../src/lib/sports/nfl/joint-matchup-v2.mjs";
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = path.resolve(APP, "..");
const dir = path.join(ROOT, "data/internal/research/nfl/joint-v2-forward");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const forecasts = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"))).forecasts;
const expected = forecasts.filter(f => f.week === 1 && f.seasonType === 2 && new Date(f.kickoffUtc).getUTCFullYear() === 2026);
if (expected.length !== 16 || new Set(expected.map(f => f.providerEventId)).size !== 16) throw new Error("requires the complete known 2026 Week-1 cohort");
const output = path.join(dir, "2026-week1-registration.json");
if (fs.existsSync(output)) throw new Error("registration already frozen; inspect it, do not overwrite");
const entries = fs.readdirSync(dir).filter(n => n.endsWith(".json")).map(name => {
  const raw = fs.readFileSync(path.join(dir, name)); return { name, sha256: hash(raw), data: JSON.parse(raw) };
}).filter(e => e.data.artifact === "nfl-joint-v2-forward-shadow");
const cohort = [];
for (const fc of expected) {
  if (!(Date.now() < Date.parse(fc.kickoffUtc))) throw new Error("registration must precede every cohort kickoff");
  const candidates = entries.filter(e => e.data.simulation.providerEventId === fc.providerEventId && Date.parse(e.data.generatedAt) < Date.parse(fc.kickoffUtc)).sort((a, b) => Date.parse(b.data.generatedAt) - Date.parse(a.data.generatedAt));
  if (!candidates.length) throw new Error(`missing pre-event capture ${fc.providerEventId}`);
  const e = candidates[0], input = e.data.inputs;
  if (hash(JSON.stringify(input)) !== e.data.inputHash) throw new Error(`input hash mismatch ${e.name}`);
  const replay = simulateJointMatchup({ ...input, strengthState: { ratingFor: team => input.ratings[team] } });
  if (JSON.stringify(replay) !== JSON.stringify(e.data.simulation)) throw new Error(`non-reproducible capture ${e.name}`);
  cohort.push({ providerEventId: fc.providerEventId, kickoffUtc: fc.kickoffUtc, capture: e.name, sha256: e.sha256, inputHash: e.data.inputHash, generatedAt: e.data.generatedAt, replay: "EXACT", runs: replay.runs });
}
const sourceFiles = ["src/lib/sports/nfl/joint-game-sim-v2.mjs", "src/lib/sports/nfl/joint-matchup-v2.mjs", "src/lib/sports/nfl/joint-roster-reconciliation.mjs", "src/lib/sports/nfl/depth-chart-snapshots.mjs", "scripts/nfl/capture-joint-v2-forward.mjs"];
const receipt = { artifact: "nfl-joint-v2-forward-registration", dataClass: "PRIVATE_RESEARCH", registeredAt: new Date().toISOString(),
  period: { season: 2026, seasonType: 2, week: 1 }, engine: "nfl-joint-sim-v2", conditioner: "nfl-joint-depth-v1", status: "FROZEN_AWAITING_RESULTS",
  rules: { cohort: "all 16 Week-1 games; no removing adverse outcomes", revisionPolicy: "these exact captures are the study record; newer runs cannot replace them", settlement: "official finals and player stats only; missing/ambiguous outcomes remain explicit; original family participation rules retained", metrics: "same MAE, pinball, coverage, calibration and baseline comparisons as development; report all families and denominators", promotion: "NONE; one week is a diagnostic cohort, not proof of public readiness" },
  sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(APP, file)))])), cohort };
if (Date.now() >= Math.min(...expected.map(f => Date.parse(f.kickoffUtc)))) throw new Error("kickoff passed during verification");
fs.writeFileSync(output, JSON.stringify(receipt, null, 1), { flag: "wx" });
console.log(JSON.stringify({ output, captures: cohort.length, replay: "16/16 EXACT", firstKickoffUtc: expected.map(f => f.kickoffUtc).sort()[0] }, null, 2));
