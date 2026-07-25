/**
 * SLATE PREDICTION VIEWS (Sprint 010). Pure derivations that turn the per-game canonical prediction objects
 * into the two /today dashboard surfaces: the Game Predictions table (one row per game) and the Top Model
 * Picks BY CATEGORY (player predictions grouped by market). Both read the SAME canonical objects the Game
 * Report uses — no re-derivation, no second engine. Nothing here invents a pick or a probability.
 */
import type { GamePredictionDecision, PlayerPrediction } from "./types";
import type { StrengthLabel } from "./strength";
import { simulationFrequency } from "./story";

/** One game's inputs, normalized from a PublicGameDetail by the /today page. */
export interface SlatePredictionGame {
  gamePk: number;
  slug: string;
  href: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string;
  awayTeamName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  firstPitchIso: string | null;
  prediction: GamePredictionDecision;
  /** Enriched canonical player predictions for this game (from game-detail). */
  playerPredictions: PlayerPrediction[];
  /** Complete games simulated for this matchup (artifact runCount) — display only. */
  simulationCount?: number | null;
}

/** One row of the /today Game Predictions table. */
export interface GamePredictionRow {
  gamePk: number;
  slug: string;
  href: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string;
  awayTeamName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  firstPitchIso: string | null;
  status: "ready" | "degraded" | "unavailable";
  moneyline: { team: string; probability: number; strength: StrengthLabel } | null;
  score: { away: number; home: number } | null;
  total: { pick: "OVER" | "UNDER"; line: number; probability: number } | null;
  runLine: { pick: string; coverProbability: number } | null;
}

/** Build the Game Predictions table rows, chronological by first pitch. */
export function buildTodayPredictionRows(games: SlatePredictionGame[]): GamePredictionRow[] {
  const rows: GamePredictionRow[] = [];
  for (const g of games) {
    const p = g.prediction;
    if (!p) continue;
    const total =
      p.total && p.total.pick !== "UNAVAILABLE" && p.total.line != null
        ? {
            pick: p.total.pick as "OVER" | "UNDER",
            line: p.total.line,
            probability: (p.total.pick === "OVER" ? p.total.overProbability : p.total.underProbability) ?? 0,
          }
        : null;
    rows.push({
      gamePk: g.gamePk,
      slug: g.slug,
      href: g.href,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeTeamName: g.homeTeamName,
      awayTeamName: g.awayTeamName,
      homeLogo: g.homeLogo,
      awayLogo: g.awayLogo,
      firstPitchIso: g.firstPitchIso,
      status: p.status,
      moneyline: p.moneyline ? { team: p.moneyline.team, probability: p.moneyline.simulationProbability, strength: p.moneyline.strengthLabel } : null,
      score: p.projectedScore ? { away: p.projectedScore.away, home: p.projectedScore.home } : null,
      total,
      runLine: p.runLine ? { pick: p.runLine.pick, coverProbability: p.runLine.coverProbability } : null,
    });
  }
  return rows.sort((a, b) => (a.firstPitchIso ?? "").localeCompare(b.firstPitchIso ?? ""));
}

/** A player pick tagged with its game for a slate-wide category board. */
export interface CategoryPick extends PlayerPrediction {
  /** Simulations behind this probability (from the game artifact) — for the honest "N / 10,000 games" line. */
  simulationCount: number | null;
  matchup: string;
  href: string;
  gamePk: number;
}

export interface CategoryDashboard {
  market: string;
  label: string;
  picks: CategoryPick[];
}

/** The category order + labels shown on /today (only non-empty categories render). */
const CATEGORY_ORDER: { market: string; label: string }[] = [
  { market: "pitcher_strikeouts", label: "Strikeouts" },
  { market: "batter_hits", label: "Hits" },
  { market: "batter_total_bases", label: "Total Bases" },
  { market: "batter_hits_runs_rbis", label: "Hits + Runs + RBIs" },
  { market: "batter_home_runs", label: "Home Runs" },
  { market: "batter_runs_scored", label: "Runs" },
  { market: "batter_rbis", label: "RBIs" },
];

/**
 * Group the slate's player predictions BY MARKET into ranked category dashboards. Each category is sorted by
 * simulated probability (strongest first) and capped at `perCategory`. Unknown markets are dropped (never a
 * fabricated category). Deterministic order + ranking.
 */
export function buildTopPicksByCategory(
  games: SlatePredictionGame[],
  opts?: { perCategory?: number },
): CategoryDashboard[] {
  const perCategory = opts?.perCategory ?? 5;
  const byMarket = new Map<string, CategoryPick[]>();
  for (const g of games) {
    const matchup = `${g.awayTeam} @ ${g.homeTeam}`;
    for (const pp of g.playerPredictions) {
      const arr = byMarket.get(pp.market) ?? [];
      arr.push({ ...pp, simulationCount: g.simulationCount ?? null, matchup, href: g.href, gamePk: g.gamePk });
      byMarket.set(pp.market, arr);
    }
  }
  const dashboards: CategoryDashboard[] = [];
  for (const { market, label } of CATEGORY_ORDER) {
    const picks = byMarket.get(market);
    if (!picks || picks.length === 0) continue;
    picks.sort((a, b) => b.simulationProbability - a.simulationProbability);
    dashboards.push({ market, label, picks: picks.slice(0, perCategory) });
  }
  return dashboards;
}

// ── SLATE SIMULATION STORIES (Sprint 015 · Phase 2) ──────────────────────────────────────────────

/**
 * The four slate-wide headlines on /today: which game the simulation is most sure about, which it is least
 * sure about, which it expects to score most, and which single player outcome it is most confident in.
 *
 * These are SUPERLATIVES over the canonical prediction objects — a ranking, never a new calculation. Every
 * value is read straight off `GamePredictionDecision` (the same object the report and the predictions table
 * use), so a story can never disagree with the game it points at.
 */
export type SlateStoryKind = "most-decisive" | "closest" | "highest-scoring" | "biggest-player-impact";

export interface SlateStory {
  kind: SlateStoryKind;
  /** Human label for the category ("Most decisive matchup"). */
  label: string;
  gamePk: number;
  slug: string;
  href: string;
  awayTeam: string;
  homeTeam: string;
  awayLogo: string | null;
  homeLogo: string | null;
  /** The answer, e.g. "TEX wins 69% of simulations". */
  headline: string;
  /** The frequency behind it, e.g. "6,890 / 10,000 simulations". Null when the run count is unknown. */
  detail: string | null;
  /** Present only on the player story, so the surface can render a portrait with team + opponent context. */
  player: { name: string; playerId: number | null; team: string; opponent: string | null } | null;
}

/**
 * A comparative superlative needs something to compare against. With a single simulated game, "most decisive"
 * and "closest" would both point at it, which reads as analysis but is just the only row.
 */
export const MIN_GAMES_FOR_COMPARISON = 2;

const identity = (g: SlatePredictionGame) => ({
  gamePk: g.gamePk,
  slug: g.slug,
  href: g.href,
  awayTeam: g.awayTeam,
  homeTeam: g.homeTeam,
  awayLogo: g.awayLogo,
  homeLogo: g.homeLogo,
});

/**
 * Rank the slate into its four headline stories. Games missing the value a category needs are excluded from
 * THAT category (never given a stand-in); a category with no qualifying game is omitted entirely. Ties break
 * on slug so the output is deterministic.
 */
export function buildSlateStories(games: SlatePredictionGame[]): SlateStory[] {
  const live = games.filter((g) => g.prediction && g.prediction.status !== "unavailable");
  const stories: SlateStory[] = [];

  // ── Decisiveness pair: the predicted winner's own probability (always >= 0.5 by construction). ──
  const byDecisiveness = live
    .filter((g) => g.prediction.moneyline != null)
    .sort(
      (a, b) =>
        b.prediction.moneyline!.simulationProbability - a.prediction.moneyline!.simulationProbability ||
        a.slug.localeCompare(b.slug),
    );
  if (byDecisiveness.length >= MIN_GAMES_FOR_COMPARISON) {
    const decisive = byDecisiveness[0];
    const closest = byDecisiveness[byDecisiveness.length - 1];
    for (const [kind, label, g] of [
      ["most-decisive", "Most decisive matchup", decisive],
      ["closest", "Closest simulation", closest],
    ] as const) {
      const ml = g.prediction.moneyline!;
      stories.push({
        kind,
        label,
        ...identity(g),
        headline: `${ml.team} wins ${Math.round(ml.simulationProbability * 100)}% of simulations`,
        detail:
          g.simulationCount != null ? simulationFrequency(ml.simulationProbability, g.simulationCount) : null,
        player: null,
      });
    }
  }

  // ── Highest scoring: the median simulated total runs (evidence on the total prediction). ──
  const byTotal = live
    .filter((g) => g.prediction.total?.simulationMedian != null)
    .sort(
      (a, b) =>
        b.prediction.total!.simulationMedian! - a.prediction.total!.simulationMedian! ||
        a.slug.localeCompare(b.slug),
    );
  if (byTotal.length >= MIN_GAMES_FOR_COMPARISON) {
    const g = byTotal[0];
    stories.push({
      kind: "highest-scoring",
      label: "Highest scoring simulation",
      ...identity(g),
      headline: `${g.prediction.total!.simulationMedian} total runs in the median simulation`,
      detail: null,
      player: null,
    });
  }

  // ── Biggest player impact: the single most confident player outcome anywhere on the slate. ──
  let best: { g: SlatePredictionGame; p: PlayerPrediction } | null = null;
  for (const g of live) {
    for (const p of g.playerPredictions ?? []) {
      if (p.simulationProbability == null) continue;
      if (
        !best ||
        p.simulationProbability > best.p.simulationProbability ||
        (p.simulationProbability === best.p.simulationProbability && g.slug.localeCompare(best.g.slug) < 0)
      ) {
        best = { g, p };
      }
    }
  }
  if (best) {
    const { g, p } = best;
    stories.push({
      kind: "biggest-player-impact",
      label: "Biggest player impact",
      ...identity(g),
      headline: `${p.player} ${p.pick} ${p.line} ${p.marketLabel}`,
      detail: g.simulationCount != null ? simulationFrequency(p.simulationProbability, g.simulationCount) : null,
      player: { name: p.player, playerId: p.playerId ?? null, team: p.team, opponent: p.opponent ?? null },
    });
  }

  return stories;
}
