#!/usr/bin/env node
/**
 * nflverse CURRENT-SEASON CAPTURE (P295) — the free inputs the v3 totals head folds live.
 *
 * The v3 play-efficiency totals head learns game by game from two nflverse files (CC BY 4.0, no key,
 * no credits): the season's finals from nfldata games.csv, and per-team-game scrimmage-play efficiency
 * reduced from the season's play-by-play. The committed history covers 1999–2025; this adds the season
 * in progress.
 *
 * The reduction is the SAME play filter and the same sums as scripts/research/nfl/extract_pbp_efficiency.py,
 * which built the history the head was evaluated on (pass or rush play, EPA present, both teams present,
 * not a kneel, spike, two-point try or deleted play).
 *
 * FAILURE IS TYPED, NEVER SILENT, AND NEVER FATAL TO THE WINDOW. A failed download keeps the last good
 * capture on disk and records the failed attempt beside it; the forecast builder then checks coverage
 * against the official finals and falls back to the incumbent head, saying why, rather than folding a
 * season with results missing. An unchanged capture is not rewritten, so quiet runs commit nothing.
 *
 * Usage: node scripts/nfl/capture-nflverse-season.mjs --now <iso> [--season 2026]
 *          [--games-csv <local file>] [--pbp <local .csv.gz>]   (local files: offline parity checks)
 * Writes: data/internal/research/nfl/replay/current-season.json
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import readline from "node:readline";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const nowDate = new Date(Date.parse(NOW));
const SEASON = Number(arg("--season", String(nowDate.getUTCMonth() >= 7 ? nowDate.getUTCFullYear() : nowDate.getUTCFullYear() - 1)));
const OUT = path.resolve(ROOT, arg("--out", "data/internal/research/nfl/replay/current-season.json"));
const prereg = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-historical-replay-preregistration.json"), "utf8"));
const FRANCHISE = prereg.frozen.franchiseMap;
const franchise = (t) => FRANCHISE[t] ?? t;

const GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const PBP_URL = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${SEASON}.csv.gz`;
const ATTRIBUTION = "Data: nflverse (https://github.com/nflverse), licensed CC BY 4.0. Derived tables; raw files are not redistributed here.";

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

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const missing = (v) => v === undefined || v === "" || v === "NA";
const isOne = (v) => !missing(v) && Number(v) === 1;

async function fetchBytes(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "follow" });
  if (res.status === 404) return { status: 404, bytes: null };
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
}

async function load(localPath, url) {
  if (localPath) return { status: 200, bytes: fs.readFileSync(localPath), source: `local:${path.basename(localPath)}` };
  const r = await fetchBytes(url);
  return { ...r, source: url };
}

function seasonFinals(csvBytes) {
  const lines = csvBytes.toString("utf8").replace(/\r/g, "").trim().split("\n");
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const k of ["game_id", "season", "gameday", "home_team", "away_team", "home_score", "away_score", "espn"]) {
    if (!(k in col)) throw new Error(`games.csv lacks column ${k}`);
  }
  const games = [];
  for (const line of lines.slice(1)) {
    const r = parseCsvLine(line);
    if (r.length !== header.length) throw new Error(`games.csv row has ${r.length} fields, header ${header.length}`);
    if (Number(r[col.season]) !== SEASON) continue;
    if (missing(r[col.home_score]) || missing(r[col.away_score])) continue;
    games.push([r[col.game_id], missing(r[col.espn]) ? null : r[col.espn], SEASON, r[col.gameday], franchise(r[col.home_team]), franchise(r[col.away_team]), Number(r[col.home_score]) + Number(r[col.away_score])]);
  }
  return games;
}

async function seasonEfficiency(gzBytes) {
  const rl = readline.createInterface({ input: Readable.from(gzBytes).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let header = null;
  let col = null;
  let malformed = 0;
  let rows = 0;
  let counted = 0;
  const sums = new Map(); // "game|posteam|defteam" -> {plays, epa}
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      col = Object.fromEntries(header.map((h, i) => [h, i]));
      for (const k of ["game_id", "posteam", "defteam", "epa", "pass", "rush"]) if (!(k in col)) throw new Error(`play-by-play lacks column ${k}`);
      continue;
    }
    rows += 1;
    const r = parseCsvLine(line);
    if (r.length !== header.length) { malformed += 1; continue; }
    const at = (k) => (k in col ? r[col[k]] : undefined);
    if (!(isOne(at("pass")) || isOne(at("rush")))) continue;
    if (missing(at("epa")) || missing(at("posteam")) || missing(at("defteam"))) continue;
    if (isOne(at("qb_kneel")) || isOne(at("qb_spike")) || isOne(at("two_point_attempt")) || isOne(at("play_deleted"))) continue;
    const key = `${at("game_id")}|${at("posteam")}|${at("defteam")}`;
    const o = sums.get(key) ?? { plays: 0, epa: 0 };
    o.plays += 1;
    o.epa += Number(at("epa"));
    sums.set(key, o);
    counted += 1;
  }
  if (rows && malformed / rows > 0.005) throw new Error(`${malformed} of ${rows} play rows were malformed — refusing to reduce a file this broken`);

  const offence = [...sums.entries()].map(([k, v]) => { const [gameId, posteam, defteam] = k.split("|"); return { gameId, posteam, defteam, ...v }; })
    .sort((a, b) => (a.gameId !== b.gameId ? (a.gameId < b.gameId ? -1 : 1) : a.posteam !== b.posteam ? (a.posteam < b.posteam ? -1 : 1) : a.defteam < b.defteam ? -1 : 1));
  const bySide = new Map(offence.map((o) => [`${o.gameId}|${o.posteam}`, o]));
  const efficiencyRows = offence.map((o) => {
    const opp = bySide.get(`${o.gameId}|${o.defteam}`);
    return { gameId: o.gameId, season: SEASON, team: franchise(o.posteam), oPlays: o.plays, oEpa: Number(o.epa.toFixed(4)), dPlays: opp ? opp.plays : 0, dEpa: opp ? Number(opp.epa.toFixed(4)) : 0 };
  });
  return { efficiencyRows, counts: { playRows: rows, countedPlays: counted, malformedLines: malformed } };
}

const previous = (() => { try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return null; } })();

try {
  const g = await load(arg("--games-csv"), GAMES_URL);
  if (!g.bytes) throw new Error("games.csv is unavailable");
  const games = seasonFinals(g.bytes);

  const p = await load(arg("--pbp"), PBP_URL);
  let efficiency = { efficiencyRows: [], counts: { playRows: 0, countedPlays: 0, malformedLines: 0 } };
  if (p.bytes) efficiency = await seasonEfficiency(p.bytes);
  else if (games.length) throw new Error(`play-by-play for ${SEASON} is not published yet but ${games.length} finals are`);

  const withEff = new Set(efficiency.efficiencyRows.map((r) => `${r.gameId}|${r.team}`));
  const finalsWithEfficiency = games.filter((x) => withEff.has(`${x[0]}|${x[4]}`) && withEff.has(`${x[0]}|${x[5]}`)).length;
  const body = {
    season: SEASON,
    columns: ["gameId", "espnId", "season", "date", "home", "away", "total"],
    games,
    efficiencyRows: efficiency.efficiencyRows,
  };
  if (previous?.state === "CAPTURED" && JSON.stringify({ season: previous.season, columns: previous.columns, games: previous.games, efficiencyRows: previous.efficiencyRows }) === JSON.stringify(body)) {
    console.log(`nflverse ${SEASON}: unchanged (${games.length} finals, ${finalsWithEfficiency} with play data) — not rewritten`);
    process.exit(0);
  }
  const out = {
    schemaVersion: 1,
    artifact: "nfl-nflverse-current-season",
    dataClass: "PRIVATE_RESEARCH",
    state: "CAPTURED",
    capturedAt: NOW,
    attribution: ATTRIBUTION,
    sources: [
      { name: "games.csv", source: g.source, bytes: g.bytes.length, sha256: sha256(g.bytes) },
      { name: `play_by_play_${SEASON}.csv.gz`, source: p.source, bytes: p.bytes?.length ?? 0, sha256: p.bytes ? sha256(p.bytes) : null, status: p.status },
    ],
    playFilter: "pass==1 or rush==1; epa present; posteam and defteam present; not qb_kneel, qb_spike, two_point_attempt or play_deleted",
    counts: { finals: games.length, finalsWithEfficiency, ...efficiency.counts },
    ...body,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`nflverse ${SEASON}: ${games.length} finals, ${finalsWithEfficiency} with play data, ${efficiency.counts.countedPlays} counted plays`);
} catch (err) {
  const reason = String(err?.message ?? err);
  console.log(`::warning::nflverse ${SEASON} capture failed: ${reason}. The forecast builder checks coverage and falls back to the incumbent totals head if results are missing.`);
  const record = previous?.state === "CAPTURED"
    ? { ...previous, lastAttempt: { at: NOW, state: "FAILED", reason } }
    : { schemaVersion: 1, artifact: "nfl-nflverse-current-season", dataClass: "PRIVATE_RESEARCH", state: "UNAVAILABLE", season: SEASON, lastAttempt: { at: NOW, state: "FAILED", reason }, columns: [], games: [], efficiencyRows: [] };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(record));
}
