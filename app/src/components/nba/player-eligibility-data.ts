/**
 * Server-only reader of the committed per-slate eligibility file (lib/sports/nba/lane-eligibility.mjs) for one ET slate
 * date: app/public/data/nba/player-eligibility/<date>.json. Only consulted with GTP_NBA_SITE_SHARED_ELIGIBILITY=1.
 * Absent → MODEL_REVIEW_ONLY; unreadable or foreign → MALFORMED (fail closed).
 */
import fs from "node:fs";
import path from "node:path";
import { eligibilityInputs, eligibleLaneView, siteEligibilityEnabled } from "@/lib/sports/nba/lane-eligibility.mjs";
import type { Snapshot } from "@/components/nba/experimental-lane";

const file = (date: string) => path.join(process.cwd(), "public", "data", "nba", "player-eligibility", `${date}.json`);

function readDoc(date: string): unknown {
  const p = file(date);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return { schema: "unreadable" }; }
}

/** The eligibility VIEW of the current lane, or null when the switch is off (the page then uses the lane unchanged). */
export function loadEligibleLaneView(lane: Snapshot | null): { snapshot: Snapshot; basis: string } | null {
  if (!siteEligibilityEnabled() || !lane?.date) return null;
  const view = eligibleLaneView(lane, eligibilityInputs(readDoc(lane.date), lane.date));
  return { snapshot: view.snapshot as Snapshot, basis: view.basis };
}

/** One game's eligibility VIEW (the game page), or null when the switch is off or the game has no lane row. */
export function loadEligibleGameView(date: string | null, laneGame: Snapshot["games"][number] | null): Snapshot["games"][number] | null {
  if (!siteEligibilityEnabled() || !date || !laneGame) return null;
  const view = eligibleLaneView({ date, games: [laneGame] }, eligibilityInputs(readDoc(date), date));
  return (view.snapshot as { games: Snapshot["games"] }).games[0] ?? null;
}
