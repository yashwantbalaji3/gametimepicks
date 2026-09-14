#!/usr/bin/env node
/**
 * NFL player-game table 2013–2025 for the P299 historical player-props replay.
 *
 * player-props-v1 was fit and scored on ESPN-derived player events that exist only for 2023–2025. A replay on
 * older seasons needs the same ingredients from free nflverse files (CC BY 4.0): each skill player's stat line,
 * whether he actually PLAYED, and his team's volumes. This writes them as one committed, attributed table.
 *
 * PARTICIPATION TRUTH comes from snap counts (real data 2013–2025; the 2012 release asset is an empty
 * placeholder). A player-game is:
 *   PLAYED       a snap row with offense_snaps > 0, or a stat row (a touch is participation)
 *   PLAYED_NO_ROW  offense snaps > 0 but no stat row — added with ZERO stats. These are real zeros; dropping
 *                them is the absent-as-zero error in the other direction (P247)
 *   UNKNOWN      a stat row that matches no snap row — quarantined, counted, never scored as a zero or a void
 * A skill player with neither a stat row nor offensive snaps did not play and is not a row.
 *
 * IDENTITY: stat rows carry gsis ids, snap rows pfr ids and names. A snap row matches a stat row by
 * (game_id + gsis via the weekly roster's pfr_id), else (game_id + team + normalized name), else
 * (game_id + team + last name + position) when that is unique within the team-game. Franchise codes are mapped
 * on BOTH sides first: 2013–2016 snap files say OAK/SD/STL where the stats say LV/LAC/LA, and that mismatch alone
 * accounted for ~3% of rows. Measured identity-only before this table existed: 99.97% of skill stat rows match.
 *
 * This script computes no accuracy figure. It reads stat columns because the replay needs them; the held-out
 * seasons are scored only by the registered replay, once.
 *
 * Usage: node scripts/research/nfl/build-player-games-v1.mjs
 * Reads:  data/internal/research/nfl/raw/nflverse/player-stats/{stats_player_week,snap_counts}_YYYY.csv.gz,
 *         roster_weekly_YYYY.csv, and data/internal/research/nfl/raw/nflverse/games.csv (dates, season type)
 * Writes: data/internal/research/nfl/replay/player-games-v1.json.gz
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RAW = path.join(ROOT, "data/internal/research/nfl/raw/nflverse/player-stats");
const GAMES_CSV = path.join(ROOT, "data/internal/research/nfl/raw/nflverse/games.csv");
const OUT = path.join(ROOT, "data/internal/research/nfl/replay/player-games-v1.json.gz");
const SEASONS = Array.from({ length: 13 }, (_, i) => 2013 + i);
const FRANCHISE = Object.freeze({ STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", LAR: "LA" });
const fr = (t) => FRANCHISE[t] ?? t;
const SKILL = new Set(["QB", "RB", "WR", "TE", "FB"]);
const posGroup = (p) => ({ FB: "RB", HB: "RB" }[p] ?? p);

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false; } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const table = (buf, file) => {
  const lines = buf.toString("utf8").replace(/\r/g, "").trim().split("\n");
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  const bad = rows.filter((r) => r.length !== header.length).length;
  if (bad) throw new Error(`${file}: ${bad} rows do not match the header width`);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  return { col, rows };
};
const readGz = (file) => {
  const buf = fs.readFileSync(path.join(RAW, file));
  try { return zlib.gunzipSync(buf); } catch { throw new Error(`${file} is not a valid gzip — re-download it and validate before building`); }
};
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (s) => String(s ?? "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const lastName = (s) => (String(s ?? "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").trim().split(/\s+/).at(-1) ?? "").replace(/[^a-z]/g, "");
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/* Game dates and season type from the same hash-pinned games.csv the team replays use. */
const games = table(fs.readFileSync(GAMES_CSV), "games.csv");
const gameMeta = new Map();
for (const r of games.rows) {
  const season = Number(r[games.col.season]);
  if (season < SEASONS[0] || season > SEASONS.at(-1)) continue;
  gameMeta.set(r[games.col.game_id], { season, week: Number(r[games.col.week]), date: r[games.col.gameday], type: r[games.col.game_type] === "REG" ? "REG" : "POST" });
}

const COLUMNS = ["gameId", "season", "week", "date", "seasonType", "team", "opponent", "playerId", "name", "position", "participation", "offenseSnaps", "targets", "receptions", "recYds", "carries", "rushYds", "passAtt", "passCmp", "passYds"];
const out = [];
const teamTotals = {};
const accounting = {};
const sources = [];

for (const season of SEASONS) {
  const statsFile = `stats_player_week_${season}.csv.gz`;
  const snapsFile = `snap_counts_${season}.csv.gz`;
  const rosterFile = `roster_weekly_${season}.csv`;
  for (const f of [statsFile, snapsFile, rosterFile]) sources.push({ file: f, sha256: sha256(path.join(RAW, f)) });
  const stats = table(readGz(statsFile), statsFile);
  const snaps = table(readGz(snapsFile), snapsFile);
  const roster = table(fs.readFileSync(path.join(RAW, rosterFile)), rosterFile);

  const pfrToGsis = new Map();
  for (const r of roster.rows) {
    const p = r[roster.col.pfr_id];
    const g = r[roster.col.gsis_id];
    if (p && g && p !== "NA" && g !== "NA") pfrToGsis.set(p, g);
  }

  /* Index snap rows; a snap row is claimed by at most one stat row. */
  const snapRows = snaps.rows
    .filter((r) => gameMeta.has(r[snaps.col.game_id]))
    .map((r) => ({
      gameId: r[snaps.col.game_id], team: fr(r[snaps.col.team]), opponent: fr(r[snaps.col.opponent]),
      pfr: r[snaps.col.pfr_player_id], gsis: pfrToGsis.get(r[snaps.col.pfr_player_id]) ?? null,
      name: r[snaps.col.player], position: r[snaps.col.position], offenseSnaps: num(r[snaps.col.offense_snaps]), claimed: false,
    }));
  const byGsis = new Map();
  const byName = new Map();
  const byLast = new Map();
  for (const s of snapRows) {
    if (s.gsis) byGsis.set(`${s.gameId}|${s.gsis}`, s);
    byName.set(`${s.gameId}|${s.team}|${norm(s.name)}`, s);
    const lk = `${s.gameId}|${s.team}|${lastName(s.name)}|${posGroup(s.position)}`;
    byLast.set(lk, byLast.has(lk) ? null : s); // null marks an ambiguous last-name key
  }

  const acc = { statRowsSkill: 0, matched: 0, unknown: 0, playedNoRow: 0 };
  for (const r of stats.rows) {
    const gameId = r[stats.col.game_id];
    const meta = gameMeta.get(gameId);
    if (!meta) continue;
    const team = fr(r[stats.col.team]);
    const t = (teamTotals[`${gameId}|${team}`] ??= { passAtt: 0, carries: 0, targets: 0 });
    t.passAtt += num(r[stats.col.attempts]);
    t.carries += num(r[stats.col.carries]);
    t.targets += num(r[stats.col.targets]);
    const position = r[stats.col.position];
    if (!SKILL.has(position)) continue;
    acc.statRowsSkill += 1;
    const name = r[stats.col.player_display_name];
    const gsis = r[stats.col.player_id];
    const snap = byGsis.get(`${gameId}|${gsis}`) ?? byName.get(`${gameId}|${team}|${norm(name)}`) ?? byLast.get(`${gameId}|${team}|${lastName(name)}|${posGroup(position)}`) ?? null;
    if (snap) { snap.claimed = true; acc.matched += 1; } else acc.unknown += 1;
    out.push([
      gameId, meta.season, meta.week, meta.date, meta.type, team, fr(r[stats.col.opponent_team]), gsis, name, position,
      snap ? "PLAYED" : "UNKNOWN", snap ? snap.offenseSnaps : null,
      num(r[stats.col.targets]), num(r[stats.col.receptions]), num(r[stats.col.receiving_yards]),
      num(r[stats.col.carries]), num(r[stats.col.rushing_yards]),
      num(r[stats.col.attempts]), num(r[stats.col.completions]), num(r[stats.col.passing_yards]),
    ]);
  }
  /* Played with no stat row: real zeros. */
  for (const s of snapRows) {
    if (s.claimed || s.offenseSnaps <= 0 || !SKILL.has(s.position)) continue;
    const meta = gameMeta.get(s.gameId);
    acc.playedNoRow += 1;
    out.push([s.gameId, meta.season, meta.week, meta.date, meta.type, s.team, s.opponent, s.gsis ?? `pfr:${s.pfr}`, s.name, s.position, "PLAYED_NO_ROW", s.offenseSnaps, 0, 0, 0, 0, 0, 0, 0, 0]);
  }
  accounting[season] = acc;
  console.log(`${season}: skill stat rows ${acc.statRowsSkill} · matched to snaps ${acc.matched} · unknown ${acc.unknown} · played with no stat row ${acc.playedNoRow}`);
}

out.sort((a, b) => (a[3] !== b[3] ? (a[3] < b[3] ? -1 : 1) : a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[5] !== b[5] ? (a[5] < b[5] ? -1 : 1) : String(a[7]) < String(b[7]) ? -1 : 1));
const body = {
  schemaVersion: 1,
  artifact: "nfl-player-games",
  dataClass: "PRIVATE_RESEARCH",
  attribution: "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived per-player-game table; raw files are not redistributed here.",
  seasons: [SEASONS[0], SEASONS.at(-1)],
  population: "REG+POST skill positions (QB, RB, WR, TE, FB). PLAYED = snap-count match; PLAYED_NO_ROW = offensive snaps with no stat row (zeros); UNKNOWN = stat row with no snap match (quarantine).",
  franchiseMap: FRANCHISE,
  sources: [...sources, { file: "games.csv", sha256: sha256(GAMES_CSV) }],
  accounting,
  columns: COLUMNS,
  rows: out,
  teamTotalsColumns: ["passAtt", "carries", "targets"],
  teamTotals: Object.fromEntries(Object.entries(teamTotals).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, [v.passAtt, v.carries, v.targets]])),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(body), { level: 9 }));
const total = Object.values(accounting).reduce((s, a) => ({ matched: s.matched + a.matched, unknown: s.unknown + a.unknown, playedNoRow: s.playedNoRow + a.playedNoRow, stat: s.stat + a.statRowsSkill }), { matched: 0, unknown: 0, playedNoRow: 0, stat: 0 });
console.log(`\nwrote ${out.length} player-games (${total.stat} skill stat rows: ${total.matched} matched, ${total.unknown} unknown; ${total.playedNoRow} played with no stat row) -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
