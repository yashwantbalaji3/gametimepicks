/**
 * Source loading for the Data Platform builder — the ONLY file that knows where committed source
 * artifacts live. Reads committed files only: no network, no provider call, no refresh.
 *
 * Every artifact read is fingerprinted (sha256 over its bytes) into sources.json, with the source-registry
 * id that governs its use, its data class, and what its timestamps mean.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { sha256Hex, parseJsonl } from "../../src/lib/data-platform/stable-json.mjs";

export const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
export const REPO = path.resolve(APP, "..");
export const PLATFORM_DIR = path.join(REPO, "data", "internal", "platform", "v1");

const rel = (abs) => path.relative(REPO, abs).split(path.sep).join("/");

/** Deterministic listing: sorted by name, never filesystem order. */
const list = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort() : []);

export function createReader() {
  const artifacts = new Map(); // sourceKey → [{path, bytes, sha256}]
  const read = (sourceKey, abs) => {
    const bytes = fs.readFileSync(abs);
    const arr = artifacts.get(sourceKey) ?? [];
    arr.push({ path: rel(abs), bytes: bytes.length, sha256: sha256Hex(bytes) });
    artifacts.set(sourceKey, arr);
    return bytes;
  };
  return {
    json: (key, abs) => JSON.parse(read(key, abs).toString("utf8")),
    gzJson: (key, abs) => JSON.parse(zlib.gunzipSync(read(key, abs)).toString("utf8")),
    jsonl: (key, abs) => parseJsonl(read(key, abs).toString("utf8")),
    artifacts,
  };
}

/** Source descriptors: policy + time semantics per source key. `registry` names lib/sports/source-registry.mjs entries. */
export const SOURCE_DESCRIPTORS = Object.freeze({
  "mlb.finals-history": { registry: "mlb_statsapi", dataClass: "PRIVATE_RESEARCH", timeMeaning: "officialDate = StatsAPI official game date; no instant", role: "2023–2025 regular-season finals" },
  "mlb.linescores": { registry: "mlb_statsapi", dataClass: "INTERNAL", timeMeaning: "officialDate only; files carry no capture time by design", role: "2026 finals" },
  "mlb.statsapi-schedule": { registry: "mlb_statsapi", dataClass: "PUBLIC_PRODUCT", timeMeaning: "games[].gameDate = scheduled first pitch (UTC); capturedAt = fetch time", role: "schedule identity + start" },
  "mlb.boards": { registry: "mlb_statsapi", dataClass: "PUBLIC_PRODUCT", timeMeaning: "games[].gameDate = scheduled first pitch (UTC); board generatedAt ignored", role: "schedule identity + team abbreviations (games[] only; forecast content not read)" },
  "mlb.settled-leans": { registry: "mlb_statsapi", dataClass: "PUBLIC_PRODUCT", timeMeaning: "date = slate date; actual = box-score value read at settlement", role: "player prop actuals (factual `actual` only; projections/leans/outcomes not read)" },
  "nfl.nflverse-games-history": { registry: "nflverse", dataClass: "PRIVATE_RESEARCH", timeMeaning: "date = nflverse gameday (local date); no instant", role: "1999–2025 REG+POST finals with ESPN event ids" },
  "nfl.nflverse-player-games": { registry: "nflverse", dataClass: "PRIVATE_RESEARCH", timeMeaning: "date = gameday", role: "2013–2025 skill-position player-game lines" },
  "nfl.nflverse-id-bridge": { registry: "nflverse", dataClass: "PRIVATE_RESEARCH", timeMeaning: "capturedAt = bridge build time", role: "exact pfr/gsis/espn id crosswalk (identity only)" },
  "nfl.nflverse-current-season": { registry: "nflverse", dataClass: "PRIVATE_RESEARCH", timeMeaning: "date = gameday", role: "2026 finals with ESPN event ids (secondary to ESPN results)" },
  "nfl.espn-player-events": { registry: "espn_site_api_nfl", dataClass: "PRIVATE_RESEARCH", timeMeaning: "dateUtc = kickoff instant", role: "2023–2025 ESPN summary lines + finals" },
  "nfl.espn-schedule": { registry: "espn_scoreboard", dataClass: "PUBLIC_PRODUCT", timeMeaning: "dateUtc = kickoff instant; capturedAt = fetch time", role: "2026 schedule identity" },
  "nfl.espn-results": { registry: "espn_scoreboard", dataClass: "PUBLIC_PRODUCT", timeMeaning: "dateUtc = kickoff; capturedAt = fetch time; STATUS_FINAL rows only", role: "2026 finals" },
  "nfl.espn-rosters": { registry: "espn_site_api_nfl", dataClass: "PUBLIC_PRODUCT", timeMeaning: "generatedAt/sourceAsOf = capture time", role: "athlete identity + current team" },
  "epl.fixtures": { registry: "openfootball", dataClass: "PUBLIC_PRODUCT", timeMeaning: "kickoffIso = scheduled kickoff (UTC); capturedAt = observation", role: "2026-27 fixture identity (shipped event ids)" },
  "epl.espn-player-match": { registry: "espn_scoreboard", dataClass: "PRIVATE_RESEARCH", timeMeaning: "dateUtc = kickoff instant", role: "2022-23 … 2025-26 match identity + player lines" },
  "epl.espn-squads": { registry: "espn_scoreboard", dataClass: "PRIVATE_RESEARCH", timeMeaning: "capturedAt = squad snapshot time", role: "2026-27 athlete + club identity" },
  "ufc.espn-history": { registry: "espn_scoreboard", dataClass: "PRIVATE_RESEARCH", timeMeaning: "dateUtc = bout/card scheduled instant", role: "2023-08 … 2026-08 final bouts" },
  "ufc.espn-schedule": { registry: "espn_scoreboard", dataClass: "PUBLIC_PRODUCT", timeMeaning: "dateUtc = scheduled instant; capturedAt = fetch time", role: "upcoming card + bout identity" },
  "ufc.espn-results": { registry: "espn_scoreboard", dataClass: "PUBLIC_PRODUCT", timeMeaning: "dateUtc = bout instant; capturedAt = fetch time; STATUS_FINAL only", role: "recent final bouts" },
});

// ── MLB ───────────────────────────────────────────────────────────────────────────────────────────
export function loadMlb(reader) {
  const hist = path.join(REPO, "data/internal/mlb/linescores-history");
  const finalsHistory = [];
  for (const season of list(hist, /^\d{4}$/)) {
    for (const f of list(path.join(hist, season), /^\d{4}-\d{2}-\d{2}\.json$/)) finalsHistory.push({ path: f, doc: reader.json("mlb.finals-history", path.join(hist, season, f)) });
  }
  const ls = path.join(REPO, "data/internal/mlb/linescores");
  const linescores = list(ls, /^\d{4}-\d{2}-\d{2}\.json$/).map((f) => ({ path: f, doc: reader.json("mlb.linescores", path.join(ls, f)) }));
  const sch = path.join(APP, "public/data/mlb/statsapi-schedule");
  const schedules = list(sch, /^\d{4}-\d{2}-\d{2}\.json$/).map((f) => ({ path: f, doc: reader.json("mlb.statsapi-schedule", path.join(sch, f)) }));
  const bd = path.join(APP, "public/data/mlb/boards");
  const boards = list(bd, /^\d{4}-\d{2}-\d{2}\.json$/).map((f) => {
    const doc = reader.json("mlb.boards", path.join(bd, f));
    return { path: f, date: f.slice(0, 10), games: doc.games ?? [] };
  });
  const leansPath = path.join(APP, "public/data/mlb/results/settled_leans.jsonl");
  const settledLeans = fs.existsSync(leansPath) ? { path: rel(leansPath), rows: reader.jsonl("mlb.settled-leans", leansPath) } : { rows: [] };
  const cutoffs = {
    "mlb.finals-history": finalsHistory.at(-1)?.doc?.date ?? null,
    "mlb.linescores": linescores.at(-1)?.doc?.date ?? null,
    "mlb.statsapi-schedule": schedules.map((s) => s.doc?.capturedAt).filter(Boolean).sort().at(-1) ?? null,
    "mlb.boards": boards.at(-1)?.date ?? null,
    "mlb.settled-leans": settledLeans.rows.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null,
  };
  return { input: { finalsHistory, linescores, schedules, boards, settledLeans }, cutoffs };
}

// ── NFL ───────────────────────────────────────────────────────────────────────────────────────────
export function loadNfl(reader) {
  const R = (p) => path.join(REPO, p);
  const gamesHistory = reader.json("nfl.nflverse-games-history", R("data/internal/research/nfl/replay/games-history-v2.json"));
  const playerGames = reader.gzJson("nfl.nflverse-player-games", R("data/internal/research/nfl/replay/player-games-v2.json.gz"));
  const idBridge = reader.json("nfl.nflverse-id-bridge", R("data/internal/research/nfl/snap-counts/id-bridge-v1.json"));
  const currentPath = R("data/internal/research/nfl/replay/current-season.json");
  const currentSeason = fs.existsSync(currentPath) ? reader.json("nfl.nflverse-current-season", currentPath) : null;
  const pe = R("data/internal/research/nfl/player-events-v1");
  const playerEvents = list(pe, /^\d{4}\.json$/).map((f) => ({ path: f, doc: reader.json("nfl.espn-player-events", path.join(pe, f)) }));
  const sch = path.join(APP, "public/data/nfl/schedule");
  const schedules = list(sch, /^(capture-.*|latest)\.json$/).map((f) => ({ path: f, doc: reader.json("nfl.espn-schedule", path.join(sch, f)) }));
  const resPath = path.join(APP, "public/data/nfl/results/latest.json");
  const results = fs.existsSync(resPath) ? reader.json("nfl.espn-results", resPath) : null;
  const ro = path.join(APP, "public/data/nfl/rosters");
  const rosters = list(ro, /^(capture-.*|latest)\.json$/).map((f) => ({ path: f, doc: reader.json("nfl.espn-rosters", path.join(ro, f)) }));
  const cutoffs = {
    "nfl.nflverse-games-history": gamesHistory?.games?.at(-1)?.[3] ?? null,
    "nfl.nflverse-current-season": currentSeason?.capturedAt ?? null,
    "nfl.espn-player-events": playerEvents.at(-1)?.doc?.games?.map((g) => g.dateUtc).sort().at(-1) ?? null,
    "nfl.espn-schedule": schedules.map((s) => s.doc?.generatedAt).filter(Boolean).sort().at(-1) ?? null,
    "nfl.espn-results": results?.generatedAt ?? null,
    "nfl.espn-rosters": rosters.map((s) => s.doc?.generatedAt).filter(Boolean).sort().at(-1) ?? null,
    "nfl.nflverse-id-bridge": idBridge?.capturedAt ?? null,
  };
  return { input: { gamesHistory, playerGames, idBridge, currentSeason, playerEvents, schedules, results, rosters }, cutoffs };
}

// ── EPL ───────────────────────────────────────────────────────────────────────────────────────────
export function loadEpl(reader) {
  const fx = path.join(APP, "public/data/soccer/epl/fixtures");
  const fixtureCaptures = list(fx, /^capture-.*\.json$/).map((f) => ({ path: f, doc: reader.json("epl.fixtures", path.join(fx, f)) }));
  const espnPlayerRows = reader.jsonl("epl.espn-player-match", path.join(REPO, "data/internal/research/epl/players/espn-players-v1.jsonl"));
  const squads = reader.json("epl.espn-squads", path.join(REPO, "data/internal/research/epl/players/squads-2026-27.json"));
  const cutoffs = {
    "epl.fixtures": fixtureCaptures.at(-1)?.doc?.generatedAt ?? null,
    "epl.espn-player-match": espnPlayerRows.map((r) => r.dateUtc).filter(Boolean).sort().at(-1) ?? null,
    "epl.espn-squads": squads?.capturedAt ?? null,
  };
  return { input: { fixtureCaptures, espnPlayerRows, squads }, cutoffs };
}

// ── UFC ───────────────────────────────────────────────────────────────────────────────────────────
export function loadUfc(reader) {
  const history = reader.json("ufc.espn-history", path.join(REPO, "data/internal/research/ufc/corpus-v1.json"));
  const sch = path.join(APP, "public/data/ufc/schedule");
  const scheduleCaptures = list(sch, /^capture-.*\.json$/).map((f) => ({ path: f, doc: reader.json("ufc.espn-schedule", path.join(sch, f)) }));
  const resPath = path.join(APP, "public/data/ufc/results/latest.json");
  const results = fs.existsSync(resPath) ? reader.json("ufc.espn-results", resPath) : null;
  const cutoffs = {
    "ufc.espn-history": history?.rows?.map((r) => r.dateUtc).sort().at(-1) ?? null,
    "ufc.espn-schedule": scheduleCaptures.at(-1)?.doc?.generatedAt ?? null,
    "ufc.espn-results": results?.generatedAt ?? null,
  };
  return { input: { history, scheduleCaptures, results }, cutoffs };
}
