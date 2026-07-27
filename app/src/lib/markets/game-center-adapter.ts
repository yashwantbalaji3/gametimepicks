/**
 * LEGACY GAME CENTER ADAPTER (Sprint 031 · Phase 1).
 *
 * `buildMlbGameCenter` predates the canonical intelligence layer. It reads the team-markets artifact
 * directly and — crucially — enforces NO freshness. On a day whose snapshot is older than today it
 * would render an earlier slate's prices as the current market, which is precisely the claim the
 * freshness contract exists to prevent. It is also a second place where sportsbook fields are
 * interpreted, so the two paths could drift apart silently.
 *
 * Rather than add a third path, this adapter derives the LEGACY SHAPE from the CANONICAL OBJECT.
 * The `MlbGameCenter` interface is unchanged, so `mlb-game-center.tsx`, `mlb-simulation-report-v2`
 * and the simulation runner keep working untouched — but every number now comes from
 * `buildGameIntelligence`, and the freshness gate is inherited rather than reimplemented.
 *
 * The gate is the point: when the canonical layer withholds the sportsbook side, this returns null
 * instead of numbers. A section that disappears is recoverable; a stale price presented as live is
 * not.
 *
 * This is a COMPATIBILITY SHIM, not a destination. It exists because three components still consume
 * the legacy shape; deleting it means migrating them to `GameIntelligence` directly, which is a
 * separate change with its own UI surface area.
 */
import type { GameIntelligence } from "./game-intelligence";
import type { MlbGameCenter } from "../mlb-team-markets";

/**
 * The same honest disclosure the legacy builder carried: this feed prices main lines only, so run /
 * total / margin distributions cannot be derived from it.
 */
const MAIN_LINE_ONLY_NOTE = {
  module: "run_distributions",
  reason: "requires_alternate_ladders",
  displayCopy:
    "Run-scored, total, and margin distributions need the alternate-line ladders (multiple priced totals/spreads), which aren't ingested for this slate. The Game Center shows the market's main-line reads only.",
};

/** A total lean only when the de-vigged over/under diverge enough to matter. Unchanged threshold. */
function totalLean(overProb: number, underProb: number): "over" | "under" | "balanced" {
  if (overProb - underProb >= 0.025) return "over";
  if (underProb - overProb >= 0.025) return "under";
  return "balanced";
}

/**
 * Project canonical game intelligence into the legacy Game Center shape.
 *
 * Returns null when the canonical layer says the sportsbook side may not be shown — a missing
 * market, an unreadable price, or a snapshot that is not current for the frame being rendered.
 */
export function gameCenterFromIntelligence(
  intel: GameIntelligence | null | undefined,
  source: string | null,
): MlbGameCenter | null {
  if (!intel) return null;

  const ml = intel.moneyline.sportsbook;
  const tot = intel.total.sportsbook;
  const rl = intel.runLine.sportsbook;

  // Every side is read through the canonical object, so a withheld side is genuinely absent here
  // rather than quietly re-read from the artifact.
  // The legacy shape requires real prices, and that is the right requirement: a Game Center row with
  // a probability but no price would present a number the reader cannot trace back to anything.
  const moneyline =
    ml && ml.homeNoVigProb != null && ml.awayNoVigProb != null && ml.homeOdds != null && ml.awayOdds != null
      ? {
          homeWinProb: ml.homeNoVigProb,
          awayWinProb: ml.awayNoVigProb,
          homeOdds: ml.homeOdds,
          awayOdds: ml.awayOdds,
          favorite:
            Math.abs(ml.homeNoVigProb - ml.awayNoVigProb) < 0.02
              ? ("even" as const)
              : ml.homeNoVigProb > ml.awayNoVigProb
                ? ("home" as const)
                : ("away" as const),
        }
      : null;

  const total =
    tot && intel.total.line != null && tot.overNoVigProb != null && tot.underNoVigProb != null
      ? {
          line: intel.total.line,
          overProb: tot.overNoVigProb,
          underProb: tot.underNoVigProb,
          lean: totalLean(tot.overNoVigProb, tot.underNoVigProb),
        }
      : null;

  // The legacy shape describes the run line by its FAVOURITE side. The canonical object carries the
  // signed home line and both cover probabilities, so the favourite is read off those rather than
  // re-deriving any sign convention here.
  const runLine =
    rl && rl.homeCoverNoVigProb != null && rl.awayCoverNoVigProb != null
      ? (() => {
          const homeFav = rl.homeCoverNoVigProb! >= rl.awayCoverNoVigProb!;
          return {
            line: (homeFav ? intel.runLine.homeLine : -(intel.runLine.homeLine ?? 0)) ?? 0,
            favorite: homeFav ? ("home" as const) : ("away" as const),
            favoriteCoverProb: homeFav ? rl.homeCoverNoVigProb! : rl.awayCoverNoVigProb!,
          };
        })()
      : null;

  // Nothing usable on any market means there is no Game Center to show. Returning an all-null shell
  // would render as an empty module rather than as an absent one.
  if (!moneyline && !total && !runLine) return null;

  return {
    method: "market_implied",
    source: source ?? intel.snapshot.bookmaker ?? "sportsbook",
    homeTeam: intel.homeTeam,
    awayTeam: intel.awayTeam,
    firstPitch: intel.startTime,
    moneyline,
    total,
    runLine,
    unavailable: [MAIN_LINE_ONLY_NOTE],
  };
}
