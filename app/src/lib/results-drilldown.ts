/**
 * PR `feature/results-risk-section-drilldown` (2026-05-29) — pure
 * helpers that turn a graded payload's `publicRiskSections.all`
 * cells into a flat per-section list the UI can render under the
 * summary tables.
 *
 * Why this exists:
 *   - PR #159 graded each `publicRiskSections` slip (status: win /
 *     loss / push / pending) and PR #158/#161 added the summary
 *     breakdown tables. Users can SEE the section hit rates but
 *     can't open them to inspect the specific slips behind those
 *     numbers.
 *   - This module flattens the `all` sport bucket (avoiding
 *     double-count vs per-sport tabs), tags each slip with its
 *     section key, and exposes a compact display shape the drilldown
 *     component renders.
 *
 * Honesty rules:
 *   - Source: `publicRiskSections.{section}.all` only. We never
 *     fabricate slips. When a section's array is missing or empty
 *     the result is an empty array — the UI shows "Not enough
 *     settled slips yet" for that section, never an invented row.
 *   - Each slip carries its real `status` (win / loss / push /
 *     pending). The drilldown never overrides the grader.
 *   - Pending slips are tagged honestly; never hidden, never marked
 *     as decisive.
 *   - Leg-level fields (`result`, `finalStat`) come straight from
 *     the grader. We never invent a hit/miss.
 */
import type { GradedStatus } from "./results-breakdown";
import {
  RISK_SECTION_ORDER,
  type RiskSectionKey,
} from "./parlay-risk-sections";

/** Status as the grader writes it. `null` defaults to pending so
 *  the UI never accidentally renders the slip as decisive. */
export type DrilldownStatus = GradedStatus;

export interface DrilldownLeg {
  playerName: string;
  team: string | null;
  opponent: string | null;
  market: string;
  marketLabel: string | null;
  side: string;
  line: number | null;
  oddsForSide: number | null;
  /** Grader-stamped leg result; falls back to "unresolved" when the
   *  grader couldn't classify (e.g. settled stat missing for a
   *  market). Never invented. */
  result: string | null;
  finalStat: number | null;
  commenceTime: string | null;
  gameTime: string | null;
  /** Honest sport — comes from the leg, used by the UI to render
   *  the tiny sport chip when a slip is mixed. */
  sport: string;
}

export interface DrilldownSlip {
  slipId: string;
  /** Which public risk section the slip was generated under. */
  section: RiskSectionKey;
  /** The optimizer's sport bucket for the slip (nba / mlb / multi). */
  sport: "nba" | "mlb" | "multi";
  /** Grader status. */
  status: DrilldownStatus;
  /** Computed combined American odds — same math as the suggestion
   *  selector. `null` only when some leg has no usable price. */
  combinedAmericanOdds: number | null;
  legs: DrilldownLeg[];
  /** Single-game slip flag (NBA SGP path). Used by the UI to render
   *  the "Single-game" chip honestly. */
  singleGame: boolean;
}

/** Minimal payload shape we read. Wider than this is fine. */
interface GradedPayloadLike {
  publicRiskSections?: Partial<
    Record<
      RiskSectionKey,
      Partial<Record<"all" | "nba" | "mlb" | "multi", ReadonlyArray<RawGradedSlip>>>
    >
  >;
}

interface RawGradedSlip {
  slipId?: string;
  status?: string | null;
  sport?: string;
  singleGame?: boolean;
  legs?: ReadonlyArray<{
    playerName?: string;
    team?: string | null;
    opponent?: string | null;
    market?: string;
    marketLabel?: string | null;
    side?: string;
    line?: number | null;
    oddsForSide?: number | null;
    result?: string | null;
    finalStat?: number | null;
    commenceTime?: string | null;
    gameTime?: string | null;
    sport?: string;
  }>;
}

/** Pure helper from `parlay-risk-sections.ts` (re-export indirect to
 *  keep this module independent). Compute combined American odds. */
function _combinedAmericanOdds(
  legs: ReadonlyArray<{ oddsForSide?: number | null }>,
): number | null {
  if (legs.length === 0) return null;
  let decimal = 1;
  for (const leg of legs) {
    const o = leg.oddsForSide;
    if (typeof o !== "number" || !Number.isFinite(o) || o === 0) return null;
    decimal *= o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
  }
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  if (decimal > 1) return -Math.round(100 / (decimal - 1));
  return 0;
}

/** Normalize the grader's status string into our enum. Unknown /
 *  empty / null → pending (the conservative default — never
 *  invents a decisive outcome). */
function _normalizeStatus(raw: string | null | undefined): DrilldownStatus {
  if (typeof raw !== "string") return "pending";
  const s = raw.toLowerCase().trim();
  if (s === "win" || s === "loss" || s === "push" || s === "pending" || s === "void") {
    return s as DrilldownStatus;
  }
  return "pending";
}

function _normalizeSport(s: string | undefined): "nba" | "mlb" | "multi" {
  const v = (s ?? "").toLowerCase();
  if (v === "nba" || v === "mlb" || v === "multi") return v;
  return "multi";
}

/** Build the flat per-section drilldown list from a graded payload.
 *  Source: only the `all` sport bucket so a slip isn't double-counted
 *  via per-sport tabs. */
export function buildRiskSectionDrilldown(
  graded: GradedPayloadLike | null | undefined,
): Record<RiskSectionKey, DrilldownSlip[]> {
  const out: Record<RiskSectionKey, DrilldownSlip[]> = {
    low: [],
    medium: [],
    high: [],
    longshot: [],
  };
  if (!graded || !graded.publicRiskSections) return out;
  for (const section of RISK_SECTION_ORDER) {
    const all = graded.publicRiskSections[section]?.all ?? [];
    for (const raw of all) {
      if (!raw || typeof raw !== "object") continue;
      const legs: DrilldownLeg[] = (raw.legs ?? []).map((leg) => ({
        playerName: leg.playerName ?? "—",
        team: leg.team ?? null,
        opponent: leg.opponent ?? null,
        market: leg.market ?? "",
        marketLabel: leg.marketLabel ?? null,
        side: leg.side ?? "",
        line: leg.line ?? null,
        oddsForSide: leg.oddsForSide ?? null,
        result: typeof leg.result === "string" ? leg.result : null,
        finalStat: typeof leg.finalStat === "number" ? leg.finalStat : null,
        commenceTime: typeof leg.commenceTime === "string" ? leg.commenceTime : null,
        gameTime: typeof leg.gameTime === "string" ? leg.gameTime : null,
        sport: (leg.sport ?? "").toLowerCase(),
      }));
      const slip: DrilldownSlip = {
        slipId: raw.slipId ?? "",
        section,
        sport: _normalizeSport(raw.sport),
        status: _normalizeStatus(raw.status ?? null),
        combinedAmericanOdds: _combinedAmericanOdds(legs),
        legs,
        singleGame: Boolean(raw.singleGame),
      };
      out[section].push(slip);
    }
  }
  return out;
}

/** Sort order within a section: decisive wins first (most
 *  interesting to the user), then losses, then pushes, then pending.
 *  Pure; never throws. */
export function sortDrilldownSlips(slips: DrilldownSlip[]): DrilldownSlip[] {
  const rank: Record<DrilldownStatus, number> = {
    win: 0,
    loss: 1,
    push: 2,
    pending: 3,
    void: 4,
  };
  return [...slips].sort(
    (a, b) => (rank[a.status] ?? 99) - (rank[b.status] ?? 99),
  );
}
