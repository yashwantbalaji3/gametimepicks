#!/usr/bin/env node
/**
 * Capture football-data.co.uk results + closing odds into a per-league research corpus (P257 · Phase A). $0.
 *
 *   node scripts/soccer/capture-football-data.mjs [--leagues laliga,serie-a,…] [--seasons 2223,2324,…]
 *
 * Default: every league with a footballData code, every season in FOOTBALL_DATA_SEASONS. Raw CSVs go to
 * data/internal/research/soccer/raw/ (gitignored — public repository); the derived corpus is written to
 * data/internal/research/soccer/<league>/corpus-football-data-v1.json with a source manifest (URL,
 * sha256 of the raw bytes, fetch time, row counts) and attribution. Each season is persisted as it is
 * fetched, so an interrupted run keeps what it got.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { SOCCER_LEAGUES, FOOTBALL_DATA_SEASONS, league } from "../../src/lib/sports/soccer/leagues.mjs";
import { parseFootballData } from "../../src/lib/sports/soccer/football-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const keys = arg("--leagues") ? arg("--leagues").split(",") : SOCCER_LEAGUES.filter((l) => l.footballData).map((l) => l.key);
const seasons = arg("--seasons") ? arg("--seasons").split(",") : Object.keys(FOOTBALL_DATA_SEASONS);
const now = new Date().toISOString();

for (const key of keys) {
  const L = league(key);
  if (!L.footballData) { console.log(`[football-data] ${key}: no football-data code — skipped`); continue; }
  const outDir = path.join(ROOT, "data/internal/research/soccer", L.key);
  const rawDir = path.join(ROOT, "data/internal/research/soccer/raw/football-data", L.key);
  fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(rawDir, { recursive: true });
  const outFile = path.join(outDir, "corpus-football-data-v1.json");
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;
  const bySeason = new Map((prev?.sourceManifest ?? []).map((m) => [m.season, m]));
  let rows = (prev?.rows ?? []).filter((r) => !seasons.some((s) => FOOTBALL_DATA_SEASONS[s] === r.season));
  for (const s of seasons) {
    const label = FOOTBALL_DATA_SEASONS[s];
    const url = `https://www.football-data.co.uk/mmz4281/${s}/${L.footballData}.csv`;
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) { console.log(`[football-data] ${key} ${label}: HTTP ${res.status} — kept previous rows`); rows.push(...(prev?.rows ?? []).filter((r) => r.season === label)); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(rawDir, `${L.footballData}-${s}.csv`), buf);
    const { rows: got, skipped } = parseFootballData(buf.toString("latin1"), { season: label });
    rows.push(...got);
    bySeason.set(label, { season: label, url, sha256: crypto.createHash("sha256").update(buf).digest("hex"), fetchedAt: now, rows: got.length, skipped, withClosing1x2: got.filter((r) => r.market.close1x2).length });
    console.log(`[football-data] ${key} ${label}: ${got.length} results (${bySeason.get(label).withClosing1x2} with closing 1X2) · skipped ${JSON.stringify(skipped)}`);
    // persist per season, so an interrupted run keeps what it fetched
    rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
    fs.writeFileSync(outFile, JSON.stringify({
      schemaVersion: 1, artifact: "soccer-league-corpus", dataClass: "PRIVATE_RESEARCH", league: L.key, leagueName: L.name,
      generatedAt: now, attribution: "Results and closing odds: football-data.co.uk (free for research use). Stored as de-vigged probabilities; raw prices are not redistributed.",
      sourceManifest: [...bySeason.values()].sort((a, b) => a.season.localeCompare(b.season)),
      totalMatches: rows.length, rows,
    }, null, 1) + "\n");
  }
}
