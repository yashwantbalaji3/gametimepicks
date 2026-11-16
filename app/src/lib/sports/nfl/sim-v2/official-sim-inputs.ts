/**
 * NFL SIMULATION PAGE · THE OFFICIAL INPUTS (ledger N14; founder rule 2026-10-20 / 11-11: one official forecast
 * everywhere). What /nfl/simulation/<id>/ prints as official, read through the SAME sources as /nfl/game/<id>/:
 *
 *   - the game's forecast of record exactly as the game page selects it (src/app/nfl/game/[eventId]/page.tsx): the live
 *     union of latest.json with frozen-latest.json, and, once the week has rolled and the game is in neither, the
 *     ARCHIVED pre-kickoff revision named by the graded record (archived-forecast.ts archivedForecastFor, P320);
 *   - the game headline built like the game hero's record: the forecast view's record when there is one, overlaid with
 *     the forecast summary's win probability, projected score, margin and total (game page `record={{ ...(view?.record
 *     ?? …), winProbability: s.winProbability, … }}`), then formatted by officialGameLine;
 *   - the player rows from the forecast view (loadForecastView → nflOfficialDefault), the game page's player source. An
 *     archived game has no view on the game page either, so it has no official player rows here (none is invented).
 *
 * Server-only (fs). Nothing simulated is read except the receipt's team abbreviations and position tags.
 */
import fs from "node:fs";
import path from "node:path";

import { loadForecastView } from "../forecast-view-load.mjs";
import { unionFrozenForecasts } from "../public-forecast-union.mjs";
import { nflPublicRecordResolver } from "../public-record.mjs";
import { archivedForecastFor } from "../archived-forecast";
import { nflOfficialDefault } from "../../../simulation-theater/official-default.mjs";
import { officialGameLine, officialPlayerLines } from "./official-player-lines.mjs";

export type OfficialSimOptions = {
  /** the app's public/ directory (the game page reads `public/data/nfl/...` under it) */
  publicDir: string;
  /** the repository root (excluded-record resolution); default publicDir/../.. */
  repoRoot?: string;
  /** the per-revision forecast receipts (archive fallback); default the archive module's own */
  receiptsRoot?: string;
};

const readJson = (p: string) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The game page's forecast of record for one event: live union first, else the archived pre-kickoff revision. */
export function nflGameForecastOfRecord(eventId: string, { publicDir, repoRoot = path.resolve(publicDir, "..", ".."), receiptsRoot }: OfficialSimOptions) {
  const data = path.join(publicDir, "data");
  const union = unionFrozenForecasts(readJson(path.join(data, "nfl/forecasts/latest.json")), readJson(path.join(data, "nfl/forecasts/frozen-latest.json")), { resolve: nflPublicRecordResolver(repoRoot) });
  const live = (union?.forecasts ?? []).find((x: { providerEventId: unknown }) => String(x.providerEventId) === String(eventId));
  if (live) return { forecast: live, source: "live" as const };
  const archived = archivedForecastFor(data, String(eventId), receiptsRoot ? { receiptsRoot } : {});
  return archived ? { forecast: archived.forecast as any, source: "archive" as const } : null;
}

/** Everything official the simulation report prints, from the game page's own sources. */
export function officialSimInputs(receipt: unknown, eventId: string, opts: OfficialSimOptions) {
  const repoRoot = opts.repoRoot ?? path.resolve(opts.publicDir, "..", "..");
  const view = loadForecastView(opts.publicDir, eventId, { repoRoot });
  const of = nflGameForecastOfRecord(eventId, { ...opts, repoRoot });
  const f = of?.forecast;
  const s = f?.forecastSummary;
  const game = f && s?.winProbability
    ? officialGameLine({
      providerEventId: f.providerEventId, away: f.away, home: f.home,
      // the game hero's record, built exactly as the game page builds it
      record: { ...(view?.record ?? { favourite: s.winProbability.home >= s.winProbability.away ? f.home.abbr : f.away.abbr, generatedAt: f.generatedAt }), winProbability: s.winProbability, projectedScore: s.projectedScore, margin: s.margin, total: s.total },
    })
    : null;
  return { lines: officialPlayerLines(receipt, nflOfficialDefault(view)), game, source: of?.source ?? null };
}
