/**
 * CHECK HEARTBEAT — the dead-man's-switch reader (audit P0-2 / monitoring gap).
 *
 * Reads app/public/data/ops/heartbeat.json and FAILS (exit 1) if the last run is older than the
 * tolerance or the last run was not OK. A separate lightweight cron / uptime monitor / the operator
 * runs this to detect "the autonomous lifecycle silently stopped" — the one failure mode the rest of
 * the system cannot self-report (a dead cron writes nothing, so only an external check catches it).
 *
 *   node app/scripts/check-heartbeat.mjs --max-hours 26 [--now ISO]
 *
 * Exit 0 = healthy + recent. Exit 1 = stale or last-run-failed. Cwd-agnostic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const maxHours = Number(arg("--max-hours", "26"));   // a daily lifecycle should run < 26h apart
let now = arg("--now", "");
try { if (!now) now = new Date().toISOString(); } catch { now = null; }

let hb;
try { hb = JSON.parse(fs.readFileSync(path.join(DATA, "ops", "heartbeat.json"), "utf8")); }
catch { console.error("🔴 HEARTBEAT MISSING — no run has ever recorded a heartbeat (lifecycle never completed)."); process.exit(1); }

const ageHours = now ? (Date.parse(now) - Date.parse(hb.lastRunAt)) / 3_600_000 : 0;
const problems = [];
if (now && ageHours > maxHours) problems.push(`stale: last run ${ageHours.toFixed(1)}h ago (> ${maxHours}h) — the cron may have stopped`);
if (hb.ok === false) problems.push(`last run status=${hb.status}${hb.message ? ` (${hb.message})` : ""}`);

console.log(`heartbeat: lastRunAt ${hb.lastRunAt} · status ${hb.status} · ${hb.phase} ${hb.date || ""} · bankroll $${hb.money?.bankroll}`);
if (problems.length) { console.error(`🔴 HEARTBEAT UNHEALTHY:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`✅ heartbeat healthy (${ageHours.toFixed(1)}h old, last run OK).`);
process.exit(0);
