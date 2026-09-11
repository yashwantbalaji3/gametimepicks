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
import { lastPreKickoffForecasts, gradeMatch, mergeGraded, summarize } from "../../src/lib/sports/soccer/grading.mjs";

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
  const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  const ks = due.map(({ row }) => Date.parse(row.kickoffUtc));
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${L.espn}/scoreboard?dates=${ymd(Math.min(...ks) - 86_400_000)}-${ymd(Math.max(...ks) + 86_400_000)}&limit=400`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`REFUSED: ESPN scoreboard HTTP ${res.status} — nothing graded`); process.exit(3); }
  const finals = new Map();
  for (const e of (await res.json()).events ?? []) {
    if (!e.status?.type?.completed) continue;
    const c = e.competitions?.[0]?.competitors ?? [];
    const h = c.find((x) => x.homeAway === "home"), a = c.find((x) => x.homeAway === "away");
    const hs = Number.parseInt(h?.score, 10), as = Number.parseInt(a?.score, 10);
    if (Number.isInteger(hs) && Number.isInteger(as)) finals.set(String(e.id), { home: hs, away: as });
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
