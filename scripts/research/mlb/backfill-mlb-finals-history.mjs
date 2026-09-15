#!/usr/bin/env node
/**
 * P601 — MLB HISTORICAL FINALS BACKFILL (2023–2025 regular seasons). INTERNAL RESEARCH DATA ONLY.
 *
 * Founder-approved (Phase 6 §6.1) acquisition of regular-season final scores + venue identity from the free MLB
 * StatsAPI schedule endpoint the site already uses for finals and lineups. NO key, NO credits, one host.
 *
 *   https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=<YYYY-MM-DD>
 *
 * This script ACQUIRES AND VALIDATES DATA. It fits nothing, adopts nothing and changes no public artifact. MLB
 * totals stay PAUSED; P331 is not run here.
 *
 * ── WHY NOT data/internal/mlb/linescores/ (what the prerequisite note proposed) ──────────────────────────────
 * That directory is a LIVE PRODUCTION INPUT, not an archive. Two committed consumers read the whole directory and
 * fold every final they find into team run rates that reach the PUBLIC full-game simulations:
 *   · app/scripts/build-mlb-model-inputs.mjs  teamRunRatesBefore()  — filters only by `fileDate < date`, and
 *     "2023-05-04" < "2026-09-16", so three historical seasons would pass that guard;
 *   · app/scripts/ingest-mlb-independent-inputs.mjs  teamRunRates() — no date filter at all.
 * Writing history there would silently change public model inputs, which §6.1 forbids. So the archive lives in its
 * own directory, no live consumer reads it, and a future research session points at it explicitly.
 *
 * ── Storage ─────────────────────────────────────────────────────────────────────────────────────────────────
 *   data/internal/mlb/linescores-history/<season>/<date>.json   one file per date (the established convention)
 *   data/internal/mlb/linescores-history/manifest.json          per-season acquisition provenance + counts
 *   data/internal/research/mlb/reports/finals-history-validation.json   the validation receipt
 *
 * Per-date files carry NO wall-clock timestamp, so re-fetching a completed date reproduces a byte-identical file
 * (the same determinism property app/scripts/fetch-mlb-linescores.mjs deliberately has). Acquisition timestamps
 * live in the manifest, which is where provenance belongs when the data itself is immutable history.
 *
 * ── Honesty rules ───────────────────────────────────────────────────────────────────────────────────────────
 *   · Only genuinely FINAL games with both scores enter the research table (same finality rule as the settlement
 *     parser: abstractGameState Final, coded state not C/D/U, both scores present).
 *   · Only gameType "R" (regular season) enters it; anything else on the same date is counted as excluded, never
 *     silently dropped.
 *   · A malformed payload fails the DATE closed — nothing is written for it and the failure is recorded.
 *   · Missing venue or missing score is recorded as missing. Nothing is imputed, ever.
 *
 * Usage:
 *   node scripts/research/mlb/backfill-mlb-finals-history.mjs                       # dry run, all three seasons
 *   node scripts/research/mlb/backfill-mlb-finals-history.mjs --write               # acquire + write (resumable)
 *   node scripts/research/mlb/backfill-mlb-finals-history.mjs --write --limit 60    # bounded chunk
 *   node scripts/research/mlb/backfill-mlb-finals-history.mjs --validate            # validate what is on disk
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rel = (p) => path.join(ROOT, p);
const argOf = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; };
const has = (f) => process.argv.includes(f);

const HOST = "https://statsapi.mlb.com"; // free, approved, the ONLY host this script contacts
const SCHEMA_VERSION = 1;
const SCRIPT_ID = "backfill-mlb-finals-history@1";
const OUT_DIR = rel("data/internal/mlb/linescores-history");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const VALIDATION = rel("data/internal/research/mlb/reports/finals-history-validation.json");

const SEASONS = (argOf("--seasons") ?? "2023,2024,2025").split(",").map((s) => s.trim()).filter(Boolean);
const WRITE = has("--write");
const REFETCH = has("--refetch");
const VALIDATE_ONLY = has("--validate");
const LIMIT = Number(argOf("--limit") ?? 0) || Infinity;
const DELAY_MS = Number(argOf("--delay") ?? 150);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scheduleUrl = (date) => `${HOST}/api/v1/schedule?sportId=1&date=${date}`;

/** GET JSON with bounded retries. Throws on exhaustion — the caller fails that date closed. */
async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(400 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr ?? new Error("request failed");
}

/** Authoritative regular-season bounds from the source itself — never a hardcoded calendar guess. */
async function seasonBounds(season) {
  const j = await getJson(`${HOST}/api/v1/seasons?sportId=1&season=${season}`);
  const s = j?.seasons?.[0];
  const start = s?.regularSeasonStartDate;
  const end = s?.regularSeasonEndDate;
  if (!start || !end) throw new Error(`season ${season}: no regular-season bounds in payload`);
  return { start, end };
}

function datesBetween(start, end) {
  const out = [];
  for (let d = new Date(`${start}T12:00:00Z`); d <= new Date(`${end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const FINAL_ABSTRACT = "Final";
const NON_RESULT_CODES = new Set(["C", "D", "U"]); // cancelled / postponed / suspended reach "Final" with no result
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * One schedule game → the research record. Mirrors the settlement parser's finality rule exactly, and adds the
 * identity the registered prerequisite needs (venue, team ids, doubleheader, gameType).
 */
function toHistoryGame(g) {
  if (g?.gamePk == null) return null; // malformed row — counted, never guessed
  const abstractState = g?.status?.abstractGameState ?? "Other";
  const homeRuns = num(g?.teams?.home?.score);
  const awayRuns = num(g?.teams?.away?.score);
  const isFinal =
    abstractState === FINAL_ABSTRACT &&
    !NON_RESULT_CODES.has(g?.status?.codedGameState ?? "F") &&
    homeRuns !== null &&
    awayRuns !== null;
  return {
    gamePk: g.gamePk,
    officialDate: g?.officialDate ?? g?.gameDate?.slice?.(0, 10) ?? null,
    season: String(g?.season ?? ""),
    gameType: g?.gameType ?? null,          // "R" = regular season
    doubleHeader: g?.doubleHeader ?? null,  // "N" | "Y" | "S"
    gameNumber: g?.gameNumber ?? null,
    home: { id: g?.teams?.home?.team?.id ?? null, name: g?.teams?.home?.team?.name ?? null },
    away: { id: g?.teams?.away?.team?.id ?? null, name: g?.teams?.away?.team?.name ?? null },
    homeRuns: isFinal ? homeRuns : null,
    awayRuns: isFinal ? awayRuns : null,
    venue: { id: g?.venue?.id ?? null, name: g?.venue?.name ?? null },
    isFinal,
    status: g?.status?.detailedState ?? abstractState,
    abstractState,
  };
}

/** Whole-payload → the date record. Throws on a structurally malformed payload (fail closed). */
function toDateRecord(date, season, payload) {
  if (!payload || !Array.isArray(payload.dates)) throw new Error("payload has no dates[]");
  const raw = [];
  for (const d of payload.dates) {
    if (!Array.isArray(d?.games)) throw new Error("payload date has no games[]");
    for (const g of d.games) raw.push(g);
  }
  let malformed = 0;
  const parsed = [];
  for (const g of raw) {
    const row = toHistoryGame(g);
    if (!row) { malformed += 1; continue; }
    parsed.push(row);
  }
  const regular = parsed.filter((g) => g.gameType === "R");
  /*
   * ONE ROW PER GAME, FILED UNDER ITS OWN OFFICIAL DATE.
   *
   * A game suspended on day D and completed on D+1 appears in the D+1 schedule payload still carrying
   * officialDate D — so walking the payload for D+1 and storing everything files that gamePk a second time.
   * Measured on the first full pull: exactly 14 such rows across 2023-2025, which inflated each season's
   * finals count by its duplicate count (2437/2432/2434 against ~2,430 real regular-season games).
   * Doubleheaders are NOT affected: both games share one officialDate and have distinct gamePks.
   */
  const onThisDate = regular.filter((g) => g.officialDate === date);
  const games = onThisDate.filter((g) => g.isFinal);
  return {
    schemaVersion: SCHEMA_VERSION,
    artifact: "mlb-finals-history",
    dataClass: "PRIVATE_RESEARCH",
    date,
    season: String(season),
    source: "statsapi",
    sourceEndpoint: scheduleUrl(date),
    script: SCRIPT_ID,
    scheduledCount: parsed.length,          // every game the date returned, any type
    regularSeasonCount: regular.length,     // gameType "R"
    finalCount: games.length,               // stored rows
    excludedNonRegular: parsed.length - regular.length,
    excludedOtherOfficialDate: regular.length - onThisDate.length, // belongs to another day's file
    excludedNonFinal: onThisDate.length - games.length,
    malformedRows: malformed,
    games,
  };
}

const seasonDir = (season) => path.join(OUT_DIR, String(season));
const dateFile = (season, date) => path.join(seasonDir(season), `${date}.json`);

function alreadyComplete(season, date) {
  const p = dateFile(season, date);
  if (!fs.existsSync(p)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j?.schemaVersion === SCHEMA_VERSION && j?.artifact === "mlb-finals-history" && String(j?.season) === String(season);
  } catch { return false; }
}

async function acquire() {
  const started = new Date().toISOString();
  const perSeason = [];
  let fetched = 0;
  for (const season of SEASONS) {
    const { start, end } = await seasonBounds(season);
    const dates = datesBetween(start, end);
    let wrote = 0, skipped = 0, stored = 0;
    const failures = [];
    for (const date of dates) {
      if (fetched >= LIMIT) break;
      if (!REFETCH && alreadyComplete(season, date)) { skipped += 1; continue; }
      fetched += 1;
      let rec;
      try {
        rec = toDateRecord(date, season, await getJson(scheduleUrl(date)));
      } catch (e) {
        failures.push({ date, error: String(e).slice(0, 120) });
        console.error(`  ! ${date}: ${String(e).slice(0, 90)} — nothing written`);
        await sleep(DELAY_MS);
        continue;
      }
      stored += rec.finalCount;
      if (WRITE) {
        fs.mkdirSync(seasonDir(season), { recursive: true });
        fs.writeFileSync(dateFile(season, date), JSON.stringify(rec, null, 2) + "\n");
        wrote += 1;
      }
      await sleep(DELAY_MS);
    }
    perSeason.push({ season, regularSeasonStart: start, regularSeasonEnd: end, datesInSeason: dates.length, datesWritten: wrote, datesSkipped: skipped, finalsStoredThisRun: stored, failures });
    console.log(`[finals-history] ${season} ${start}..${end} · ${dates.length} dates · ${WRITE ? "wrote" : "would write"} ${wrote} · skipped ${skipped} · failures ${failures.length}`);
    if (fetched >= LIMIT) { console.log(`[finals-history] --limit ${LIMIT} reached — resumable, rerun to continue`); break; }
  }
  if (WRITE) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      artifact: "mlb-finals-history-manifest",
      dataClass: "PRIVATE_RESEARCH",
      purpose: "Founder-approved (Phase 6) 2023-2025 regular-season finals + venue for FUTURE research. No model reads this yet.",
      source: "MLB StatsAPI (free, no key, no credits)",
      sourceEndpointPattern: `${HOST}/api/v1/schedule?sportId=1&date=<YYYY-MM-DD>`,
      seasonBoundsEndpoint: `${HOST}/api/v1/seasons?sportId=1&season=<YYYY>`,
      script: SCRIPT_ID,
      firstAcquiredAt: prev?.firstAcquiredAt ?? started,
      lastAcquiredAt: new Date().toISOString(),
      runs: [...(prev?.runs ?? []), { startedAt: started, finishedAt: new Date().toISOString(), seasons: perSeason }].slice(-20),
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  }
  if (!WRITE) console.log("  (dry run — pass --write to persist the internal archive)");
  return perSeason;
}

/** Validation over what is ON DISK: counts, coverage, duplicates, gaps. Reproducible, reads no network. */
function validate() {
  const seasons = [];
  const allPks = new Map();
  for (const season of SEASONS) {
    const dir = seasonDir(season);
    if (!fs.existsSync(dir)) { seasons.push({ season, present: false }); continue; }
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    let games = 0, withVenue = 0, withVenueId = 0, missingScore = 0, missingVenue = 0, nonRegular = 0, otherDate = 0, malformed = 0, misfiled = 0;
    const teams = new Set(); const venues = new Set(); const pks = new Set();
    const duplicates = []; const crossSeason = [];
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      nonRegular += j.excludedNonRegular ?? 0;
      otherDate += j.excludedOtherOfficialDate ?? 0;
      malformed += j.malformedRows ?? 0;
      for (const g of j.games ?? []) {
        games += 1;
        // A game filed under a date that is not its own is the mechanism that produced duplicates on the first
        // pull (a suspended game completed the next day). Counted explicitly so the receipt shows it is gone.
        if (g.officialDate !== j.date) misfiled += 1;
        if (pks.has(g.gamePk)) duplicates.push({ gamePk: g.gamePk, date: j.date, officialDate: g.officialDate }); else pks.add(g.gamePk);
        if (allPks.has(g.gamePk) && allPks.get(g.gamePk) !== season) crossSeason.push({ gamePk: g.gamePk, seasons: [allPks.get(g.gamePk), season] });
        else allPks.set(g.gamePk, season);
        if (g.venue?.name) { withVenue += 1; venues.add(g.venue.name); } else missingVenue += 1;
        if (g.venue?.id != null) withVenueId += 1;
        if (typeof g.homeRuns !== "number" || typeof g.awayRuns !== "number") missingScore += 1;
        if (g.home?.id) teams.add(g.home.id);
        if (g.away?.id) teams.add(g.away.id);
      }
    }
    seasons.push({
      season, present: true, dateFiles: files.length,
      dateRange: files.length ? { first: files[0].slice(0, 10), last: files[files.length - 1].slice(0, 10) } : null,
      finalGames: games, distinctGamePks: pks.size, duplicateGamePks: duplicates.length,
      duplicateDetail: duplicates.slice(0, 20), crossSeasonGamePks: crossSeason.length,
      gamesFiledUnderAnotherDate: misfiled,
      venueCoverage: games ? Number((withVenue / games).toFixed(4)) : null, venueIdCoverage: games ? Number((withVenueId / games).toFixed(4)) : null,
      distinctVenues: venues.size, distinctTeams: teams.size,
      missingScore, missingVenue,
      excludedNonRegularSeasonGames: nonRegular, excludedOtherOfficialDate: otherDate, malformedRows: malformed,
    });
  }
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    artifact: "mlb-finals-history-validation",
    dataClass: "PRIVATE_RESEARCH",
    generatedAt: new Date().toISOString(),
    storage: "data/internal/mlb/linescores-history/<season>/<date>.json",
    note: "Acquisition + validation only (Phase 6 P601). No model is fitted, registered or adopted from this data; public MLB totals remain PAUSED. Stored OUTSIDE data/internal/mlb/linescores/ because two live consumers fold that directory into public model inputs.",
    seasons,
    totals: {
      finalGames: seasons.reduce((s, x) => s + (x.finalGames ?? 0), 0),
      duplicateGamePks: seasons.reduce((s, x) => s + (x.duplicateGamePks ?? 0), 0),
      crossSeasonGamePks: seasons.reduce((s, x) => s + (x.crossSeasonGamePks ?? 0), 0),
      gamesFiledUnderAnotherDate: seasons.reduce((s, x) => s + (x.gamesFiledUnderAnotherDate ?? 0), 0),
      missingScore: seasons.reduce((s, x) => s + (x.missingScore ?? 0), 0),
      missingVenue: seasons.reduce((s, x) => s + (x.missingVenue ?? 0), 0),
      excludedOtherOfficialDate: seasons.reduce((s, x) => s + (x.excludedOtherOfficialDate ?? 0), 0),
      excludedNonRegularSeasonGames: seasons.reduce((s, x) => s + (x.excludedNonRegularSeasonGames ?? 0), 0),
      malformedRows: seasons.reduce((s, x) => s + (x.malformedRows ?? 0), 0),
    },
  };
  fs.mkdirSync(path.dirname(VALIDATION), { recursive: true });
  fs.writeFileSync(VALIDATION, JSON.stringify(receipt, null, 2) + "\n");
  for (const s of seasons) {
    console.log(s.present
      ? `[validate] ${s.season}: ${s.finalGames} finals · ${s.dateFiles} dates ${s.dateRange?.first}..${s.dateRange?.last} · venue ${s.venueCoverage} · dupes ${s.duplicateGamePks} · missing score ${s.missingScore} · teams ${s.distinctTeams} · venues ${s.distinctVenues}`
      : `[validate] ${s.season}: no files on disk`);
  }
  console.log(`[validate] receipt → ${path.relative(ROOT, VALIDATION)}`);
  return receipt;
}

async function main() {
  if (!VALIDATE_ONLY) await acquire();
  validate();
}

main();
