#!/usr/bin/env node
/**
 * EPL KICKOFF SOURCE — ESPN eng.1 scheduled events → public/data/soccer/epl/fixtures/espn-schedule-latest.json
 * (founder Option A, 2026-11-09). The openfootball fixture list carries a provisional "Saturday 15:00" block per round
 * and never received the real broadcast slots, so kickoffs come from ESPN's scheduled events instead
 * (lib/sports/epl/kickoff-truth.mjs confirms each fixture against this file; an unconfirmed fixture is withheld).
 *
 * Month-form requests only (`dates=YYYYMM`: the date-range form returns HTTP 400 since 2026-09-16), from the month of
 * --now - 14 days through --now + 60 days. Raw ESPN spellings and UTC instants; no club is resolved here.
 * A failed request writes NOTHING (exit 4): the previous capture stands and ages out after
 * SCHEDULE_MAX_AGE_HOURS, at which point every fixture reads "kickoff not confirmed" — never a provisional time.
 *
 *   node scripts/epl/capture-epl-espn-schedule.mjs --now <ISO> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESPN_SCHEDULE_FILE, ESPN_SCHEDULE_SCHEMA, espnScheduleRows, scheduleMonths } from "../../src/lib/sports/epl/kickoff-truth.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "soccer", "epl", "fixtures", ESPN_SCHEDULE_FILE);
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";
const EXIT_SOURCE_STALE = 4;

const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : undefined; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const requests = [];
const byId = new Map();
try {
  for (const month of scheduleMonths(NOW)) {
    const res = await fetch(`${SCOREBOARD}?dates=${month}&limit=1000`, { headers: { accept: "application/json" } });
    const body = await res.text();
    if (!res.ok) throw new Error(`dates=${month} → HTTP ${res.status} ${body.slice(0, 60)}`);
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.events)) throw new Error(`dates=${month} → no events array`);
    for (const r of espnScheduleRows(parsed.events)) byId.set(r.providerEventId, r);
    requests.push({ month, events: parsed.events.length });
  }
} catch (err) {
  console.log(`SOURCE_STALE: eng.1 scoreboard unavailable (${String(err?.message ?? err).slice(0, 120)}) — previous schedule stands and ages out; nothing written`);
  process.exit(EXIT_SOURCE_STALE);
}
const rows = [...byId.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.providerEventId.localeCompare(b.providerEventId));
const doc = {
  schema: ESPN_SCHEDULE_SCHEMA, competition: "epl", capturedAt: NOW,
  source: { id: "espn_scoreboard", name: "ESPN eng.1 public scoreboard", license: "public JSON endpoint, no key; point-in-time snapshot with attribution", requests },
  rows,
};
if (process.argv.includes("--dry-run")) { console.log(`DRY RUN: ${rows.length} ESPN events (${requests.map((r) => r.month).join(", ")}); nothing written`); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`wrote ${path.relative(APP, OUT)}: ${rows.length} ESPN events (${requests.map((r) => r.month).join(", ")})`);
