#!/usr/bin/env node
/**
 * Capture openfootball results into the soccer corpora. $0, public domain (CC0 1.0), no key.
 *
 *   node scripts/soccer/capture-openfootball.mjs [--leagues ligue-1,epl] [--offline]
 *
 * Replaces capture-football-data.mjs (founder decision 2026-09-14: football-data.co.uk's terms reserve its data for
 * private individuals, not automated or commercial use). Every season file available for each league (2010-11 to
 * the current season) is downloaded, validated by CONTENT (JSON, a matches array), cached git-ignored under
 * data/internal/research/soccer/raw/openfootball/<season>/<code>.json, and turned into:
 *
 *   data/internal/research/soccer/<league>/corpus-openfootball-v1.json   the CORPUS_SEASONS window — what the published
 *                                                                       and shadow pipelines read (same row shape and
 *                                                                       club names as the corpus it replaces)
 *   data/internal/research/soccer/<league>/history-openfootball-v1.json  every season — research only
 *
 * Refuses (exit 3) when a club in the corpus window has no entry in openfootball-club-names.mjs, or when one club key
 * carries two spellings inside one season (two clubs would be merged). A season file that does not exist upstream
 * (404) is recorded as unavailable; any other failure after retries exits non-zero. Files are rewritten only when
 * their content changes, so an unchanged run commits nothing.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { CORPUS_SEASONS, league as leagueOf } from "../../src/lib/sports/soccer/leagues.mjs";
import { OPENFOOTBALL_BASE, OPENFOOTBALL_ATTRIBUTION, OPENFOOTBALL_LEAGUES, parseOpenfootball, clubKey, seasonOfDate } from "../../src/lib/sports/soccer/openfootball.mjs";
import { OPENFOOTBALL_CLUB_NAMES } from "../../src/lib/sports/soccer/openfootball-club-names.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const OFFLINE = argv.includes("--offline");
const keys = arg("--leagues") ? arg("--leagues").split(",") : Object.keys(OPENFOOTBALL_LEAGUES);
const RAW = path.join(ROOT, "data/internal/research/soccer/raw/openfootball");
const nowIso = new Date().toISOString();
const current = seasonOfDate(nowIso.slice(0, 10));
const SEASONS = [];
for (let y = 2010; `${y}-${String(y + 1).slice(2)}` <= current; y += 1) SEASONS.push(`${y}-${String(y + 1).slice(2)}`);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function fetchSeason(season, code) {
  const file = path.join(RAW, season, `${code}.json`);
  const url = `${OPENFOOTBALL_BASE}/${season}/${code}.json`;
  const valid = (buf) => { try { const j = JSON.parse(buf.toString("utf8")); return Array.isArray(j.matches) && j.matches.length ? j : null; } catch { return null; } };
  if (!OFFLINE) {
    for (let attempt = 1; ; attempt += 1) {
      let status = null;
      try {
        const res = await fetch(url, { redirect: "follow" });
        status = res.status;
        if (res.status === 404) return { url, available: false };
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (!valid(buf)) throw new Error(`${season}/${code}.json is not a football.json season (no matches array)`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(`${file}.tmp`, buf);
          fs.renameSync(`${file}.tmp`, file);
          break;
        }
        if (status < 500) throw new Error(`${season}/${code}.json: HTTP ${status}`);
      } catch (e) {
        if (status != null && status < 500 && status !== 404) throw e;
        if (/not a football\.json season/.test(e.message)) throw e;
      }
      if (attempt >= 4) throw new Error(`${season}/${code}.json: ${status ? `HTTP ${status}` : "network error"} after ${attempt} attempts`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  if (!fs.existsSync(file)) return { url, available: false };
  const buf = fs.readFileSync(file);
  const json = valid(buf);
  if (!json) throw new Error(`${season}/${code}.json cached file is invalid — run without --offline`);
  return { url, available: true, json, sha256: sha(buf) };
}

const writeIfChanged = (file, body) => {
  const strip = (d) => JSON.stringify({ ...d, generatedAt: null, sourceManifest: (d.sourceManifest ?? []).map((m) => ({ ...m, fetchedAt: null })) });
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (prev && strip(prev) === strip(body)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(body, null, 1));
  return true;
};

let refused = 0;
for (const key of keys) {
  const spec = OPENFOOTBALL_LEAGUES[key];
  const L = leagueOf(key);
  if (!spec) { console.error(`REFUSED: ${key} has no openfootball code`); refused += 1; continue; }
  const table = OPENFOOTBALL_CLUB_NAMES[key] ?? {};
  const manifest = [];
  const parsed = [];
  for (const season of SEASONS) {
    let got;
    try { got = await fetchSeason(season, spec.code); } catch (e) { console.error(`REFUSED: ${key} ${e.message}`); process.exit(1); }
    if (!got.available) { manifest.push({ season, url: got.url, available: false }); continue; }
    const { rows, skipped } = parseOpenfootball(got.json, { season, timeZone: spec.timeZone });
    manifest.push({ season, url: got.url, available: true, sha256: got.sha256, fetchedAt: nowIso, fixtures: got.json.matches.length, results: rows.length, withoutResult: skipped.noScore, badDate: skipped.badDate });
    parsed.push(...rows);
  }

  /* One key, one spelling per season — two clubs must never merge. The latest spelling names history-only clubs. */
  const spellings = new Map();
  const latest = new Map();
  for (const r of parsed) for (const n of [r.homeSource, r.awaySource]) {
    const k = `${r.season}|${clubKey(n)}`;
    (spellings.get(k) ?? spellings.set(k, new Set()).get(k)).add(n);
    const prev = latest.get(clubKey(n));
    if (!prev || r.season >= prev.season) latest.set(clubKey(n), { season: r.season, name: n });
  }
  const merged = [...spellings].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}: ${[...s].join(" / ")}`);
  if (merged.length) { console.error(`REFUSED: ${key} club keys carry two spellings in one season (two clubs would merge): ${merged.join("; ")}`); refused += 1; continue; }

  const windowSet = new Set(CORPUS_SEASONS);
  const missing = new Set();
  const nameOf = (source, season) => {
    const k = clubKey(source);
    if (table[k]) return table[k];
    if (windowSet.has(season)) { missing.add(`${source} (key "${k}")`); return null; }
    return latest.get(k).name;
  };
  const rows = parsed.map((r) => ({ season: r.season, dateUtc: r.dateUtc, home: nameOf(r.homeSource, r.season), away: nameOf(r.awaySource, r.season), ftHome: r.ftHome, ftAway: r.ftAway, result: r.result, market: null }));
  if (missing.size) { console.error(`REFUSED: ${key} clubs in the corpus window are not in openfootball-club-names.mjs — add each after checking it is the same club: ${[...missing].join("; ")}`); refused += 1; continue; }
  rows.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.home.localeCompare(b.home));

  const base = { schemaVersion: 1, dataClass: "PRIVATE_RESEARCH", league: key, leagueName: L.name, generatedAt: nowIso, source: "openfootball", attribution: OPENFOOTBALL_ATTRIBUTION };
  const corpusRows = rows.filter((r) => windowSet.has(r.season));
  const dir = path.join(ROOT, "data/internal/research/soccer", key);
  const wroteCorpus = writeIfChanged(path.join(dir, "corpus-openfootball-v1.json"), { ...base, artifact: "soccer-corpus", seasons: CORPUS_SEASONS, sourceManifest: manifest.filter((m) => windowSet.has(m.season)), totalMatches: corpusRows.length, rows: corpusRows });
  const wroteHistory = writeIfChanged(path.join(dir, "history-openfootball-v1.json"), { ...base, artifact: "soccer-history", seasons: manifest.filter((m) => m.available).map((m) => m.season), sourceManifest: manifest, totalMatches: rows.length, rows });
  const bySeason = Object.fromEntries(manifest.filter((m) => m.available).map((m) => [m.season, m.results]));
  console.log(`[openfootball] ${key}: corpus ${corpusRows.length} (${wroteCorpus ? "written" : "unchanged"}) · history ${rows.length} (${wroteHistory ? "written" : "unchanged"}) · ${JSON.stringify(bySeason)} · unavailable ${manifest.filter((m) => !m.available).map((m) => m.season).join(",") || "none"}`);
}
if (refused) process.exit(3);
