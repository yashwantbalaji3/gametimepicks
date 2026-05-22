/**
 * /parlay-lab — game-first slip builder.
 *
 * Replaces the prior tab-driven builder hub (Build + Analyze modes,
 * giant ParlayBuilderClient, sport pills, "How this works"
 * disclosure, etc.) with the same four-step pattern shipped in PR #86
 * for /projections:
 *
 *   1. Compact header   — "Build tonight's slips · Today"
 *   2. Date pill row    — Today / Tomorrow with leans
 *   3. Game card grid   — sportsbook-style matchup cards with a
 *                          "Saved · pending" badge when snapshot
 *                          slips exist for that game
 *   4. Game slip detail — hero + saved slips + risk pills +
 *                          live preview slips (NBA-only)
 *
 * Server component: loads the unified projections payload + the
 * per-date snapshot/graded payloads, hands both to the client. Uses
 * Suspense so static export builds.
 *
 * Honesty:
 *   - Saved slips render the real snapshot file content. We never
 *     fabricate slips.
 *   - Live preview slips come from `buildParlayCandidates` over the
 *     loaded NBA leans for the selected game — no synthesised odds.
 *   - MLB games show an explicit "MLB live preview pending" panel
 *     rather than inventing slips.
 *   - The page never claims a parlay hit rate.
 */
import { Suspense } from "react";

import ParlayLabExperience from "@/components/parlay-lab-experience";
import { loadProjectionsPayload } from "@/lib/data-projections";
import { loadCalibrationTable } from "@/lib/confidence-calibration";
import {
  getSnapshotForDate,
  getGradedForDate,
  type ParlaySnapshot,
} from "@/lib/data-parlays";
import { getBoardForDate } from "@/lib/data";
import type { PropLean } from "@/lib/types";

export const metadata = {
  title: "Parlay Lab · GameTime Picks",
  description:
    "Game-first slip builder. Pick a date, pick a game, choose a risk style. Saved slips graded after final stats — never fabricated.",
};

export default function ParlayLabPage() {
  const payload = loadProjectionsPayload();

  // For each date in the payload, attempt to load a snapshot OR
  // graded payload. Graded wins — once the grader has run we never
  // show the stale snapshot copy.
  const snapshotsByDate: Record<
    string,
    { source: "snapshot" | "graded"; payload: ParlaySnapshot }
  > = {};
  for (const d of payload.dates) {
    const graded = getGradedForDate(d.date);
    if (graded) {
      snapshotsByDate[d.date] = { source: "graded", payload: graded };
      continue;
    }
    const snap = getSnapshotForDate(d.date);
    if (snap) {
      snapshotsByDate[d.date] = { source: "snapshot", payload: snap };
    }
  }

  // Live preview slips need the raw NBA PropLean[] for the date.
  // Only load NBA leans for dates that have at least one NBA game on
  // the unified payload — keeps the static-export payload small.
  const nbaLeansByDate: Record<string, PropLean[]> = {};
  for (const d of payload.dates) {
    const hasNba = d.games.some((g) => g.sport === "nba");
    if (!hasNba) continue;
    const board = getBoardForDate(d.date);
    nbaLeansByDate[d.date] = board?.leans ?? [];
  }

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden">
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden />}>
        <ParlayLabExperience
          payload={payload}
          snapshotsByDate={snapshotsByDate}
          nbaLeansByDate={nbaLeansByDate}
          calibrationTable={loadCalibrationTable()}
        />
      </Suspense>
    </div>
  );
}
