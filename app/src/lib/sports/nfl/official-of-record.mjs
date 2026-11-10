/**
 * NFL OFFICIAL FORECAST OF RECORD — the ONE selector every surface asks (CANON-01, founder 2026-11-09).
 *
 * Which forecast an NFL game "officially" had, and its snapshot (lib/sports/nfl/forecast-view-load.mjs officialSnapshotFor:
 * the forecast revision + the raw player board + the World Model supporting simulation):
 *   LIVE             the game is in the public forecast union (latest ∪ frozen-latest) — what the game page reads
 *   ARCHIVED_RECORD  the week rolled: the revision the graded record names (archived-forecast.ts archivedForecastFor,
 *                    P320 / PR 1267) — what the settled game page and grading read
 *   null             neither: no official forecast is shown (never rebuilt from a neighbouring revision)
 *
 * WHY. Until 2026-11-09 the Simulation Theater rebuilt a settled game's official snapshot from the internal receipts with
 * a second builder (official-representative.mjs nflOfficial). It picked the same revision as the game page but left out
 * the World Model source and hashed differently, so 58 of 58 settled games with a Theater page named a different snapshot
 * than their game page (CAR @ GB 401873023: 47d5131f… vs f6fccaa4…). One selector, one builder, one id.
 *
 * FORWARD ONLY. Nothing here picks a revision: the live union and the archive are the committed records, and the archive's
 * revision is the one the graded record names. Whether that revision was the one Production served before kickoff
 * (Option B) is audited separately (scripts/nfl/audit-served-forecast-of-record.mjs); a historical mismatch is reported,
 * never corrected here.
 */
import fs from "node:fs";
import path from "node:path";
import { officialSnapshotFor } from "./forecast-view-load.mjs";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { nflPublicRecordResolver } from "./public-record.mjs";
import { readWorldModelArtifacts } from "./world-model-v2/read.mjs";
import { archivedForecastFor } from "./archived-forecast.ts";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @param {string} publicDir  the app's public directory (app/public)
 * @param {string|number} eventId
 * @returns {{ basis: "LIVE"|"ARCHIVED_RECORD", forecast: object, snapshot: object|null, refusal: string|null, archived?: object } | null}
 */
export function nflOfficialOfRecord(publicDir, eventId) {
  const id = String(eventId);
  const data = path.join(publicDir, "data", "nfl");
  const repoRoot = path.resolve(publicDir, "..", "..");
  const board = readJson(path.join(data, "player-board", `${id}.json`));
  const world = readWorldModelArtifacts(publicDir).find((a) => String(a.identity?.providerEventId) === id) ?? null;
  const union = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(repoRoot) });
  const live = (union?.forecasts ?? []).find((x) => String(x.providerEventId) === id) ?? null;
  if (live) return { basis: "LIVE", forecast: live, ...officialSnapshotFor(live, board, world) };
  const archived = archivedForecastFor(path.join(publicDir, "data"), id);
  if (!archived) return null;
  return { basis: "ARCHIVED_RECORD", forecast: archived.forecast, archived, ...officialSnapshotFor(archived.forecast, board, world) };
}
