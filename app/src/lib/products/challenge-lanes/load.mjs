/**
 * THE SITE'S LANE LOADER (BBM V2, SPEC rev 2 §3, §6). Every lane the site shows is read by the engine's ONE public
 * reader (lib/challenge-lanes/public-reader.mjs readLaneProjection, the same call the graphics make), then refused by
 * the site if it is a fixture or carries anything priced (acceptLaneProjection), then folded by the engine's ONE
 * laneDisplay inside laneView. Absent or refused → an explicit "record not published" lane, never a guess.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { LANE_IDS, lanesOf, laneView, unavailableLaneView, acceptLaneProjection } from "./lane.mjs";
import { readLaneProjection } from "../../challenge-lanes/public-reader.mjs";
import { bestInk } from "../../simulation-theater/nba/nba-team-colors.mjs";

/** The NBA team colour DATA (names + listed colours), read server-side like the theater's loader; null if unreadable. */
export function readTeamColours(appDir = process.cwd()) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(appDir, "src", "lib", "simulation-theater", "nba", "nba-team-colors.json"), "utf8"));
    return { teams: data.teams, aliases: data.aliases, inkFor: (fill) => bestInk(data, fill) };
  } catch { return null; }
}

/** bb-social condition 2: show a lane graphic only when the repo file's bytes are the bytes the engine recorded. */
export const imageVerifiedIn = (appDir) => (imagePath, sha) => {
  try { return createHash("sha256").update(fs.readFileSync(path.join(appDir, "public", imagePath))).digest("hex") === sha; } catch { return false; }
};

/** { doc, view } for an accepted file, or { doc: null, view: <unavailable>, reason }. */
export function loadChallengeLane({ appDir = process.cwd(), laneId }) {
  if (!LANE_IDS.includes(laneId)) throw new Error(`unknown lane ${laneId}`);
  const r = readLaneProjection({ appDir, laneId });
  if (!r.ok) {
    const missing = r.refusal === "MISSING";
    return { doc: null, view: unavailableLaneView(laneId, missing ? "The lane record has not been published yet." : "The lane record did not pass verification, so it is not shown."), reason: r.refusal };
  }
  const v = acceptLaneProjection(r.doc, { laneId });
  if (!v.ok) return { doc: null, view: unavailableLaneView(laneId, "The lane record did not pass verification, so it is not shown."), reason: v.reason };
  return { doc: r.doc, view: laneView(r.doc, { teams: readTeamColours(appDir), imageVerified: imageVerifiedIn(appDir) }), reason: null };
}

/** Both lanes of a product, A then B, through the one loader. */
export function loadProductLanes(product, opts = {}) {
  return lanesOf(product).map((laneId) => loadChallengeLane({ ...opts, laneId }).view);
}
