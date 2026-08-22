/**
 * THE CONFIRMED BATTING ORDER — already captured, free, and until now unread by the simulation.
 *
 * The full-game engine built each side's lineup from the board's PROP LINES: a batter existed only
 * if a sportsbook had posted a hit line for him. At board time books have posted six to eight per
 * team, so the rest were replacement-level padding and the batting ORDER was prop-listing order
 * rather than the real one. Every game on 2026-08-21 came out `degraded`, fourteen of fifteen with
 * padded lineups, and `confirmed_batting_order` was declared a family that "never exists pregame".
 *
 * It does exist. capture-mlb-pregame-lineup.mjs has been writing immutable timestamped snapshots
 * eight times a day from the free StatsAPI — the full nine-man order with player ids, positions and
 * slots — and all fifteen of that day's games had both sides captured before first pitch. The
 * product simply never looked at the archive that was being filled for it.
 *
 * WHY ORDER MATTERS TO THIS ENGINE. It simulates plate appearances. The leadoff hitter takes roughly
 * 4.6 PAs to the ninth hitter's 3.9, so who bats where changes how much each bat is worth across ten
 * thousand games. Prop-listing order is not batting order, and padding the tail with a replacement
 * hitter understates a real lineup's back half.
 *
 * ── THE BOUNDARY, AND WHY CROSSING IT IS DEFENSIBLE HERE ────────────────────────────────────────
 * Every snapshot carries `productEligible: false` and `approvedForProduction: false`. Those are
 * hardcoded on every record — a blanket "this archive is research" rather than a judgement about a
 * particular capture. This module consumes it anyway, deliberately and under stated conditions:
 *
 *   - the full-game simulation is DISPLAY-ONLY. Its artifact and the prediction layer above it carry
 *     settledIntoMoney: false, and nothing in the parlay, ladder or settlement chain reads either.
 *     No money record can move because of what is decided here.
 *   - the leakage rule is preserved rather than assumed: a snapshot is used only when it was
 *     captured strictly BEFORE first pitch, checked here against the snapshot's own eventStartTime
 *     instead of trusting the researchEligible flag that claims it.
 *   - the source is REPORTED on every game, so a reader and a later audit can both tell which
 *     lineup a simulation actually ran on.
 *
 * The flag is not rewritten. The archive stays exactly what it says it is; this records that a
 * display product has taken a dependency on it, and on what terms.
 */

export interface ConfirmedBatter {
  playerId: number;
  name: string;
  position: string | null;
  battingOrderSlot: number;
}

export interface ConfirmedSide {
  batters: ConfirmedBatter[];
  capturedAt: string;
  minutesToFirstPitch: number | null;
}

export interface LineupSnapshot {
  gamePk: number;
  capturedAt: string;
  eventStartTime: string;
  minutesToFirstPitch?: number | null;
  away?: { posted?: boolean; count?: number; lineup?: ConfirmedBatter[] };
  home?: { posted?: boolean; count?: number; lineup?: ConfirmedBatter[] };
}

/** A full nine, in slot order, with real player ids. Anything short is not a confirmed lineup. */
function usableSide(side: LineupSnapshot["away"]): ConfirmedBatter[] | null {
  if (!side?.posted || !Array.isArray(side.lineup) || side.lineup.length !== 9) return null;
  const batters = side.lineup
    .filter((b) => Number.isFinite(b?.playerId) && b?.battingOrderSlot != null)
    .slice()
    .sort((a, b) => a.battingOrderSlot - b.battingOrderSlot);
  if (batters.length !== 9) return null;
  // Slots must be exactly 1..9. A duplicate or a gap means the capture caught a lineup mid-write.
  if (batters.some((b, i) => b.battingOrderSlot !== i + 1)) return null;
  return batters;
}

/**
 * Pick the LATEST pre-first-pitch snapshot for each side independently.
 *
 * Independently, because the two teams post at different times — taking only snapshots where both
 * are up would throw away a confirmed home lineup for an hour while the away side is still out.
 *
 * @param snapshots every snapshot for one gamePk, in any order
 */
export function selectConfirmedLineup(snapshots: LineupSnapshot[]): { away: ConfirmedSide | null; home: ConfirmedSide | null } {
  const out: { away: ConfirmedSide | null; home: ConfirmedSide | null } = { away: null, home: null };

  const pregame = (snapshots ?? []).filter((s) => {
    const captured = Date.parse(s?.capturedAt ?? "");
    const start = Date.parse(s?.eventStartTime ?? "");
    // Checked here rather than trusting researchEligible: a flag that asserts a property is not the
    // property. A snapshot at or after first pitch can see the lineup that actually took the field.
    return Number.isFinite(captured) && Number.isFinite(start) && captured < start;
  }).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));

  for (const s of pregame) {
    for (const which of ["away", "home"] as const) {
      const batters = usableSide(s[which]);
      if (batters) out[which] = { batters, capturedAt: s.capturedAt, minutesToFirstPitch: s.minutesToFirstPitch ?? null };
    }
  }
  return out;
}
