#!/usr/bin/env node
/**
 * NFL 2026 PLAYER-GAMES (player-games-v2 schema) from COMMITTED sources only — the 2026 rows the NFL-003/004/005
 * forward captures fold after the 2013–2025 history. PRIVATE_RESEARCH.
 *
 *   node scripts/research/nfl/build-player-games-2026.mjs [--through-week N]   (default: every completed regular-season game)
 *
 * Runs in the NFL event window before the World Model V2 input export (NFL-005 freshness). Written only when the rows
 * change, so an unchanged window commits nothing.
 *
 * Sources (all committed): data/internal/research/nfl/player-events-v1/2026.json (ESPN game-summary stat lines),
 * data/internal/research/nfl/nflverse/participation-2026.jsonl (offensive snaps with gsis + espn ids),
 * data/internal/research/nfl/replay/current-season.json (nflverse game ids and dates by ESPN event id).
 * Participation follows player-games-v2: PLAYED = stat line + offensive snaps; PLAYED_NO_ROW = snaps, no stat line
 * (a real zero); UNKNOWN = stat line with no snap match (never scored, never folded). Positions QB/RB/WR/TE/FB only.
 * DECLARED DIFFERENCES from v2: `otherTd` is 0 (ESPN stat lines carry no return/defensive TDs per player); ids are gsis
 * when the participation file maps them, else `espn:<id>` (such a row is UNKNOWN by construction).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const THROUGH = argOf("--through-week") ? Number(argOf("--through-week")) : Infinity;
const OUT = "data/internal/research/nfl/replay/player-games-2026-v1.json.gz";
const SRC = {
  events: "data/internal/research/nfl/player-events-v1/2026.json",
  participation: "data/internal/research/nfl/nflverse/participation-2026.jsonl",
  season: "data/internal/research/nfl/replay/current-season.json",
};
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(rel(p))).digest("hex");
const ESPN_TO_NFLVERSE = { WSH: "WAS", LAR: "LA" };
const nv = (t) => ESPN_TO_NFLVERSE[t] ?? t;
const SKILL = new Set(["QB", "RB", "WR", "TE", "FB"]);

const events = JSON.parse(fs.readFileSync(rel(SRC.events), "utf8"));
const part = fs.readFileSync(rel(SRC.participation), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const season = JSON.parse(fs.readFileSync(rel(SRC.season), "utf8"));
const SC = Object.fromEntries(season.columns.map((c, i) => [c, i]));
const gameByEspn = new Map(season.games.map((g) => [String(g[SC.espnId]), { gameId: g[SC.gameId], date: g[SC.date] }]));
const espnToGsis = new Map();
const snapBy = new Map(); // gameId|gsis → {snaps, position, name, team}
for (const p of part) {
  if (p.espnId && p.gsisId) espnToGsis.set(String(p.espnId), p.gsisId);
  if (p.gsisId) snapBy.set(`${p.gameId}|${p.gsisId}`, { snaps: p.offenseSnaps ?? 0, position: p.position, name: p.name, team: p.team, opponent: p.opponent });
}

const columns = ["gameId", "season", "week", "date", "seasonType", "team", "opponent", "playerId", "name", "position", "participation", "offenseSnaps", "targets", "receptions", "recYds", "carries", "rushYds", "passAtt", "passCmp", "passYds", "rushTd", "recTd", "otherTd"];
const rows = [];
const unmappedGames = [];
const counts = { PLAYED: 0, PLAYED_NO_ROW: 0, UNKNOWN: 0 };
for (const g of events.games) {
  if (g.seasonType !== 2 || g.week > THROUGH) continue;
  const ids = gameByEspn.get(String(g.providerEventId));
  if (!ids) { unmappedGames.push(g.providerEventId); continue; }
  const home = nv(g.home);
  const away = nv(g.away);
  const seen = new Set();
  for (const p of g.players) {
    const touched = (p.targets ?? 0) + (p.rushAtt ?? 0) + (p.passAtt ?? 0) + (p.rec ?? 0) > 0;
    if (!touched) continue;
    const espn = String(p.playerId).replace(/^nfl-athlete-/, "");
    const gsis = espnToGsis.get(espn) ?? null;
    const team = nv(p.teamAbbr);
    const snap = gsis ? snapBy.get(`${ids.gameId}|${gsis}`) : null;
    const position = snap?.position ?? null;
    if (position && !SKILL.has(position)) continue;
    const participation = snap && snap.snaps > 0 ? "PLAYED" : "UNKNOWN";
    counts[participation] += 1;
    if (gsis) seen.add(gsis);
    rows.push([ids.gameId, 2026, g.week, ids.date, "REG", team, team === home ? away : home, gsis ?? `espn:${espn}`, p.name, position, participation, snap?.snaps ?? 0,
      p.targets ?? 0, p.rec ?? 0, p.recYds ?? 0, p.rushAtt ?? 0, p.rushYds ?? 0, p.passAtt ?? 0, p.passCmp ?? 0, p.passYds ?? 0, p.rushTd ?? 0, p.recTd ?? 0, 0]);
  }
  // skill players with offensive snaps and no stat line: real zeros
  for (const [k, s] of snapBy) {
    const [gid, gsis] = k.split("|");
    if (gid !== ids.gameId || seen.has(gsis) || !SKILL.has(s.position) || !(s.snaps > 0)) continue;
    counts.PLAYED_NO_ROW += 1;
    rows.push([ids.gameId, 2026, g.week, ids.date, "REG", s.team, s.opponent, gsis, s.name, s.position, "PLAYED_NO_ROW", s.snaps, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  }
}
const C = Object.fromEntries(columns.map((c, i) => [c, i]));
const teamTotals = {};
for (const r of rows) {
  const k = `${r[C.gameId]}|${r[C.team]}`;
  const t = (teamTotals[k] ??= [0, 0, 0, 0, 0]);
  t[0] += r[C.passAtt]; t[1] += r[C.carries]; t[2] += r[C.targets]; t[3] += r[C.rushTd]; t[4] += r[C.recTd];
}
rows.sort((a, b) => (a[C.date] + a[C.gameId] + a[C.playerId]).localeCompare(b[C.date] + b[C.gameId] + b[C.playerId]));
const doc = {
  schemaVersion: 1, artifact: "nfl-player-games-2026-v1", dataClass: "PRIVATE_RESEARCH",
  schemaOf: "player-games-v2", throughWeek: Number.isFinite(THROUGH) ? THROUGH : Math.max(0, ...events.games.filter((g) => g.seasonType === 2).map((g) => g.week)),
  sources: Object.fromEntries(Object.entries(SRC).map(([k, p]) => [k, { path: p, sha256: sha(p) }])),
  declaredDifferences: ["otherTd = 0 (no per-player return/defensive TDs in the ESPN stat lines)", "team totals summed over skill-position rows only"],
  counts, unmappedGames, columns, rows,
  teamTotalsColumns: ["passAtt", "carries", "targets", "rushTd", "recTd"], teamTotals,
};
const prevBody = fs.existsSync(rel(OUT)) ? zlib.gunzipSync(fs.readFileSync(rel(OUT))).toString() : null;
const strip = (d) => JSON.stringify({ ...d, sources: Object.fromEntries(Object.entries(d.sources).map(([k, v]) => [k, v.path])) });
if (prevBody && strip(JSON.parse(prevBody)) === strip(doc)) { console.log(`${OUT}: unchanged (${rows.length} rows)`); process.exit(0); }
fs.writeFileSync(rel(OUT), zlib.gzipSync(JSON.stringify(doc), { level: 9 }));
console.log(`wrote ${OUT}: ${rows.length} rows · ${Object.keys(teamTotals).length} team-games · ${JSON.stringify(counts)} · unmapped games ${unmappedGames.length}`);
