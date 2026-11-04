/**
 * NBA FORECAST GUARD · BUILD INPUTS (node only; the publish step and the builder script — never a page). Reads the
 * committed 2026-27 box scores and builds a slate's guard document from them (forecast-guard.mjs buildForecastGuard).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildForecastGuard } from "./forecast-guard.mjs";

export const BOXSCORE_DIR = "data/internal/research/nba/experimental/boxscores";

/**
 * Every committed box-score doc (top level of BOXSCORE_DIR; corrections/ are not inputs) with each file's sha256.
 * @returns {{ docs: any[], shaById: Map<string, string> }}
 */
export function readBoxscoreDocs(repoRoot) {
  const dir = path.join(repoRoot, BOXSCORE_DIR);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort(); } catch { return { docs: [], shaById: new Map() }; }
  const docs = []; const shaById = new Map();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f));
    let d; try { d = JSON.parse(raw.toString("utf8")); } catch { continue; }
    docs.push(d);
    shaById.set(String(d.providerEventId), createHash("sha256").update(raw).digest("hex"));
  }
  return { docs, shaById };
}

/** sha256 over the selected inputs, in order: "<eventId> <file sha256>\n" per box score. */
export function inputsDigest(eventIds, shaById) {
  const h = createHash("sha256");
  for (const id of eventIds) h.update(`${id} ${shaById.get(String(id)) ?? "MISSING"}\n`);
  return { count: eventIds.length, sha256: h.digest("hex") };
}

/** The guard document for a lane, from the committed box scores, with the digest of the files it selected. */
export function buildGuardFromRepo(repoRoot, lane) {
  const { docs, shaById } = readBoxscoreDocs(repoRoot);
  const first = buildForecastGuard({ lane, boxscores: docs });
  return buildForecastGuard({ lane, boxscores: docs, inputs: inputsDigest(first.inputs.boxscores.events, shaById) });
}
