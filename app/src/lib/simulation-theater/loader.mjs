/**
 * SIMULATION THEATER V2 · LOADER — the only I/O in the theater library. Server side, build time only.
 *
 * Reads the committed shadow receipts under data/internal/research/nfl/sim-v2/shadow/ (READ ONLY — receipts are
 * write-once and never modified here), resolves the receipt of record per event with the SAME rule the public
 * simulation page uses (latest generated before kickoff, fail closed: public-receipt.mjs), and adapts it.
 */
import fs from "node:fs";
import path from "node:path";

import { readShadowReceipts, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { nflOfficial, withNflRepresentative } from "./official-representative.mjs";
import { officialSnapshotFor } from "../sports/nfl/forecast-view-load.mjs";
import { unionFrozenForecasts } from "../sports/nfl/public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../sports/nfl/public-record.mjs";
import { readWorldModelArtifacts } from "../sports/nfl/world-model-v2/read.mjs";

/**
 * OFFICIAL FORECAST INPUTS (Cross-Product Prediction Consistency, 2026-10-20). The Theater's default run is the stored run
 * closest to the OFFICIAL forecast (official-representative.mjs). The official NFL snapshot is built from the same
 * committed sources as lib/consistency/audit.mjs: every forecast receipt of the event under data/internal/nfl/forecast-
 * receipts/<date>/<id>[-rev-HHMMZ].json (the forecast of record = latest strictly before kickoff, forecastOfRecord) and
 * the event's player board app/public/data/nfl/player-board/<id>.json. READ ONLY. Missing or unreadable inputs make the
 * snapshot refuse (typed), and the Theater then labels every run a hypothetical what-if.
 */
export const NFL_FORECAST_RECEIPTS_DIR = "data/internal/nfl/forecast-receipts";
export const NFL_PLAYER_BOARD_DIR = "app/public/data/nfl/player-board";

export function readNflOfficialInputs(repoRoot, eventId) {
  const id = String(eventId);
  const receipts = [];
  const root = path.join(repoRoot, NFL_FORECAST_RECEIPTS_DIR);
  let days = [];
  try { days = fs.readdirSync(root).sort(); } catch { days = []; }
  for (const d of days) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, d)).sort(); } catch { continue; }
    for (const f of files) {
      if (!(f === `${id}.json` || (f.startsWith(`${id}-rev-`) && f.endsWith(".json")))) continue;
      try {
        receipts.push({ file: `${NFL_FORECAST_RECEIPTS_DIR}/${d}/${f}`, receipt: JSON.parse(fs.readFileSync(path.join(root, d, f), "utf8")) });
      } catch { /* an unreadable receipt is simply not a candidate */ }
    }
  }
  let playerBoard = null;
  const boardRel = `${NFL_PLAYER_BOARD_DIR}/${id}.json`;
  try { playerBoard = { path: boardRel, doc: JSON.parse(fs.readFileSync(path.join(repoRoot, boardRel), "utf8")) }; } catch { playerBoard = null; }
  return { receipts, playerBoard };
}

/**
 * ONE OFFICIAL FORECAST (Track C, 2026-10-29). The game page reads the official snapshot through the forecast-view loader
 * (lib/sports/nfl/forecast-view-load.mjs: the public forecast union latest ∪ frozen-latest → officialSnapshotFor with the
 * raw player board and the World Model artifact). The Theater used to rebuild it from the internal receipts instead: the
 * same numbers, but a DIFFERENT snapshotId (CAR @ GB 401873023: game page f993be25…, Theater 9b927788…), so the two
 * pages named two snapshots for one forecast. The Theater now uses the game page's accessor whenever the game page has
 * the event; only an event the public union no longer carries (a settled week) falls back to the receipt path.
 * @returns {{ snapshot: object|null, refusal: object|null, source: "GAME_PAGE_ACCESSOR"|"FORECAST_RECEIPTS" }}
 */
export function nflGamePageOfficial(repoRoot, eventId) {
  const id = String(eventId);
  const publicDir = path.join(repoRoot, "app", "public");
  const data = path.join(publicDir, "data", "nfl");
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const art = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(repoRoot) });
  const f = (art?.forecasts ?? []).find((x) => String(x.providerEventId) === id) ?? null;
  if (!f) return null;
  const world = readWorldModelArtifacts(publicDir).find((a) => String(a.identity?.providerEventId) === id) ?? null;
  const { snapshot, refusal } = officialSnapshotFor(f, readJson(path.join(data, "player-board", `${id}.json`)), world);
  return { snapshot, refusal: refusal ? { code: refusal, message: `game-page official snapshot refused: ${refusal}` } : null, source: "GAME_PAGE_ACCESSOR" };
}

/** The official snapshot (or its typed refusal) for one event: the game page's accessor first (see above). */
export function nflTheaterOfficial(repoRoot, eventId) {
  return nflGamePageOfficial(repoRoot, eventId) ?? { ...nflOfficial(String(eventId), readNflOfficialInputs(repoRoot, eventId)), source: "FORECAST_RECEIPTS" };
}

/**
 * Development fixtures (spec S12: a FIXED list of ≤3 event ids, so a dev build adds at most three pages).
 *   401873008  WSH @ SF — the spec's reference receipt: run #428 hits both quarter-boundary cases (drives 10 and 15)
 *              and its drive 19 is "end of regulation".
 *   401873005  BUF @ LV — a LOW_SCORING run with an ENGINE_CLOCK_RUNOFF drive (1,602 s on 3 plays) and an overtime
 *              MEDIAN_LIKE run alongside the OVERTIME pick.
 *   401873006  LAC @ KC — two kinds share one run (UPSET = OVERTIME), so the selector shows a merged chip (S5).
 * Every fixture carries an OVERTIME representative. A fixture whose receipt of record fails to load or validate is
 * dropped (never substituted).
 *
 * RE-PINNED 2026-10-19 (integration onto main 9b6e923c1a). The notes above describe the receipts the prototype was built
 * on (2026-10-17). The receipt of RECORD moves whenever the shadow job writes a newer pre-kickoff receipt; on main it is
 * now 401873008 → 2026-10-19/…93e33ba709b93f85 (default run #48, no run #428), 401873005 → 2026-10-18/…3951d5992642d372
 * (UPSET = OVERTIME share run #16, a merged chip) and 401873006 → 2026-10-18/…886fa90906706f3b (five distinct runs).
 * Tests that assert on specific runs pin the write-once 2026-10-17 files by path; the e2e spec derives its expectations
 * from whatever record this loader resolves.
 */
export const FIXTURE_EVENT_IDS = Object.freeze(["401873008", "401873005", "401873006"]);
export const MAX_FIXTURES = 3;

/** All receipts on disk, adapted. For tests and reports. */
export function adaptAllReceipts(repoRoot) {
  return readShadowReceipts(repoRoot).map(({ file, receipt }) => ({ file, ...adaptReceipt(receipt, { file }) }));
}

/**
 * The theater for one event's receipt of record, with `manifest.representative` (the official representative and the
 * hypothetical what-ifs). `official` overrides the snapshot read from disk (tests).
 * @returns {{ eventId: string, file: string|null, ok: boolean, error: {code:string, reason:string}|null, manifest: object|null, showable: boolean }}
 */
export function loadTheater(repoRoot, eventId, entries = null, official = null) {
  const all = entries ?? readShadowReceipts(repoRoot);
  const rec = simulationOfRecord(all, eventId);
  if (!rec) return { eventId: String(eventId), file: null, ok: false, error: { code: "NO_RECEIPT", reason: "no receipt generated before kickoff" }, manifest: null, showable: false };
  const a = adaptReceipt(rec.receipt, { file: rec.file });
  const manifest = a.ok ? withNflRepresentative(a.manifest, rec.receipt, official ?? nflTheaterOfficial(repoRoot, eventId)) : a.manifest;
  return { eventId: String(eventId), file: rec.file, ok: a.ok, error: a.ok ? null : a.error, manifest, showable: rec.showable };
}

/** True when the fixture's receipt of record adapts and every one of its samples validates. */
export function fixtureUsable(t) {
  return Boolean(t?.ok && t.showable && t.manifest?.samples?.length && t.manifest.samples.every((s) => s.validation.ok));
}

/** The fixture ids that are usable right now, in FIXTURE_EVENT_IDS order, capped at MAX_FIXTURES. */
export function usableFixtures(repoRoot) {
  const entries = readShadowReceipts(repoRoot);
  return FIXTURE_EVENT_IDS.filter((id) => fixtureUsable(loadTheater(repoRoot, id, entries))).slice(0, MAX_FIXTURES);
}
