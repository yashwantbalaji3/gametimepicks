/**
 * Playoff game context — pure utility that decodes NBA stats playoff
 * game IDs and produces sportsbook-grade context labels.
 *
 * Why this lives here (UI-side):
 * The board JSON does not yet carry a `seriesRound` / `gameNumber`
 * field. Rather than fabricate that data or stall on a pipeline change,
 * this utility decodes the information that is already deterministically
 * encoded in the NBA stats game ID format:
 *
 *   `00425001..7..` (10 chars)
 *      ^^^^^      = "00" prefix + "4" (playoff games) + "25" (season).
 *           ^     = "00" fixed.
 *             ^^^ = R + S + G
 *                     R = round 1..4 (1=first, 2=conf semis, 3=conf
 *                         finals, 4=NBA Finals)
 *                     S = series index within the round (0..3 for round
 *                         1, 0..1 for round 2, 0 for round 3+)
 *                     G = game number within the series (1..7)
 *
 * Conference is inferred from team abbreviations (the NBA's 30-team
 * East/West split is stable).
 *
 * **ESPN gameId fallback (added 2026-05-20):** when the schedule was
 * pulled from ESPN's scoreboard (9-digit event IDs like `401873198`),
 * the NBA-stats decoder above can't match. Before returning
 * `isPlayoffs: false`, this utility consults
 * `pipeline/overrides/playoff_series.json` — the same operator-curated
 * file `pipeline/playoff_context.py` uses — and labels the game from
 * its `round` field. That's how May 20 SA @ OKC correctly reads
 * "Western Conference Finals · Game 2" instead of "regular season".
 *
 * NEVER fabricates a game number. If neither path produces a valid
 * round/game-number, the result is `isPlayoffs: false`.
 */

import {
  getPlayoffSeriesOverride,
  formatOverrideRoundLabel,
} from "@/lib/playoff-series-overrides";

const EAST_TEAMS = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NYK", "ORL", "PHI", "TOR", "WAS",
]);

const WEST_TEAMS = new Set([
  "DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN",
  "NOP", "OKC", "PHX", "POR", "SAC", "SAS", "UTA",
]);

const ROUND_LABEL: Record<number, string> = {
  1: "First Round",
  2: "Conference Semifinals",
  3: "Conference Finals",
  4: "NBA Finals",
};

const ROUND_LABEL_COMPACT: Record<number, string> = {
  1: "R1",
  2: "Conf Semis",
  3: "Conf Finals",
  4: "Finals",
};

export interface PlayoffContext {
  /** True only when the game ID decoded cleanly. */
  isPlayoffs: boolean;
  /** "First Round" | "Conference Semifinals" | "Conference Finals" | "NBA Finals" */
  roundLabel?: string;
  /** Compact form for tight spaces. */
  roundLabelCompact?: string;
  /** "Eastern" | "Western" | "" (for Finals — left blank because mixed) */
  conferenceLabel?: string;
  /** "Game 6" */
  gameLabel?: string;
  /** Game number 1..7. */
  gameNumber?: number;
  /** "DET @ CLE" or "" if teams missing. */
  matchup: string;
  /** Combined display label, e.g. "Eastern Conference Semifinals · Game 6 · DET @ CLE" */
  fullLabel: string;
  /** Compact form, e.g. "Conf Semis · Game 6 · DET @ CLE" */
  compactLabel: string;
}

function conferenceFromTeams(
  away: string | undefined,
  home: string | undefined,
): "Eastern" | "Western" | "Mixed" | "Unknown" {
  const a = (away ?? "").toUpperCase();
  const h = (home ?? "").toUpperCase();
  const aEast = EAST_TEAMS.has(a);
  const hEast = EAST_TEAMS.has(h);
  const aWest = WEST_TEAMS.has(a);
  const hWest = WEST_TEAMS.has(h);
  if (aEast && hEast) return "Eastern";
  if (aWest && hWest) return "Western";
  if ((aEast && hWest) || (aWest && hEast)) return "Mixed";
  return "Unknown";
}

export function getPlayoffContext(
  gameId: string | undefined,
  awayTeamAbbr: string | undefined,
  homeTeamAbbr: string | undefined,
): PlayoffContext {
  const matchup =
    awayTeamAbbr && homeTeamAbbr ? `${awayTeamAbbr} @ ${homeTeamAbbr}` : "";

  // Default fallback used when the game ID can't be decoded.
  const fallback: PlayoffContext = {
    isPlayoffs: false,
    matchup,
    fullLabel: matchup,
    compactLabel: matchup,
  };

  if (!gameId) return fallback;

  // NBA stats playoff game-ID match. Anchored, exactly 10 chars,
  // 00425 prefix (playoffs of the 2025-26 season).
  const match = /^00425\d{2}([1-4])(\d)([1-7])$/.exec(gameId);
  if (!match) {
    // ESPN scoreboard IDs (9-digit) don't fit the NBA-stats pattern.
    // Fall back to the operator-curated override file before giving up.
    const override = getPlayoffSeriesOverride(gameId);
    if (override) {
      const labels = formatOverrideRoundLabel(override.round);
      const gameLabel = `Game ${override.gameNumber}`;
      const parts = [labels.full, gameLabel];
      if (matchup) parts.push(matchup);
      const compactParts = [labels.compact, gameLabel];
      if (matchup) compactParts.push(matchup);
      return {
        isPlayoffs: true,
        roundLabel: labels.full,
        roundLabelCompact: labels.compact,
        conferenceLabel: labels.conference,
        gameLabel,
        gameNumber: override.gameNumber,
        matchup,
        fullLabel: parts.join(" · "),
        compactLabel: compactParts.join(" · "),
      };
    }
    return fallback;
  }

  const round = Number(match[1]);
  const gameNumber = Number(match[3]);
  if (!Number.isFinite(round) || round < 1 || round > 4) return fallback;
  if (!Number.isFinite(gameNumber) || gameNumber < 1 || gameNumber > 7)
    return fallback;

  const roundLabel = ROUND_LABEL[round];
  const roundLabelCompact = ROUND_LABEL_COMPACT[round];
  const gameLabel = `Game ${gameNumber}`;

  const conf = conferenceFromTeams(awayTeamAbbr, homeTeamAbbr);
  let conferenceLabel: string;
  let roundDisplay: string;
  let roundDisplayCompact: string;
  if (round === 4) {
    conferenceLabel = "";
    roundDisplay = roundLabel;
    roundDisplayCompact = roundLabelCompact;
  } else if (conf === "Eastern" || conf === "Western") {
    conferenceLabel = conf;
    roundDisplay = `${conf} ${roundLabel}`;
    roundDisplayCompact = roundLabelCompact;
  } else {
    // Mixed or unknown — drop conference qualifier rather than guess.
    conferenceLabel = "";
    roundDisplay = roundLabel;
    roundDisplayCompact = roundLabelCompact;
  }

  const parts = [roundDisplay, gameLabel];
  if (matchup) parts.push(matchup);

  const compactParts = [roundDisplayCompact, gameLabel];
  if (matchup) compactParts.push(matchup);

  return {
    isPlayoffs: true,
    roundLabel: roundDisplay,
    roundLabelCompact: roundDisplayCompact,
    conferenceLabel,
    gameLabel,
    gameNumber,
    matchup,
    fullLabel: parts.join(" · "),
    compactLabel: compactParts.join(" · "),
  };
}
