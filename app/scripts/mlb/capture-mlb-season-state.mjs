#!/usr/bin/env node
/**
 * SESSION 5 · D3 — capture whether MLB is in season for a date, from StatsAPI's own documents (free, keyless).
 *
 *   node app/scripts/mlb/capture-mlb-season-state.mjs --date 2026-10-02 [--write] [--now <ISO>]
 *
 * Fetches the season calendar and the schedule from <date> to the postseason end (+14 days), derives the state with
 * lib/mlb/season-state.mjs, and (with --write) writes app/public/data/mlb/season-state.json. No odds, no players.
 * Exit 0 on a written/printed state (UNKNOWN included — the reader fails closed on it); exit 2 on bad arguments;
 * exit 3 when StatsAPI cannot be read (nothing is written, so no stale "today" is ever claimed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveMlbSeasonState } from "../../src/lib/mlb/season-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "mlb", "season-state.json");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DATE = arg("--date");
const NOW = arg("--now", new Date().toISOString());
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? "") || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --date YYYY-MM-DD required (and --now must be an ISO time)"); process.exit(2); }

const BASE = "https://statsapi.mlb.com/api/v1";
const get = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};
const plusDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

let seasons, schedule;
const seasonsUrl = `${BASE}/seasons/${DATE.slice(0, 4)}?sportId=1`;
let scheduleUrl = null;
try {
  seasons = await get(seasonsUrl);
  const s = seasons?.seasons?.[0];
  const end = /^\d{4}-\d{2}-\d{2}$/.test(s?.postSeasonEndDate ?? "") ? plusDays(s.postSeasonEndDate, 14) : plusDays(DATE, 45);
  scheduleUrl = `${BASE}/schedule?sportId=1&startDate=${DATE}&endDate=${end < DATE ? DATE : end}&gameType=R,F,D,L,W`;
  schedule = await get(scheduleUrl);
} catch (e) {
  console.error(`::warning::MLB season state not captured for ${DATE}: ${e?.message ?? e} — nothing written`);
  process.exit(3);
}

const st = deriveMlbSeasonState({ seasons, schedule, date: DATE });
const doc = {
  schemaVersion: 1,
  artifact: "mlb-season-state",
  date: DATE,
  generatedAt: NOW, // the capture time; named generatedAt so a same-day re-capture is stamp-only (daily-products commit filter)
  ...st,
  sources: { seasons: seasonsUrl, schedule: scheduleUrl },
  note: "Derived from MLB StatsAPI's own calendar and schedule. OFF_SEASON means no game remains to be played (or the regular season has not started); UNKNOWN is never read as OFF_SEASON.",
};
console.log(`mlb-season-state ${DATE}: ${st.state} — ${st.reason}`);
if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
}
