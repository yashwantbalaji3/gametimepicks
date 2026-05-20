/**
 * Static NBA playoff-series override map — mirrors
 * `pipeline/overrides/playoff_series.json` (the operator-curated file
 * the pipeline reads from `pipeline/playoff_context.py`).
 *
 * Why a TS-side mirror instead of reading the JSON at runtime:
 * the playoff-context helper is imported through both server and
 * client code paths. Reading `node:fs` from a module that gets bundled
 * into a client component breaks `next build`. Embedding the small
 * data set as a typed constant keeps both worlds happy without
 * pulling in a server-only adapter.
 *
 * Maintenance: when a new playoff game lands, the operator must update
 * **both** files. They're intentionally small — only the games we are
 * actively covering — and a test in `playoff-context` verifies the
 * mirror produces the same `isPlayoffs` + round labels expected.
 *
 * Pure data; no fabrication. Every entry maps to a real game on the
 * NBA playoff calendar.
 */

export interface PlayoffSeriesOverride {
  /** Round code: ECF, WCF, NBAFinals, ECSF, WCSF, ECR1, WCR1. */
  round: string;
  gameNumber: number;
  /** Alphabetical pair, e.g. "SA-OKC". */
  seriesShort: string;
  eliminationFlag?: boolean | null;
  homeTeam: string;
  awayTeam: string;
  notes?: string;
}

const PLAYOFF_SERIES_OVERRIDES: Record<string, PlayoffSeriesOverride> = {
  // May 18 — WCF Game 1 (settled in PR #59)
  "401873197": {
    round: "WCF",
    gameNumber: 1,
    seriesShort: "SA-OKC",
    eliminationFlag: false,
    homeTeam: "OKC",
    awayTeam: "SA",
    notes: "May 18 — WCF Game 1 (settled in PR #59).",
  },
  // May 20 — WCF Game 2
  "401873198": {
    round: "WCF",
    gameNumber: 2,
    seriesShort: "SA-OKC",
    eliminationFlag: false,
    homeTeam: "OKC",
    awayTeam: "SA",
    notes: "May 20 — Game 2 of best-of-7.",
  },
  // May 19 — ECF Game 1 (settled in PR #62)
  "401873341": {
    round: "ECF",
    gameNumber: 1,
    seriesShort: "CLE-NY",
    eliminationFlag: false,
    homeTeam: "NY",
    awayTeam: "CLE",
    notes: "May 19 — NY 115 (OT) over CLE 104.",
  },
  // May 21 — ECF Game 2
  "401873342": {
    round: "ECF",
    gameNumber: 2,
    seriesShort: "CLE-NY",
    eliminationFlag: false,
    homeTeam: "NY",
    awayTeam: "CLE",
    notes: "May 21 — Game 2 of best-of-7.",
  },
};

/** Lookup by gameId. Returns null when the override has no entry for
 *  this game (the UI then falls back to non-playoff matchup labels).
 *  Never fabricates an entry. */
export function getPlayoffSeriesOverride(
  gameId: string | undefined | null,
): PlayoffSeriesOverride | null {
  if (!gameId) return null;
  return PLAYOFF_SERIES_OVERRIDES[gameId] ?? null;
}

/** Round → human-readable label set. Matches the format the existing
 *  `playoff-context.ts` helper produces for NBA-stats IDs so the UI
 *  doesn't need to branch on which decoder fired. */
export function formatOverrideRoundLabel(
  round: string,
): { full: string; compact: string; conference: "Eastern" | "Western" | "" } {
  switch (round) {
    case "ECF":
      return {
        full: "Eastern Conference Finals",
        compact: "Conf Finals",
        conference: "Eastern",
      };
    case "WCF":
      return {
        full: "Western Conference Finals",
        compact: "Conf Finals",
        conference: "Western",
      };
    case "NBAFinals":
      return {
        full: "NBA Finals",
        compact: "Finals",
        conference: "",
      };
    case "ECSF":
      return {
        full: "Eastern Conference Semifinals",
        compact: "Conf Semis",
        conference: "Eastern",
      };
    case "WCSF":
      return {
        full: "Western Conference Semifinals",
        compact: "Conf Semis",
        conference: "Western",
      };
    case "ECR1":
      return {
        full: "Eastern First Round",
        compact: "R1",
        conference: "Eastern",
      };
    case "WCR1":
      return {
        full: "Western First Round",
        compact: "R1",
        conference: "Western",
      };
    default:
      return {
        full: round,
        compact: round,
        conference: "",
      };
  }
}

/** Exposed for tests. */
export function _allOverrideGameIds(): string[] {
  return Object.keys(PLAYOFF_SERIES_OVERRIDES);
}
