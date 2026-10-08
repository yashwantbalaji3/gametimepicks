/**
 * Build-time loader for the NFL forecast view (forecast-view.mjs): reads the committed forecast of record (live union
 * with the frozen pre-kickoff revisions), the World Model V2 artifacts and the player boards, and returns one view per
 * game. Every public NFL surface that shows a forecast number calls this, so they cannot read different files.
 */
import fs from "node:fs";
import path from "node:path";

import { gameView } from "./forecast-view.mjs";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { readWorldModelArtifacts } from "./world-model-v2/read.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** @param {string} publicDir the app's public/ directory */
export function loadForecastViews(publicDir) {
  const data = path.join(publicDir, "data/nfl");
  const art = unionFrozenForecasts(readJson(path.join(data, "forecasts/latest.json")), readJson(path.join(data, "forecasts/frozen-latest.json")));
  const worlds = new Map(readWorldModelArtifacts(publicDir).map((a) => [a.identity.providerEventId, a]));
  return (art?.forecasts ?? [])
    .map((f) => gameView({ forecast: f, world: worlds.get(String(f.providerEventId)) ?? null, board: readJson(path.join(data, "player-board", `${f.providerEventId}.json`)) }))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.providerEventId.localeCompare(b.providerEventId));
}

export function loadForecastView(publicDir, eventId) {
  return loadForecastViews(publicDir).find((v) => v.providerEventId === String(eventId)) ?? null;
}
