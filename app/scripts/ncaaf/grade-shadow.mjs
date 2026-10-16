/**
 * NCAAF-006 · grade forward SHADOW receipts against official provider finals. PRIVATE_RESEARCH.
 *
 * For every event with receipts in forecasts/<season>/, take one fresh bounded ESPN snapshot of the weeks
 * involved (raw → .cache/), pick the FORECAST OF RECORD (last receipt captured before kickoff, using the
 * provider's current kickoff too), grade it (grade.mjs) and append to the event's append-only log:
 *   data/internal/research/ncaaf/grades/<season>/<eventId>.jsonl
 * Re-running with no new official information changes nothing (NOOP). Never edits a receipt.
 *
 * Run (from app/): node scripts/ncaaf/grade-shadow.mjs --season 2026
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESPN_CFB_GROUPS, mergeEventRows, normalizeScoreboardEvent } from "../../src/lib/sports/ncaaf/espn-events.mjs";
import { forecastOfRecord } from "../../src/lib/sports/ncaaf/forward.mjs";
import { appendGrade, gradeEvent } from "../../src/lib/sports/ncaaf/grade.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RES = path.join(path.resolve(APP, ".."), "data", "internal", "research", "ncaaf");
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const SEASON = Number(arg("--season"));
if (!Number.isInteger(SEASON)) { console.error("REFUSED: --season YYYY"); process.exit(1); }
const FDIR = path.join(RES, "forecasts", String(SEASON));
if (!fs.existsSync(FDIR)) { console.error(`REFUSED: no receipts for ${SEASON}`); process.exit(1); }
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// Receipts grouped by event.
const receipts = new Map();
for (const slate of fs.readdirSync(FDIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  for (const eventId of fs.readdirSync(path.join(FDIR, slate))) {
    const dir = path.join(FDIR, slate, eventId);
    receipts.set(eventId, fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"))));
  }
}
const weeks = [...new Set([...receipts.values()].flat().map((r) => r.event.week))].sort((a, b) => a - b);

// One fresh snapshot of those weeks (cap 2 × weeks requests).
const gradedAt = new Date().toISOString();
const RAW = path.join(RES, ".cache", "raw", "espn", "grading", gradedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"));
fs.mkdirSync(RAW, { recursive: true });
const rows = [], hashes = [];
for (const wk of weeks) {
  for (const grp of [ESPN_CFB_GROUPS.FBS, ESPN_CFB_GROUPS.FCS]) {
    await new Promise((r) => setTimeout(r, 300));
    const res = await fetch(`${SITE}/scoreboard?dates=${SEASON}&seasontype=2&week=${wk}&groups=${grp}&limit=500`);
    if (!res.ok) { console.error(`REFUSED: HTTP ${res.status} — no partial grading`); process.exit(1); }
    const text = await res.text();
    fs.writeFileSync(path.join(RAW, `2-${wk}-${grp}.json`), text);
    hashes.push(sha256(text));
    for (const e of JSON.parse(text).events ?? []) { const n = normalizeScoreboardEvent(e, { capturedAt: gradedAt, sourceGroup: grp }); if (n.row) rows.push(n.row); }
  }
}
const { events, conflicts } = mergeEventRows(rows);
const byId = new Map(events.map((e) => [e.providerEventId, e]));
const conflicted = new Set(conflicts);

const GDIR = path.join(RES, "grades", String(SEASON));
fs.mkdirSync(GDIR, { recursive: true });
const tally = { APPEND: 0, CORRECTION: 0, NOOP: 0, NO_FORECAST_OF_RECORD: 0, PROVIDER_CONFLICT: 0 };
const states = {};
for (const [eventId, rs] of [...receipts].sort()) {
  if (conflicted.has(eventId)) { tally.PROVIDER_CONFLICT++; continue; }
  const result = byId.get(eventId) ?? null;
  const record = forecastOfRecord(rs, result?.startUtc ?? null);
  if (!record) { tally.NO_FORECAST_OF_RECORD++; continue; }
  const grade = gradeEvent({ receipt: record, result, gradedAt, sourceCapturedAt: gradedAt });
  const file = path.join(GDIR, `${eventId}.jsonl`);
  const log = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const { log: next, action } = appendGrade(log, grade);
  tally[action]++;
  states[grade.settlement.state] = (states[grade.settlement.state] ?? 0) + 1;
  if (action !== "NOOP") fs.writeFileSync(file, next.map((g) => JSON.stringify(g)).join("\n") + "\n");
}
console.log(`graded ${receipts.size} events at ${gradedAt} · ${JSON.stringify(tally)} · states ${JSON.stringify(states)} · snapshot ${sha256(hashes.join("|")).slice(0, 12)}`);
