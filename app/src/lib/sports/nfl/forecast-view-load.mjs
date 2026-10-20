/**
 * Build-time loader for the NFL forecast view (forecast-view.mjs): reads the committed forecast of record (live union
 * with the frozen pre-kickoff revisions), the World Model V2 artifacts and the player boards, builds the OFFICIAL
 * forecast snapshot per game (lib/consistency/official-snapshot.mjs `nflOfficialSnapshot` — the player board is the
 * official player projection; World Model V2 is attached only as a SUPPORTING_SIMULATION source), and returns one view
 * per game. Every public NFL surface that shows a forecast number calls this, so they cannot read different files.
 *
 * Server-only (fs + node:crypto via the snapshot). The snapshot's record is the same public forecast object the hero
 * renders, so the game outcome and the player rows come from one revision.
 */
import fs from "node:fs";
import path from "node:path";

import { gameView } from "./forecast-view.mjs";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { readWorldModelArtifacts } from "./world-model-v2/read.mjs";
import { nflOfficialSnapshot, SnapshotRefusal } from "../../consistency/official-snapshot.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * The official snapshot for one public forecast. A refusal (no pre-kickoff record, no board, a board written at or
 * after kickoff …) is returned as its typed code: the view then shows "No official projection", never a stand-in.
 */
export function officialSnapshotFor(forecast, board, world = null) {
  try {
    return {
      snapshot: nflOfficialSnapshot(String(forecast.providerEventId), {
        receipts: [{ file: "app/public/data/nfl/forecasts (latest ∪ frozen-latest)", receipt: forecast }],
        playerBoard: board ? { path: `app/public/data/nfl/player-board/${forecast.providerEventId}.json`, doc: board } : null,
        worldModel: world ? { path: `app/public/data/nfl/world-model-v2/${forecast.providerEventId}.json`, doc: world } : null,
      }),
      refusal: null,
    };
  } catch (e) {
    if (e instanceof SnapshotRefusal) return { snapshot: null, refusal: e.code };
    throw e;
  }
}

/** @param {string} publicDir the app's public/ directory */
export function loadForecastViews(publicDir) {
  const data = path.join(publicDir, "data/nfl");
  const art = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")));
  const worlds = new Map(readWorldModelArtifacts(publicDir).map((a) => [a.identity.providerEventId, a]));
  return (art?.forecasts ?? [])
    .map((f) => {
      const world = worlds.get(String(f.providerEventId)) ?? null;
      const board = readJson(path.join(data, "player-board", `${f.providerEventId}.json`));
      const { snapshot, refusal } = officialSnapshotFor(f, board, world);
      return gameView({ forecast: f, world, board, official: snapshot, officialRefusal: refusal });
    })
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.providerEventId.localeCompare(b.providerEventId));
}

export function loadForecastView(publicDir, eventId) {
  return loadForecastViews(publicDir).find((v) => v.providerEventId === String(eventId)) ?? null;
}
