#!/usr/bin/env node
/**
 * Grade an accepted league's published forecasts against official final scores (P257). $0.
 *
 *   node scripts/soccer/grade-league-forecasts.mjs --league ligue-1 --now <ISO>
 *
 * Reads the dated forecast archives (public/data/soccer/<league>/forecasts/YYYY-MM-DD.json), takes each
 * match's LAST pre-kickoff forecast, fetches ESPN's final score once the match is at least two hours past
 * kickoff, and writes public/data/soccer/<league>/results/graded.json — append-only: a graded match is
 * never restated (lib/sports/soccer/grading.mjs throws on a disagreeing re-grade).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { league as leagueOf } from "../../src/lib/sports/soccer/leagues.mjs";
import { lastPreKickoffForecasts, gradeMatch, mergeGraded, summarize, regulationFinal } from "../../src/lib/sports/soccer/grading.mjs";
import { fetchScoreboardWindowEvents, isProviderRefusal, utcDayStart, utcDayEnd } from "../../src/lib/sports/espn-scoreboard-window.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const KEY = arg("--league"); const NOW = arg("--now");
if (!KEY || !Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --league <key> --now <ISO>"); process.exit(2); }
const L = leagueOf(KEY);
const dir = path.join(APP, "public/data/soccer", L.key);
const archives = (fs.existsSync(path.join(dir, "forecasts")) ? fs.readdirSync(path.join(dir, "forecasts")) : [])
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, "forecasts", f), "utf8")));
const forecasts = lastPreKickoffForecasts(archives);
const outFile = path.join(dir, "results", "graded.json");
const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;
const graded = new Set((prev?.matches ?? []).map((m) => m.eventId));
const due = [...forecasts.values()].filter(({ row }) => !graded.has(row.eventId) && Date.parse(row.kickoffUtc) + 2 * 3.6e6 < Date.parse(NOW));

const fresh = [];
if (due.length) {
  const ks = due.map(({ row }) => Date.parse(row.kickoffUtc));
  // v1.8 B4: month-window transport via the one shared owner (the range form answered 400 from 2026-09-20
  // and this exit 3 stopped the whole soccer-leagues job before the forecasts step). Day bounds kept.
  let events;
  try { ({ events } = await fetchScoreboardWindowEvents(`soccer/${L.espn}`, utcDayStart(Math.min(...ks) - 86_400_000), utcDayEnd(Math.max(...ks) + 86_400_000))); }
  catch (err) { console.error(`REFUSED: ESPN scoreboard ${err.message} — nothing graded`); process.exit(3); }
  // Soccer V2 · C-4: one rule for "which score may a 90-minute forecast be graded on" (grading.mjs).
  const finals = new Map();
  for (const e of events) {
    const f = regulationFinal(e);
    if (f?.final) finals.set(String(e.id), f.final);
    else if (f?.refused) console.warn(`[grade] ${L.name}: ${e.id} not graded — ${f.reason}`);
  }
  for (const f of due) { const fin = finals.get(String(f.row.providerEventId)); if (fin) fresh.push(gradeMatch(f, fin)); }
}
const { matches, added } = mergeGraded(prev?.matches ?? [], fresh);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  schemaVersion: 1, artifact: "soccer-league-graded", dataClass: "PUBLIC", public: true,
  league: L.key, competition: L.name, generatedAt: NOW,
  rule: "each match graded once, against the last forecast published before kickoff, from the official final score",
  summary: summarize(matches), matches,
}, null, 1) + "\n");
console.log(`[grade] ${L.name}: ${added} newly graded · ${matches.length} total · ${due.length - fresh.length} due but not final yet`);
