#!/usr/bin/env node
/**
 * Session 5 · Phase B — classify today's MLB input for daily-products (lib/daily-portfolio/mlb-input-verdict.mjs).
 *
 *   npx tsx app/scripts/products/classify-mlb-input.mjs --date 2026-09-28 --now <ISO>
 *
 * Exit 0 with verdict READY / NO_EVENTS / OFF_SEASON / INPUT_UNAVAILABLE written to GITHUB_OUTPUT (`verdict`, `reason`).
 * A handled MLB refusal is NOT a job failure — the workflow gates the MLB money steps on the verdict and
 * reports it at the end. Exit 2 only if this script itself cannot run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkTeamMarketPool } from "../../src/lib/daily-portfolio/pool-gate.mjs";
import { classifyMlbInput } from "../../src/lib/daily-portfolio/mlb-input-verdict.mjs";
import { seasonStateFor } from "../../src/lib/mlb/season-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const date = arg("--date", null);
const nowIso = arg("--now", null);
const root = arg("--root", path.join(APP, "public", "data"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(Date.parse(nowIso ?? ""))) {
  console.error("REFUSED: --date YYYY-MM-DD and --now <ISO> are required");
  process.exit(2);
}
let schedule = null;
try { schedule = JSON.parse(fs.readFileSync(path.join(root, "mlb", "statsapi-schedule", `${date}.json`), "utf8")); } catch { schedule = null; }
let seasonDoc = null;
try { seasonDoc = JSON.parse(fs.readFileSync(path.join(root, "mlb", "season-state.json"), "utf8")); } catch { seasonDoc = null; }
const season = { ...seasonStateFor(seasonDoc, date, nowIso), gamesToday: seasonDoc?.date === date ? seasonDoc.gamesToday ?? null : null };
const gate = checkTeamMarketPool({ root, date, nowIso });
const r = classifyMlbInput({ gate, schedule, date, nowIso, season });
console.log(`mlb-season ${date}: ${season.state} — ${season.reason}`);
console.log(`mlb-input ${date}: ${r.verdict} (gate ${r.gate}) — ${r.reason}`);
if (r.verdict === "INPUT_UNAVAILABLE") console.log(`::warning::MLB money products will not be generated for ${date} — ${r.reason}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${r.verdict}\ngate=${r.gate}\nreason=${r.reason.replace(/\n/g, " ")}\n`);
}
