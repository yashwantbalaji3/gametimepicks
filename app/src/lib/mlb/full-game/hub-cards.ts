/**
 * THE FLAGSHIP SIMULATION, ON THE SPORT'S OWN HUB.
 *
 * /epl publishes a Simulations section listing every fixture it can price, each opening its full
 * distribution. /mlb published no such section at all — the fifteen full-game simulations existed,
 * were regenerated hourly as lineups posted, and were reachable only by opening a game report from
 * a board tab. The most expensive thing this site computes was the hardest thing on it to find.
 *
 * This reads the SAME artifact the game report reads, so the hub and the report cannot disagree
 * about a game. It recomputes nothing: every figure here is lifted from the simulation's own
 * output, which is why no run count is invented and the completeness level travels with the row.
 *
 * WHAT A ROW IS ALLOWED TO SAY. A simulation's win probability is the model's own read, not a claim
 * about a price — nothing here is compared to a sportsbook, and the caller states that. A game
 * still waiting on a batting order says so ON the row, because a reader deciding whether to open it
 * should know the lineup is provisional before they read a distribution built on it.
 */
import fs from "node:fs";
import path from "node:path";

export interface MlbSimCard {
  slug: string;
  gamePk: number | string;
  away: string;
  home: string;
  firstPitch: string | null;
  /** The favoured side and its probability, from the simulation. Never a market number. */
  favourite: { team: string; probability: number } | null;
  medianTotal: number | null;
  totalRange: { p10: number; p90: number } | null;
  likeliestScore: { away: number; home: number; probability: number } | null;
  /** "ready" or "degraded", verbatim from the artifact's own reconciliation. */
  completeness: string | null;
  /** True when either side is still without a posted batting order. */
  awaitingLineup: boolean;
}

export interface MlbSimSet {
  date: string;
  generatedAt: string;
  modelVersion: string | null;
  runCount: number | null;
  cards: MlbSimCard[];
  readyCount: number;
}

export function loadMlbSimCards(date: string | null): MlbSimSet | null {
  if (!date) return null;
  let set: Record<string, unknown>;
  try {
    set = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/mlb/full-game-simulations", `${date}.json`), "utf8"));
  } catch {
    return null;                       // no artifact for this day: the caller renders nothing, not a zero
  }
  const games = (set.games as Record<string, never>[]) ?? [];
  if (games.length === 0) return null;

  const cards: MlbSimCard[] = games.map((g) => {
    const wp = g.winProbability as { away?: number; home?: number } | undefined;
    const away = String(g.awayTeam ?? "");
    const home = String(g.homeTeam ?? "");
    /*
     * The FAVOURITE is whichever side the simulation gave more games to. A tie has no favourite and
     * is reported as none rather than defaulting to the home side — a coin flip presented as a lean
     * is the one reading this must not produce.
     */
    let favourite: MlbSimCard["favourite"] = null;
    if (typeof wp?.away === "number" && typeof wp?.home === "number" && wp.away !== wp.home) {
      favourite = wp.away > wp.home ? { team: away, probability: wp.away } : { team: home, probability: wp.home };
    }
    const totals = g.totalRuns as { median?: number; p10?: number; p90?: number } | undefined;
    const top = (g.finalScores as Array<{ away: number; home: number; probability: number }> | undefined)?.[0] ?? null;
    const comp = g.completeness as { level?: string; awayLineupSource?: string; homeLineupSource?: string } | undefined;
    return {
      slug: String(g.slug ?? ""),
      gamePk: (g.gamePk as number | string) ?? "",
      away, home,
      firstPitch: (g.firstPitch as string) ?? null,
      favourite,
      medianTotal: typeof totals?.median === "number" ? totals.median : null,
      totalRange: typeof totals?.p10 === "number" && typeof totals?.p90 === "number" ? { p10: totals.p10, p90: totals.p90 } : null,
      likeliestScore: top,
      completeness: comp?.level ?? null,
      awaitingLineup: comp?.awayLineupSource !== "confirmed" || comp?.homeLineupSource !== "confirmed",
    };
  }).sort((a, b) => String(a.firstPitch ?? "").localeCompare(String(b.firstPitch ?? "")));

  return {
    date: String(set.date ?? date),
    generatedAt: String(set.generatedAt ?? ""),
    modelVersion: (set.modelVersion as string) ?? null,
    // One run count for the set, and only when every game agrees — a mixed set quotes none rather
    // than picking one game's figure and implying it covers the rest.
    runCount: (() => {
      const counts = new Set(games.map((g) => g.runCount as number).filter((n) => typeof n === "number"));
      return counts.size === 1 ? [...counts][0] : null;
    })(),
    cards,
    readyCount: cards.filter((c) => c.completeness === "ready").length,
  };
}
