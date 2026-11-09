/** The product's two lanes (A then B) through the engine's public reader, as lane-status views; a refused file says so. */
import { readLaneProjection } from "../../challenge-lanes/public-reader.mjs";
import { LANES, LANE_IDS } from "../../challenge-lanes/lanes.mjs";
import { laneStatusView } from "./lane-status.mjs";

export function loadProductLaneStatus(product, { appDir = process.cwd() } = {}) {
  return LANE_IDS.filter((id) => LANES[id].product === product).map((laneId) => {
    const r = readLaneProjection({ appDir, laneId });
    return r.ok ? { ok: true, view: laneStatusView(r.doc) } : { ok: false, laneId, reason: r.refusal };
  });
}
