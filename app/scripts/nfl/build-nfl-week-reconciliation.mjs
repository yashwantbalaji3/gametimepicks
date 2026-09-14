#!/usr/bin/env node
/**
 * NFL WEEK RECONCILIATION (P296) — every published Week-N prediction, graded against the official box score.
 *
 * The founder asked for a thorough, public reconciliation of the week: each team and player prediction,
 * hit or miss, with a success rate per prop and overall, on the results tab. This builds it from what was
 * actually published BEFORE each kickoff and nothing else:
 *
 *   team      the latest immutable forecast receipt generated before kickoff (the forecast of record —
 *             the same rule the experimental settler and the pregame audit use)
 *   players   the game's player board, refused unless it was generated before kickoff
 *   results   the official ESPN box score, captured once the game is FINAL and kept as a dated receipt
 *             (data/internal/nfl/official-stats/<eventId>.json) so a grade can always be re-derived
 *
 * The grading rules live in lib/sports/nfl/week-reconciliation.mjs and are published with the artifact
 * in plain English. A game that is not final is PENDING and stays listed; a player with no line in the
 * official box score is VOID and counted separately — never silently dropped, never a miss.
 *
 * Re-runnable and quiet: an unchanged week is not rewritten, so a scheduled run with no new finals
 * commits nothing (and triggers no deploy).
 *
 * Usage: node scripts/nfl/build-nfl-week-reconciliation.mjs --now <iso> [--week 2-01] [--espn-dir <dir of summary JSON>]
 * Writes: app/public/data/nfl/reconciliation/<week>.json + index.json   (PUBLIC_DERIVED)
 *         data/internal/nfl/official-stats/<eventId>.json                (official lines used, once FINAL)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { officialFromEspnSummary, gradeGame, summariseWeek, RECONCILIATION_RULES } from "../../src/lib/sports/nfl/week-reconciliation.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const nowMs = Date.parse(NOW);
const ESPN_DIR = arg("--espn-dir");
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ── the forecasts of record: latest receipt generated strictly before kickoff, per event ──────────
const receiptsRoot = path.join(ROOT, "data/internal/nfl/forecast-receipts");
const receipts = new Map();
for (const day of fs.existsSync(receiptsRoot) ? fs.readdirSync(receiptsRoot).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []) {
  for (const file of fs.readdirSync(path.join(receiptsRoot, day)).filter((x) => x.endsWith(".json"))) {
    const r = read(path.join(receiptsRoot, day, file));
    if (!r?.providerEventId || !r.kickoffUtc || !r.generatedAt || !r.forecastSummary || r.seasonType == null || r.week == null) continue;
    if (!(Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc))) continue;
    const id = String(r.providerEventId);
    if (!receipts.has(id) || r.generatedAt > receipts.get(id).generatedAt) receipts.set(id, r);
  }
}

const weekKey = (seasonType, week) => `${seasonType}-${String(week).padStart(2, "0")}`;
/* Default week: the most recent period with at least one kickoff before --now. */
const WEEK = arg("--week") ?? (() => {
  const started = [...receipts.values()].filter((r) => Date.parse(r.kickoffUtc) <= nowMs)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const last = started.at(-1);
  return last ? weekKey(last.seasonType, last.week) : null;
})();
if (!WEEK) { console.log("no NFL game has kicked off yet — nothing to reconcile"); process.exit(0); }
const [SEASON_TYPE, WEEK_NO] = WEEK.split("-").map(Number);
const forecasts = [...receipts.values()]
  .filter((r) => r.seasonType === SEASON_TYPE && r.week === WEEK_NO)
  .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
if (!forecasts.length) { console.log(`no pre-kickoff forecasts on file for ${WEEK}`); process.exit(0); }

// ── official lines: a FINAL receipt is reused; otherwise capture it (never before kickoff) ──────────
const statsDir = path.join(ROOT, "data/internal/nfl/official-stats");
async function officialFor(eventId, kickoffUtc) {
  const kept = read(path.join(statsDir, `${eventId}.json`));
  if (kept?.state === "FINAL") return kept;
  if (Date.parse(kickoffUtc) > nowMs) return { state: "PENDING", status: "NOT_STARTED" };
  let summary = null;
  try {
    if (ESPN_DIR) summary = read(path.join(ESPN_DIR, `${eventId}.json`));
    else {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) summary = await res.json();
    }
  } catch (err) {
    console.log(`::warning::official box score for ${eventId} unavailable (${err?.message ?? err}) — the game stays PENDING`);
  }
  const official = officialFromEspnSummary(summary);
  if (official.state === "FINAL") {
    fs.mkdirSync(statsDir, { recursive: true });
    fs.writeFileSync(path.join(statsDir, `${eventId}.json`), JSON.stringify({ ...official, capturedAt: NOW, source: "ESPN official box score (site.api.espn.com summary)" }, null, 1));
  }
  return official;
}

const games = [];
for (const f of forecasts) {
  const id = String(f.providerEventId);
  const board = read(path.join(APP, "public/data/nfl/player-board", `${id}.json`));
  /* A board regenerated at or after kickoff is not what readers saw before the game — it is not graded. */
  const boardOfRecord = board && board.generatedAt && Date.parse(board.generatedAt) < Date.parse(f.kickoffUtc) ? board : null;
  const official = await officialFor(id, f.kickoffUtc);
  games.push(gradeGame({ forecast: f, board: boardOfRecord, boardRefused: board && !boardOfRecord ? "the player board on file was generated at or after kickoff" : null, official }));
}

const body = {
  schemaVersion: 1,
  artifact: "nfl-week-reconciliation",
  dataClass: "PUBLIC_DERIVED",
  period: { key: WEEK, seasonType: SEASON_TYPE, week: WEEK_NO, label: SEASON_TYPE === 2 ? `Week ${WEEK_NO}` : SEASON_TYPE === 3 ? `Postseason round ${WEEK_NO}` : `Preseason week ${WEEK_NO}` },
  source: "Official final box scores (ESPN). Predictions exactly as published before each kickoff.",
  howGraded: RECONCILIATION_RULES,
  summary: summariseWeek(games),
  games,
  disclaimer: "Educational and paper-only — not betting advice. A range is not a bet: these are checks of how often what we published matched what happened.",
};
const outDir = path.join(APP, "public/data/nfl/reconciliation");
const outPath = path.join(outDir, `${WEEK}.json`);
const previous = read(outPath);
const strip = (x) => { if (!x) return null; const c = { ...x }; delete c.generatedAt; return JSON.stringify(c); };
const payload = JSON.stringify({ ...body, generatedAt: NOW }, null, 1);
for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey"]) {
  if (payload.includes(banned)) { console.error(`REFUSED: the public reconciliation would carry "${banned}"`); process.exit(3); }
}
const s = body.summary;
if (strip(previous) === strip({ ...body, generatedAt: NOW })) {
  console.log(`${WEEK}: unchanged (${s.gamesFinal} final, ${s.gamesPending} pending) — not rewritten`);
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, payload);

const index = read(path.join(outDir, "index.json")) ?? { schemaVersion: 1, artifact: "nfl-week-reconciliation-index", dataClass: "PUBLIC_DERIVED", weeks: [] };
const entry = { key: WEEK, label: body.period.label, generatedAt: NOW, gamesFinal: s.gamesFinal, gamesPending: s.gamesPending, overall: s.overall };
index.weeks = [...index.weeks.filter((w) => w.key !== WEEK), entry].sort((a, b) => a.key.localeCompare(b.key));
index.generatedAt = NOW;
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 1));

console.log(`${WEEK}: ${s.gamesFinal} final, ${s.gamesPending} pending · overall ${s.overall.hits}/${s.overall.checks} (${s.overall.rate == null ? "—" : (s.overall.rate * 100).toFixed(1) + "%"})`);
for (const p of s.props) console.log(`  ${p.label.padEnd(52)} ${String(p.hits).padStart(4)}/${String(p.checks).padEnd(4)} ${p.rate == null ? "  —" : (p.rate * 100).toFixed(1) + "%"}${p.voids ? ` · ${p.voids} void` : ""}`);
