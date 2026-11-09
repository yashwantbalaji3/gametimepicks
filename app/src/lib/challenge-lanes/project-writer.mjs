/**
 * CHALLENGE LANES · THE PROJECTION WRITER (BBM-01). The one place that writes the public lane files
 * (app/public/data/challenge-lanes/<laneId>.json): `lanes-reconcile --project-only` and every lanes command call it.
 * Deterministic: each file is serializeProjection(laneProjection(chain)), a pure function of the verified private chain,
 * with its head sha embedded (chainHeadSha256) and no wall-clock field. Deleting the files and regenerating them from
 * the same chain gives identical bytes.
 */
import fs from "node:fs";
import path from "node:path";
import { LANE_IDS } from "./lanes.mjs";
import { readRuns } from "./store.mjs";
import { laneProjection, serializeProjection } from "./projection.mjs";

export function writeLaneProjections({ root, outDir, laneIds = LANE_IDS }) {
  const out = {};
  fs.mkdirSync(outDir, { recursive: true });
  for (const laneId of laneIds) {
    const runs = readRuns(root, laneId);
    if (!runs.length) continue;
    const doc = laneProjection(laneId, runs); // throws on a broken chain: nothing is written for that lane
    const file = path.join(outDir, `${laneId}.json`);
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, serializeProjection(doc)); fs.renameSync(tmp, file);
    out[laneId] = { file, projectionSha256: doc.contentSha256, chainHeadSha256: doc.chainHeadSha256 };
  }
  return out;
}
