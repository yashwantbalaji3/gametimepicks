#!/usr/bin/env node
/**
 * MLB-003 / MLB-004 · OUTCOME capture: official per-player box-score lines for FINAL games (research data).
 *
 *   node scripts/mlb/capture-mlb-boxscore-outcomes.mjs --from 2026-03-25 --to 2026-10-08 [--write]
 *   node scripts/mlb/capture-mlb-boxscore-outcomes.mjs --season 2025 [--limit-dates N] [--write]   (historical seasons)
 *
 * SEASON MODE (founder decision 2, 2026-10-10: bounded 2024–2025 capture). One schedule request for the season; each
 * FINAL game is captured ONCE, on the last date the schedule lists it as Final (a postponed or suspended game appears on
 * several dates; it is kept where it was completed). Postponed and cancelled entries are never fetched. Output:
 * data/internal/mlb/boxscore-outcomes-history/<season>/<date>.json — separate from the current season, never a public
 * asset. Resumable: an existing date file is skipped; a game id already captured in any file of the season is skipped.
 *
 * Source: MLB StatsAPI (free, no key) — /schedule for the day's FINAL games, then /game/{pk}/boxscore with a `fields`
 * filter (~40 KB per game). Polite: one request at a time, a pause between requests, retries with back-off.
 *
 * ⚠ OUTCOMES ONLY. These are results recorded AFTER the game. They may be used as evaluation targets and as inputs only
 * for LATER games (e.g. a pitcher's previous starts), never for the game they describe. The files say so
 * (`dataClass: POSTGAME_OUTCOMES`), and they live apart from the pregame feature archive.
 *
 * Output: data/internal/mlb/boxscore-outcomes/<YYYY-MM-DD>.json — internal, not a Vercel build input. A date file is
 * written once; a re-run refuses to overwrite a different file (append-only by date). Missing values stay missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.join(ROOT, "data/internal/mlb/boxscore-outcomes");
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const SEASON = arg("--season");
const LIMIT_DATES = arg("--limit-dates") != null ? Number(arg("--limit-dates")) : Infinity;
const FROM = arg("--from") ?? (SEASON ? `${SEASON}-01-01` : null);
const TO = arg("--to") ?? (SEASON ? `${SEASON}-12-31` : null);
const WRITE = process.argv.includes("--write");
const PAUSE_MS = Number(arg("--pause-ms") ?? 200);
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(TO ?? "")) { console.error("REFUSED: --from and --to YYYY-MM-DD required"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "gametimepicks-research (outcome capture)" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}
const FIELDS = "teams,away,home,team,abbreviation,players,person,id,fullName,battingOrder,position,abbreviation,stats,batting,pitching,plateAppearances,atBats,hits,doubles,triples,homeRuns,runs,rbi,baseOnBalls,intentionalWalks,strikeOuts,hitByPitch,totalBases,stolenBases,outs,inningsPitched,battersFaced,numberOfPitches,strikes,earnedRuns,gamesStarted";
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function lines(box, gamePk) {
  const out = [];
  for (const side of ["away", "home"]) {
    const t = box?.teams?.[side];
    for (const p of Object.values(t?.players ?? {})) {
      const b = p?.stats?.batting ?? {};
      const q = p?.stats?.pitching ?? {};
      const batted = num(b.plateAppearances) != null && b.plateAppearances > 0;
      const pitched = num(q.battersFaced) != null && q.battersFaced > 0;
      if (!batted && !pitched) continue;
      out.push({
        gamePk, side, team: t?.team?.abbreviation ?? null, playerId: p?.person?.id ?? null, name: p?.person?.fullName ?? null,
        battingOrder: p?.battingOrder ?? null, // e.g. "100" = slot 1 starter, "101" = first substitute in slot 1
        batting: batted ? { pa: num(b.plateAppearances), ab: num(b.atBats), h: num(b.hits), d: num(b.doubles), t: num(b.triples), hr: num(b.homeRuns), tb: num(b.totalBases), r: num(b.runs), rbi: num(b.rbi), bb: num(b.baseOnBalls), ibb: num(b.intentionalWalks), hbp: num(b.hitByPitch), so: num(b.strikeOuts), sb: num(b.stolenBases) } : null,
        pitching: pitched ? { started: num(q.gamesStarted) === 1, outs: num(q.outs), ip: q.inningsPitched ?? null, bf: num(q.battersFaced), pitches: num(q.numberOfPitches), strikes: num(q.strikes), so: num(q.strikeOuts), bb: num(q.baseOnBalls), hbp: num(q.hitByPitch), h: num(q.hits), r: num(q.runs), er: num(q.earnedRuns), hr: num(q.homeRuns) } : null,
      });
    }
  }
  return out;
}

const FINAL_STATES = new Set(["Final", "Completed Early", "Game Over"]);
let days = [];
let seasonPlan = null; // date -> [{ gamePk, gameType, detailedState }] (season mode)
if (SEASON) {
  const sched = await getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&gameType=R,F,D,L,W&fields=dates,date,games,gamePk,gameType,status,abstractGameState,detailedState`);
  const lastFinal = new Map(); // gamePk -> { date, gameType, detailedState }
  for (const d of sched?.dates ?? []) for (const g of d.games ?? []) {
    if (g.status?.abstractGameState === "Final" && FINAL_STATES.has(g.status?.detailedState)) lastFinal.set(g.gamePk, { date: d.date, gameType: g.gameType ?? null, detailedState: g.status.detailedState });
  }
  seasonPlan = new Map();
  for (const [gamePk, v] of lastFinal) { const a = seasonPlan.get(v.date) ?? []; a.push({ gamePk, gameType: v.gameType, status: { abstractGameState: "Final", detailedState: v.detailedState } }); seasonPlan.set(v.date, a); }
  days = [...seasonPlan.keys()].sort();
  console.error(`[season ${SEASON}] ${lastFinal.size} final games on ${days.length} dates (each kept once, on its completion date)`);
} else {
  for (let t = Date.parse(`${FROM}T12:00:00Z`); t <= Date.parse(`${TO}T12:00:00Z`); t += 86400e3) days.push(new Date(t).toISOString().slice(0, 10));
}
const OUT_DIR = SEASON ? path.join(ROOT, "data/internal/mlb/boxscore-outcomes-history", SEASON) : OUT;
// Dedupe by stable game identity across the whole output directory (resumable).
const seenGames = new Set();
if (fs.existsSync(OUT_DIR)) for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json"))) {
  try { for (const g of JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")).games ?? []) seenGames.add(g.gamePk); } catch { /* torn file: its date is refetched below only if absent */ }
}
let datesDone = 0;
let games = 0; let written = 0; let skipped = 0;
for (const date of days) {
  if (datesDone >= LIMIT_DATES) break;
  const file = path.join(OUT_DIR, `${date}.json`);
  if (fs.existsSync(file)) { skipped += 1; continue; } // append-only by date: never re-fetched or overwritten
  datesDone += 1;
  const finals = seasonPlan
    ? (seasonPlan.get(date) ?? []).filter((g) => !seenGames.has(g.gamePk))
    : ((await getJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R,F,D,L,W&fields=dates,games,gamePk,gameType,status,abstractGameState,detailedState`))?.dates ?? []).flatMap((d) => d.games ?? []).filter((g) => g.status?.abstractGameState === "Final");
  if (!finals.length) continue;
  const rows = [];
  const gamesMeta = [];
  for (const g of finals) {
    await sleep(PAUSE_MS);
    const box = await getJson(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore?fields=${FIELDS}`);
    gamesMeta.push({ gamePk: g.gamePk, gameType: g.gameType ?? null, detailedState: g.status?.detailedState ?? null, boxscore: box ? "OK" : "MISSING", retrievedAt: new Date().toISOString() });
    if (box) rows.push(...lines(box, g.gamePk));
    seenGames.add(g.gamePk);
    games += 1;
  }
  const doc = {
    schema: "gtp.mlb.boxscore-outcomes@1", dataClass: "POSTGAME_OUTCOMES",
    rule: "outcomes recorded after the game: an evaluation target, and an input only for LATER games — never for the game it describes",
    source: "MLB StatsAPI /api/v1/game/{gamePk}/boxscore (free, no key)", ...(SEASON ? { season: Number(SEASON) } : {}), date, capturedAt: new Date().toISOString(), games: gamesMeta, rows,
  };
  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(doc) + "\n"); written += 1; }
  console.error(`… ${date}: ${finals.length} final game(s), ${rows.length} player line(s)`);
}
console.log(JSON.stringify({ season: SEASON ?? null, from: FROM, to: TO, gamesFetched: games, dateFilesWritten: written, dateFilesAlreadyPresent: skipped, write: WRITE }));
