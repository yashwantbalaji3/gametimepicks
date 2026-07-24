/**
 * SLATE PREDICTION VIEWS (Sprint 010). Pure derivations that turn the per-game canonical prediction objects
 * into the two /today dashboard surfaces: the Game Predictions table (one row per game) and the Top Model
 * Picks BY CATEGORY (player predictions grouped by market). Both read the SAME canonical objects the Game
 * Report uses — no re-derivation, no second engine. Nothing here invents a pick or a probability.
 */
import type { GamePredictionDecision, PlayerPrediction } from "./types";
import type { StrengthLabel } from "./strength";

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
      arr.push({ ...pp, matchup, href: g.href, gamePk: g.gamePk });
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
