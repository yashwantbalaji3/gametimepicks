#!/usr/bin/env node
/**
 * Capture free nflverse data into our NFL research tables (P257 · free data). $0, no key.
 *
 *   node scripts/nfl/capture-nflverse.mjs --now <ISO> [--seasons 2022,2023,2024,2025,2026]
 *
 * Sources (nflverse, CC BY 4.0 — https://github.com/nflverse):
 *   players/players.csv                 gsis_id · pfr_id · espn_id crosswalk
 *   nfldata/data/games.csv              every game: closing spread/total/moneylines, scores, roof, surface, weather
 *   snap_counts/snap_counts_<season>    per player-game offensive snap share
 *
 * Raw files stay local (data/internal/research/nfl/raw/nflverse/, gitignored — public repository); only
 * derived tables are committed, each carrying the attribution:
 *   data/internal/research/nfl/nflverse/game-lines-v1.json
 *   data/internal/research/nfl/nflverse/participation-<season>.jsonl   (one per season — history never rewritten)
 *   data/internal/research/nfl/nflverse/manifest-v1.json   (sources, sha256, row counts, unjoined counts)
 * Nothing here feeds a model or a public page until a preregistration says so.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseCsv, buildGameLines, indexPlayersByPfr, buildParticipation } from "../../src/lib/sports/nfl/nflverse.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!Number.isFinite(Date.parse(NOW ?? ""))) { console.error("usage: --now <ISO> [--seasons 2022,…]"); process.exit(2); }
const seasons = (arg("--seasons") ?? "2022,2023,2024,2025,2026").split(",").map(Number);
const REL = "https://github.com/nflverse/nflverse-data/releases/download";
const RAW = path.join(ROOT, "data/internal/research/nfl/raw/nflverse");
const OUT = path.join(ROOT, "data/internal/research/nfl/nflverse");
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const ATTRIBUTION = "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived tables; raw files are not redistributed here.";

const manifest = { schemaVersion: 1, artifact: "nflverse-capture", dataClass: "PRIVATE_RESEARCH", capturedAt: NOW, attribution: ATTRIBUTION, sources: [] };
async function fetchText(name, url, { optional = false } = {}) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    manifest.sources.push({ name, url, status: res.status, skipped: true });
    if (optional) { console.log(`[nflverse] ${name}: HTTP ${res.status} — not published yet, skipped`); return null; }
    throw new Error(`${name}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(RAW, name), buf); // persisted as fetched, so an interrupted run keeps what it got
  manifest.sources.push({ name, url, status: 200, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") });
  return buf.toString("utf8");
}

const players = parseCsv(await fetchText("players.csv", `${REL}/players/players.csv`));
const byPfr = indexPlayersByPfr(players);
console.log(`[nflverse] players: ${players.length} (${byPfr.size} with a pfr id)`);

const games = parseCsv(await fetchText("games.csv", "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"));
const lines = buildGameLines(games, { fromSeason: Math.min(...seasons) });
fs.writeFileSync(path.join(OUT, "game-lines-v1.json"), JSON.stringify({ schemaVersion: 1, artifact: "nfl-game-lines", dataClass: "PRIVATE_RESEARCH", generatedAt: NOW, attribution: ATTRIBUTION, games: lines }, null, 0) + "\n");
const withClose = lines.filter((g) => g.close.moneyline && g.close.total != null).length;
console.log(`[nflverse] game lines: ${lines.length} games from ${Math.min(...seasons)} (${withClose} with a closing moneyline + total; ${lines.filter((g) => g.final).length} final)`);

/* ONE FILE PER SEASON: a finished season never changes again, so the weekly job rewrites only the current
   season's file instead of re-committing ~10MB of history every Tuesday. */
const participation = {};
for (const s of seasons) {
  const txt = await fetchText(`snap_counts_${s}.csv`, `${REL}/snap_counts/snap_counts_${s}.csv`, { optional: true });
  if (!txt) { participation[s] = { rows: 0, unjoined: 0, published: false }; continue; }
  const { rows, unjoined } = buildParticipation(parseCsv(txt), byPfr);
  const file = `participation-${s}.jsonl`;
  fs.writeFileSync(path.join(OUT, file), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  participation[s] = { file, rows: rows.length, unjoined, joinRate: rows.length ? Number((1 - unjoined / rows.length).toFixed(4)) : null, published: true };
  console.log(`[nflverse] participation ${s}: ${rows.length} player-games · ${unjoined} without an ESPN id (${participation[s].joinRate})`);
}
manifest.tables = { gameLines: { games: lines.length, withClose }, participation };
fs.writeFileSync(path.join(OUT, "manifest-v1.json"), JSON.stringify(manifest, null, 1) + "\n");
