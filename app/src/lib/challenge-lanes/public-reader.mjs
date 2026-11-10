/**
 * CHALLENGE LANES · THE ONE PUBLIC READER. Node fs. The website and the graphics renderer both load lane files through
 * this (SPEC rev 2 §3), so they read the same verified bytes and cannot diverge. It returns the projection exactly as
 * `laneProjection` (projection.mjs) wrote it, or a refusal; it never repairs or recomputes a file.
 */
import fs from "node:fs";
import path from "node:path";
import { LANES, LANE_IDS } from "./lanes.mjs";
import { verifyLaneProjection } from "./projection.mjs";

export const PUBLIC_LANE_DIR = path.join("public", "data", "challenge-lanes");

/** `{ ok: true, doc }` or `{ ok: false, laneId, refusal }` — MISSING, UNREADABLE, UNVERIFIED or WRONG_LANE. */
export function readLaneProjection({ appDir = process.cwd(), laneId, dir = path.join(appDir, PUBLIC_LANE_DIR) }) {
  if (!LANES[laneId]) return { ok: false, laneId, refusal: "UNKNOWN_LANE" };
  const file = path.join(dir, `${laneId}.json`);
  if (!fs.existsSync(file)) return { ok: false, laneId, refusal: "MISSING" };
  let doc; try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { ok: false, laneId, refusal: "UNREADABLE" }; }
  if (!verifyLaneProjection(doc)) return { ok: false, laneId, refusal: "UNVERIFIED" };
  const L = LANES[laneId];
  if (doc.laneId !== laneId || doc.product !== L.product || doc.steps !== L.steps || doc.baseCents !== L.baseCents || doc.targetCents !== L.targetCents) return { ok: false, laneId, refusal: "WRONG_LANE" };
  return { ok: true, doc };
}

/** All four lanes, keyed by laneId, in post order (bb-a, bb-b, ms-a, ms-b). */
export const readAllLaneProjections = (opts = {}) => Object.fromEntries(LANE_IDS.map((laneId) => [laneId, readLaneProjection({ ...opts, laneId })]));
