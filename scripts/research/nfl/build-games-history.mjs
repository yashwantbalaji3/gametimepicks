#!/usr/bin/env node
/**
 * Compact NFL game history for the live totals head (P295).
 *
 * The v3 play-efficiency head was evaluated walk-forward from 1999 over nflverse games.csv. The live
 * forecast builder must fold the SAME games the same way, but games.csv is a git-ignored raw file, so
 * this writes the part the fold needs — finals only, franchise-mapped — as a committed, attributed
 * derived table. The parity test proves the live fold over this table reproduces the evaluation's
 * held-out numbers exactly, which is what makes it the same model rather than a re-implementation.
 *
 * Usage: node scripts/research/nfl/build-games-history.mjs
 * Reads:  data/internal/research/nfl/raw/nflverse/games.csv (hash must match the registration)
 * Writes: data/internal/research/nfl/replay/games-history-v1.json
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const prereg = JSON.parse(fs.readFileSync(rel("data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json"), "utf8"));
const F = prereg.frozen;
const SRC = "data/internal/research/nfl/raw/nflverse/games.csv";
const OUT = "data/internal/research/nfl/replay/games-history-v1.json";

const bytes = fs.readFileSync(rel(SRC));
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha !== F.inputs.gamesCsvSha256) { console.error("REFUSED: games.csv does not match the registered hash"); process.exit(1); }

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

const lines = bytes.toString("utf8").replace(/\r/g, "").trim().split("\n");
const header = parseCsvLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const franchise = (t) => F.franchiseMap[t] ?? t;
const games = [];
for (const line of lines.slice(1)) {
  const r = parseCsvLine(line);
  if (r.length !== header.length) { console.error(`REFUSED: malformed row ${line.slice(0, 60)}`); process.exit(1); }
  const season = Number(r[col.season]);
  if (season < F.seasons.warmup[0] || season > F.seasons.dev[1]) continue;
  if (r[col.home_score] === "" || r[col.away_score] === "") continue;
  games.push([r[col.game_id], r[col.espn] || null, season, r[col.gameday], franchise(r[col.home_team]), franchise(r[col.away_team]), Number(r[col.home_score]) + Number(r[col.away_score])]);
}

fs.mkdirSync(path.dirname(rel(OUT)), { recursive: true });
fs.writeFileSync(rel(OUT), JSON.stringify({
  schemaVersion: 1,
  artifact: "nfl-games-history",
  dataClass: "PRIVATE_RESEARCH",
  attribution: "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived finals table; the raw file is not redistributed here.",
  source: { file: "nflverse nfldata games.csv", sha256: sha },
  seasons: [F.seasons.warmup[0], F.seasons.dev[1]],
  population: "REG+POST finals (game_type REG, WC, DIV, CON, SB), franchise-mapped",
  columns: ["gameId", "espnId", "season", "date", "home", "away", "total"],
  games,
}));
console.log(`wrote ${games.length} finals -> ${OUT}`);
