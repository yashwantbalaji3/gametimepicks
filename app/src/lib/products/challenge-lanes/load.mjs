/**
 * THE ONE VERIFYING LOADER for the public challenge-lane projection (BBM V2, SPEC §5). Every lane the site shows goes
 * through loadChallengeLane: app/public/data/challenge-lanes/<laneId>.json (the engine's gtp.challenge-lane.public@1),
 * accepted by acceptLaneProjection (the engine's verifyLaneProjection, then lane, fixture and no-price refusals). Absent or refused → an explicit "record not
 * published" lane, never a guess. Node-only, read-only.
 */
import fs from "node:fs";
import path from "node:path";
import { LANE_IDS, lanesOf, laneView, unavailableLaneView, acceptLaneProjection } from "./lane.mjs";

export const challengeLanePath = (appDir, laneId) => path.join(appDir, "public", "data", "challenge-lanes", `${laneId}.json`);

/** { doc, view } for a verified file, or { doc: null, view: <unavailable>, reason }. */
export function loadChallengeLane({ appDir = process.cwd(), laneId, readFile = (p) => fs.readFileSync(p, "utf8") }) {
  if (!LANE_IDS.includes(laneId)) throw new Error(`unknown lane ${laneId}`);
  let doc;
  try { doc = JSON.parse(readFile(challengeLanePath(appDir, laneId))); } catch {
    return { doc: null, view: unavailableLaneView(laneId, "The lane record has not been published yet."), reason: "no file" };
  }
  const v = acceptLaneProjection(doc, { laneId });
  if (!v.ok) return { doc: null, view: unavailableLaneView(laneId, "The lane record did not pass verification, so it is not shown."), reason: v.reason };
  return { doc, view: laneView(doc), reason: null };
}

/** Both lanes of a product, A then B, through the one loader. */
export function loadProductLanes(product, opts = {}) {
  return lanesOf(product).map((laneId) => loadChallengeLane({ ...opts, laneId }).view);
}
