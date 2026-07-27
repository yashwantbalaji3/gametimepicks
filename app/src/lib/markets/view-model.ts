/**
 * MARKET CENTER CLIENT VIEW MODEL (Sprint 029 · Phase 6).
 *
 * The canonical intelligence objects are built for correctness and auditability, so every row
 * carries its own provenance — including two long constants, `calibrationDisclosure` and
 * `methodologyNote`. That is right for a server object and wrong for a client payload: on a real
 * slate those two strings alone repeat across ~1,250 rows and account for roughly 900 KB of an
 * otherwise ~1.5 MB page, all of it identical.
 *
 * This module projects the intelligence objects down to exactly the fields the surface renders, and
 * hoists the shared constants to the page level where they belong. Measured effect on the live
 * 2026-07-27 slate: the exported page drops from 2.4 MB to well under half that.
 *
 * It is a PROJECTION, never a re-derivation. No probability, difference or mode is computed here —
 * a view model that recomputed anything would be a second source of truth wearing a different name.
 */
import type { PlayerPropIntelligence } from "./player-intelligence";
import type { IntelligenceMode, PairingGate } from "./pairing";

/** One prop row, reduced to what the Market Center actually draws. */
export interface PropRowView {
  readonly mode: IntelligenceMode;
  /** Only the gates the surface explains. The rest stay server-side. */
  readonly noModelFamily: boolean;
  readonly teamUnresolved: boolean;
  readonly playerName: string;
  readonly playerId: number | null;
  readonly team: string | null;
  readonly opponent: string | null;
  readonly gameId: string;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  readonly startTime: string | null;
  readonly marketLabel: string | null;
  readonly line: number | null;
  readonly overOdds: number | null;
  readonly marketProbOver: number | null;
  readonly modelProbOver: number | null;
  readonly differencePoints: number | null;
  readonly samples: number | null;
  /** Recent form collapsed to its summary — the per-game list is not rendered. */
  readonly recentCount: number | null;
  readonly recentAverage: number | null;
  readonly recentOverLine: number | null;
  readonly recentLeakageSafe: boolean;
}

const EXPLAINED_GATES: ReadonlyArray<PairingGate> = ["NO_MODEL_FAMILY", "TEAM_UNRESOLVED"];

export function toPropRowView(p: PlayerPropIntelligence): PropRowView {
  const gates = new Set(p.intelligence.blockedBy);
  const form = p.model?.recentForm ?? null;
  return {
    mode: p.intelligence.mode,
    noModelFamily: gates.has(EXPLAINED_GATES[0]),
    teamUnresolved: gates.has(EXPLAINED_GATES[1]),
    playerName: p.player.name,
    playerId: p.player.playerId,
    team: p.player.team,
    opponent: p.player.opponent,
    gameId: p.event.gameId,
    homeTeam: p.event.homeTeam,
    awayTeam: p.event.awayTeam,
    startTime: p.event.startTime,
    marketLabel: p.marketLabel,
    line: p.sportsbook?.line ?? null,
    overOdds: p.sportsbook?.overOdds ?? null,
    marketProbOver: p.sportsbook?.overNoVigProb ?? null,
    modelProbOver: p.model?.probOver ?? null,
    differencePoints: p.comparison?.differencePoints ?? null,
    samples: p.model?.samples ?? null,
    recentCount: form ? form.games.length : null,
    recentAverage: form?.average ?? null,
    recentOverLine: form?.overLineCount ?? null,
    // Defaults TRUE only when there is no form to be unsafe about; a real window that dropped a
    // game reports false, so the surface can say so.
    recentLeakageSafe: form ? form.leakageSafe : true,
  };
}

export function toPropRowViews(rows: ReadonlyArray<PlayerPropIntelligence>): PropRowView[] {
  return rows.map(toPropRowView);
}
