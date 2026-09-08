#!/usr/bin/env node
/**
 * PARTICIPATION GROUND TRUTH (P247) — did this player actually play this game?
 *
 * Source: nflverse snap counts (free public data, github.com/nflverse/nflverse-data), raw CSVs
 * committed VERBATIM under data/internal/research/nfl/raw/snap-counts/. A player with ANY snaps
 * (offense + defense + special teams) participated; a candidate with no snap record did not
 * dress — the distinction every props evaluation needs, because prop markets VOID a DNP while
 * an active player with zero touches settles 0 (population-sensitivity-annex.json records how
 * much evidence rested on conflating the two).
 *
 * JOIN DISCIPLINE (the WC matchId and P170-B lessons):
 *   · team codes normalized nflverse → ESPN (WAS→WSH, JAC→JAX, LA→LAR);
 *   · names normalized (diacritics, punctuation, generational suffixes);
 *   · a nickname miss falls back to LAST NAME only when that last name is UNIQUE within the
 *     same (season, round, week, team) — never a guess between two candidates;
 *   · postseason rounds map corpus weeks {1:WC, 2:DIV, 3:CON, 5:SB} onto nflverse game_type
 *     (nflverse numbers playoff weeks 19-22; the corpus restarts at 1 — Kelce's "missing"
 *     Wild-Card snaps found this);
 *   · the builder VALIDATES itself: every stat-recording corpus player must resolve to a
 *     snaps>0 record, and the build REFUSES below 99% — a silent join hole becomes a loud one.
 *
 * Usage: node scripts/nfl/build-nfl-participation-truth.mjs --now <iso>
 * Writes: data/internal/research/nfl/participation-truth-v1/{season}.json (+ index.json)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const RAW = path.join(ROOT, "data/internal/research/nfl/raw/snap-counts");
const OUT = path.join(ROOT, "data/internal/research/nfl/participation-truth-v1");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const TEAM_ALIAS = { WAS: "WSH", JAC: "JAX", LA: "LAR" };
export const POSTSEASON_ROUND_BY_CORPUS_WEEK = { 1: "WC", 2: "DIV", 3: "CON", 5: "SB" };

export function normName(n) {
  return String(n)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[.'`-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ").trim();
}

/** Minimal quote-aware CSV line parser (names never need more than this; refuse on imbalance). */
function parseCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (q) throw new Error(`unbalanced quote: ${line.slice(0, 80)}`);
  out.push(cur);
  return out;
}

const seasons = [2023, 2024, 2025];
fs.mkdirSync(OUT, { recursive: true });
const index = { schemaVersion: 1, artifact: "nfl-participation-truth-v1", dataClass: "PRIVATE_RESEARCH", generatedAt: NOW, source: "nflverse snap_counts (raw CSVs committed beside this artifact)", seasons: [] };

for (const season of seasons) {
  const rawPath = path.join(RAW, `snaps${season}.csv`);
  const raw = fs.readFileSync(rawPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ["season", "game_type", "week", "player", "team", "offense_snaps", "defense_snaps", "st_snaps"]) {
    if (!(need in col)) { console.error(`REFUSED: ${rawPath} lacks column ${need}`); process.exit(2); }
  }
  /* P248 A1: snap COMPONENTS are retained — offense vs defense vs special teams — because the
     population contract distinguishes "played on offense", "played special-teams/defense only"
     and "did not dress". A single total collapses states the charter requires separated. */
  const players = {}; // "<gameType>|<week>|<team>|<normName>" -> [off, def, st] (max per component)
  const byLast = {};  // "<gameType>|<week>|<team>|<lastName>" -> { normName: [off, def, st] }
  const teamWeeks = new Set(); // "<gameType>|<week>|<team>" — source coverage, so absence can mean something
  let rows = 0;
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    if (Number(f[col.season]) !== season) { console.error(`REFUSED: season mismatch in ${rawPath}`); process.exit(2); }
    const team = TEAM_ALIAS[f[col.team]] ?? f[col.team];
    const nm = normName(f[col.player]);
    const comp = ["offense_snaps", "defense_snaps", "st_snaps"].map((k) => Number(f[col[k]]) || 0);
    const key = `${f[col.game_type]}|${Number(f[col.week])}|${team}|${nm}`;
    players[key] = players[key] ? players[key].map((v, i) => Math.max(v, comp[i])) : comp;
    const last = nm.split(" ").at(-1) ?? nm;
    const lk = `${f[col.game_type]}|${Number(f[col.week])}|${team}|${last}`;
    (byLast[lk] ??= {});
    byLast[lk][nm] = byLast[lk][nm] ? byLast[lk][nm].map((v, i) => Math.max(v, comp[i])) : comp;
    teamWeeks.add(`${f[col.game_type]}|${Number(f[col.week])}|${team}`);
    rows += 1;
  }
  const contentHash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  const doc = { schemaVersion: 2, artifact: "nfl-participation-truth-v1", dataClass: "PRIVATE_RESEARCH", generatedAt: NOW, season, rawFile: path.basename(rawPath), contentHash, rows, players, byLast, teamWeeks: [...teamWeeks] };
  fs.writeFileSync(path.join(OUT, `${season}.json`), JSON.stringify(doc));
  index.seasons.push({ season, rows, contentHash });
  console.log(`${season}: ${rows} snap rows · hash ${contentHash}`);
}

// ── SELF-VALIDATION against the player-events corpus ─────────────────────────────────────────────
const { participationLookup } = await import("../../src/lib/sports/nfl/participation-truth.mjs");
let matched = 0; let total = 0; const misses = [];
for (const season of seasons) {
  const part = JSON.parse(fs.readFileSync(path.join(OUT, `${season}.json`), "utf8"));
  const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`), "utf8"));
  for (const g of corpus.games) {
    if ((g.seasonType ?? 0) === 1) continue;
    for (const p of g.players ?? []) {
      if (!["passAtt", "rushAtt", "targets"].some((k) => (p[k] ?? 0) > 0)) continue;
      total += 1;
      const v = participationLookup(part, g, p.teamAbbr, p.name);
      if (v != null && v > 0) matched += 1;
      else if (misses.length < 10) misses.push(`${season} wk${g.week} ${p.teamAbbr} ${p.name}`);
    }
  }
}
const rate = matched / total;
index.validation = { statRecordingPlayers: total, resolvedWithSnaps: matched, rate: Number(rate.toFixed(5)), sampleMisses: misses };
if (rate < 0.99) {
  console.error(`REFUSED: join validation ${(rate * 100).toFixed(2)}% < 99% — a participation corpus that cannot find one stat-recording player in a hundred would misclassify voids at scale. Misses: ${misses.join("; ")}`);
  process.exit(3);
}
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
console.log(`validation: ${matched}/${total} = ${(rate * 100).toFixed(2)}% · index written`);
