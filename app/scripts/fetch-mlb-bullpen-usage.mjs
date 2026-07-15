#!/usr/bin/env node
/**
 * Build a LEAKAGE-CLEAN bullpen-fatigue rating for the validation window, from StatsAPI box scores.
 *
 * For each target game (07-04..07-09), each team's fatigue index uses ONLY that team's relief-pitcher workload in
 * its games during the prior 3 CALENDAR DAYS (strictly before the target date) — never the target game's box
 * score or final score. Relievers = pitchers with gamesStarted=0. Recent days weighted heavier.
 *
 * Reads: mlb/boards/<date>.json (target games: gamePk + team IDs) + StatsAPI schedule/boxscore (free).
 * Writes (INTERNAL): data/internal/mlb/reference/mlb-bullpen-usage-2026-07-04-2026-07-09.json (public:false).
 *
 * Usage: node app/scripts/fetch-mlb-bullpen-usage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");

const parseIP = (s) => { const [w, f] = String(s ?? "0").split("."); return Number(w) + (f === "1" ? 1 / 3 : f === "2" ? 2 / 3 : 0); };
const dayStr = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return dayStr(d); };

// Target games (07-04..07-09) with team IDs from boards.
const closing = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;
const targetDates = [...new Set(closing.map((g) => g.date))].sort();
const targets = [];
for (const date of targetDates) {
  const p = path.join(APP, "public/data/mlb/boards", `${date}.json`);
  if (!fs.existsSync(p)) continue;
  const pkSet = new Set(closing.filter((g) => g.date === date).map((g) => g.gamePk));
  for (const g of JSON.parse(fs.readFileSync(p, "utf8")).games || []) {
    if (pkSet.has(g.gamePk) && g.homeTeamId && g.awayTeamId) targets.push({ gamePk: g.gamePk, date, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, home: g.homeTeamName, away: g.awayTeamName });
  }
}

// Lookback window: 3 days before the earliest target date .. 1 day before the latest.
const lookbackDates = [];
for (let d = addDays(targetDates[0], -3); d <= addDays(targetDates[targetDates.length - 1], -1); d = addDays(d, 1)) lookbackDates.push(d);

// Per (teamId, date) relief workload from box scores of FINAL games only.
const usage = new Map(); // `${teamId}|${date}` -> { reliefPitches, reliefInnings, reliefApps }
async function ingestDate(date) {
  const sched = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`).then((r) => r.json()).catch(() => ({}));
  const games = (sched.dates?.[0]?.games || []).filter((g) => g.status?.abstractGameState === "Final");
  for (const g of games) {
    const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore`).then((r) => r.json()).catch(() => null);
    if (!box) continue;
    for (const side of ["away", "home"]) {
      const t = box.teams?.[side];
      const teamId = t?.team?.id;
      if (!teamId) continue;
      let pitches = 0, ip = 0, apps = 0;
      for (const id of t.pitchers || []) {
        const st = t.players?.[`ID${id}`]?.stats?.pitching;
        if (!st || Number(st.gamesStarted || 0) > 0) continue; // relievers only
        pitches += Number(st.pitchesThrown ?? st.numberOfPitches ?? 0);
        ip += parseIP(st.inningsPitched);
        apps += 1;
      }
      usage.set(`${teamId}|${date}`, { reliefPitches: pitches, reliefInnings: +ip.toFixed(1), reliefApps: apps });
    }
  }
}
console.log(`ingesting box scores for ${lookbackDates.length} lookback dates...`);
for (const d of lookbackDates) { await ingestDate(d); process.stdout.write(`  ${d}\r`); }

// Weighted prior-3-calendar-day relief innings (day-1 heaviest), + windowed pitch/inning sums + coverage.
function fatigueFor(teamId, targetDate) {
  let w = 0, daysWithData = 0;
  const win = { p1: 0, p2: 0, p3: 0, i1: 0, i2: 0, i3: 0, apps: 0 };
  for (let k = 1; k <= 3; k++) {
    const u = usage.get(`${teamId}|${addDays(targetDate, -k)}`);
    if (!u) continue;
    daysWithData++;
    w += (4 - k) * u.reliefInnings; // day-1 ×3, day-2 ×2, day-3 ×1
    win.apps += u.reliefApps;
    if (k <= 1) { win.p1 += u.reliefPitches; win.i1 += u.reliefInnings; }
    if (k <= 2) { win.p2 += u.reliefPitches; win.i2 += u.reliefInnings; }
    win.p3 += u.reliefPitches; win.i3 += u.reliefInnings;
  }
  const coverage = daysWithData >= 3 ? "full" : daysWithData >= 1 ? "partial" : "missing";
  return { weightedIndex: +w.toFixed(2), coverage, daysWithData, reliefPitches1d: win.p1, reliefPitches2d: win.p2, reliefPitches3d: win.p3, reliefInnings1d: +win.i1.toFixed(1), reliefInnings2d: +win.i2.toFixed(1), reliefInnings3d: +win.i3.toFixed(1), reliefAppearances: win.apps };
}

const rows = targets.map((t) => ({ gamePk: t.gamePk, date: t.date, home: t.home, away: t.away, homeBullpen: fatigueFor(t.homeTeamId, t.date), awayBullpen: fatigueFor(t.awayTeamId, t.date) }));
// Sample-mean weighted index (over teams with any data) → center the fatigue index so 0 = average.
const idxs = rows.flatMap((r) => [r.homeBullpen, r.awayBullpen]).filter((b) => b.coverage !== "missing").map((b) => b.weightedIndex);
const meanIdx = idxs.reduce((a, b) => a + b, 0) / (idxs.length || 1);
for (const r of rows) for (const b of [r.homeBullpen, r.awayBullpen]) b.fatigueIndex = b.coverage === "missing" ? null : +(b.weightedIndex - meanIdx).toFixed(2);

const covered = rows.filter((r) => r.homeBullpen.coverage !== "missing" && r.awayBullpen.coverage !== "missing").length;
fs.mkdirSync(path.join(REPO, "data/internal/mlb/reference"), { recursive: true });
fs.writeFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-bullpen-usage-2026-07-04-2026-07-09.json"), JSON.stringify({
  _source: "StatsAPI schedule + game/<pk>/boxscore (2026). Relievers = gamesStarted=0.",
  _leakageNote: "Fatigue index uses ONLY a team's relief workload in its games during the prior 3 CALENDAR DAYS strictly before the target date; never the target game's box/line/final score. fatigueIndex = (day-weighted relief innings) − sample mean; positive = more tired than average.",
  _internal: true, _public: false, _internalOnly: true, _officialMoneyRecordAffected: false,
  asOf: "2026-07-14", dateRange: "2026-07-04..2026-07-09", lookbackWindow: "prior 3 calendar days", sampleMeanWeightedIndex: +meanIdx.toFixed(2),
  coverage: `${covered}/${rows.length} games with both bullpens rated`, games: rows,
}, null, 2));
console.log(`\n✓ mlb-bullpen-usage — ${covered}/${rows.length} games both-rated · sample-mean weighted index ${meanIdx.toFixed(1)}`);
const ex = rows.find((r) => r.homeBullpen.fatigueIndex != null && r.awayBullpen.fatigueIndex != null);
if (ex) console.log(`  sample: ${ex.away} pen fatigueIndex ${ex.awayBullpen.fatigueIndex} (${ex.awayBullpen.reliefInnings3d} IP/3d) @ ${ex.home} ${ex.homeBullpen.fatigueIndex} (${ex.homeBullpen.reliefInnings3d} IP/3d)`);
