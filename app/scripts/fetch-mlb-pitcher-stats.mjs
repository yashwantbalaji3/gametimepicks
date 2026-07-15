#!/usr/bin/env node
/**
 * Build a LEAKAGE-CLEAN probable-starter strength rating for the validation window, from StatsAPI game logs.
 *
 * For each settled game (join closing-odds gamePk → board probable-pitcher IDs), each starter's rating uses ONLY
 * their starts STRICTLY BEFORE that game's date. Rating = FIP-proxy runs-saved-per-9 vs the sample-mean starter
 * (IP-weighted) → positive = better than average (suppresses opponent runs). No final scores, no same-day data.
 *
 * Reads: data/internal/mlb/reference/mlb-closing-odds.json (gamePks) + app/public/data/mlb/boards/<date>.json
 *        (probable pitcher IDs) + StatsAPI people/<id>/stats?stats=gameLog (2026, free).
 * Writes (INTERNAL): data/internal/mlb/reference/mlb-pitcher-strength.json (public:false).
 *
 * Usage: node app/scripts/fetch-mlb-pitcher-stats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const APP = path.resolve(__dirname, "..");
const FIP_C = 3.1;

const parseIP = (s) => { const [w, f] = String(s ?? "0").split("."); return Number(w) + (f === "1" ? 1 / 3 : f === "2" ? 2 / 3 : 0); };

const closing = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;
const dates = [...new Set(closing.map((g) => g.date))].sort();

// gamePk → { date, homeSPId, awaySPId } from boards
const gameSP = new Map();
for (const date of dates) {
  const p = path.join(APP, "public/data/mlb/boards", `${date}.json`);
  if (!fs.existsSync(p)) continue;
  for (const g of JSON.parse(fs.readFileSync(p, "utf8")).games || []) {
    gameSP.set(g.gamePk, { date, homeSPId: g.homeProbablePitcherId ?? null, awaySPId: g.awayProbablePitcherId ?? null, homeSP: g.homeProbablePitcherName, awaySP: g.awayProbablePitcherName });
  }
}

// Fetch each distinct pitcher's 2026 game log once.
const ids = [...new Set([...gameSP.values()].flatMap((v) => [v.homeSPId, v.awaySPId]).filter(Boolean))];
console.log(`fetching game logs for ${ids.length} probable starters...`);
const logs = new Map();
for (const id of ids) {
  try {
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=2026&group=pitching`).then((r) => r.json());
    logs.set(id, (j.stats?.[0]?.splits || []).map((s) => ({ date: s.date, gs: Number(s.stat.gamesStarted || 0), ip: parseIP(s.stat.inningsPitched), er: Number(s.stat.earnedRuns || 0), k: Number(s.stat.strikeOuts || 0), bb: Number(s.stat.baseOnBalls || 0), hr: Number(s.stat.homeRuns || 0), bf: Number(s.stat.battersFaced || 0), h: Number(s.stat.hits || 0) })));
  } catch { logs.set(id, []); }
}

// Strictly-earlier aggregate for a starter before a game date.
function priorAgg(id, beforeDate) {
  const rows = (logs.get(id) || []).filter((r) => r.date < beforeDate && r.gs > 0);
  const ip = rows.reduce((s, r) => s + r.ip, 0);
  if (ip < 5) return null; // need a minimum of prior innings to rate a starter
  const er = rows.reduce((s, r) => s + r.er, 0), k = rows.reduce((s, r) => s + r.k, 0), bb = rows.reduce((s, r) => s + r.bb, 0), hr = rows.reduce((s, r) => s + r.hr, 0), bf = rows.reduce((s, r) => s + r.bf, 0), h = rows.reduce((s, r) => s + r.h, 0);
  const lastDate = rows.map((r) => r.date).sort().slice(-1)[0];
  const daysRest = lastDate ? Math.round((new Date(beforeDate) - new Date(lastDate)) / 86400000) : null;
  return { starts: rows.length, ip: +ip.toFixed(1), era: +((er * 9) / ip).toFixed(2), fip: +(((13 * hr + 3 * bb - 2 * k) / ip) + FIP_C).toFixed(2), kbbPct: bf > 0 ? +(((k - bb) / bf)).toFixed(3) : null, whip: +(((bb + h) / ip)).toFixed(2), daysRest };
}

// First pass: per-game starter FIP; then IP-weighted sample mean FIP = the "average starter" baseline.
const rows = [];
for (const [gamePk, sp] of gameSP) {
  if (!sp.homeSPId || !sp.awaySPId) continue;
  const home = priorAgg(sp.homeSPId, sp.date), away = priorAgg(sp.awaySPId, sp.date);
  rows.push({ gamePk, date: sp.date, homeSP: sp.homeSP, awaySP: sp.awaySP, home, away });
}
const allFip = rows.flatMap((r) => [r.home, r.away]).filter(Boolean);
const meanFip = allFip.reduce((s, x) => s + x.fip * x.ip, 0) / allFip.reduce((s, x) => s + x.ip, 0);

// runsSaved9 = sample-mean starter FIP − this starter's FIP (positive = better; clamp to a sane ±2.5 runs).
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const rated = rows.map((r) => ({
  gamePk: r.gamePk, date: r.date,
  home: r.home ? { ...r.home, name: r.homeSP, runsSaved9: +clamp(meanFip - r.home.fip, -2.5, 2.5).toFixed(3) } : null,
  away: r.away ? { ...r.away, name: r.awaySP, runsSaved9: +clamp(meanFip - r.away.fip, -2.5, 2.5).toFixed(3) } : null,
}));
const covered = rated.filter((r) => r.home && r.away).length;

fs.mkdirSync(path.join(REPO, "data/internal/mlb/reference"), { recursive: true });
fs.writeFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-pitcher-strength.json"), JSON.stringify({
  _source: "StatsAPI people/<id>/stats gameLog (2026), probable starters from mlb/boards. Strictly-earlier starts only.",
  _leakageNote: "Each starter's rating uses ONLY starts with date < the game date; no same-day or final-score data. runsSaved9 = IP-weighted sample-mean starter FIP − starter FIP (positive = suppresses opponent runs).",
  _internal: true, _public: false, _officialMoneyRecordAffected: false,
  asOf: "2026-07-14", sampleMeanStarterFip: +meanFip.toFixed(3), fipConstant: FIP_C,
  coverage: `${covered}/${rated.length} games with both starters rated`, games: rated,
}, null, 2));
console.log(`✓ mlb-pitcher-strength.json — ${covered}/${rated.length} games both-rated · sample-mean starter FIP ${meanFip.toFixed(2)}`);
console.log(`  sample: ${rated[0]?.home?.name} runsSaved9 ${rated[0]?.home?.runsSaved9} (FIP ${rated[0]?.home?.fip}, ${rated[0]?.home?.starts} starts) vs ${rated[0]?.away?.name} runsSaved9 ${rated[0]?.away?.runsSaved9}`);
