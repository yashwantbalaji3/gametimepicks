/**
 * Server-only reader of the committed per-slate eligibility file (lib/sports/nba/lane-eligibility.mjs) for one ET slate
 * date: app/public/data/nba/player-eligibility/<date>.json. Only consulted with GTP_NBA_SITE_SHARED_ELIGIBILITY=1.
 * Absent → MODEL_REVIEW_ONLY; unreadable or foreign → MALFORMED (fail closed).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eligibilityInputs, eligibleLaneView, siteEligibilityEnabled, PLAYER_ELIGIBILITY_REL } from "@/lib/sports/nba/lane-eligibility.mjs";
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

/** The slate's eligibility decision for the CC feed (nba-social.mjs eligibilityBlockFor), or null when the switch is off. */
export function loadEligibilityAudit(lane: Snapshot | null): { basis: string; source: string; sourceSha256: string | null; audit: unknown[] } | null {
  if (!siteEligibilityEnabled() || !lane?.date) return null;
  const view = eligibleLaneView(lane, eligibilityInputs(readDoc(lane.date), lane.date));
  const p = file(lane.date);
  const sourceSha256 = fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null;
  return { basis: view.basis, source: PLAYER_ELIGIBILITY_REL(lane.date), sourceSha256, audit: view.audit };
}
