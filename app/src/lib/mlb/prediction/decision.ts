/**
 * CANONICAL PREDICTION DECISION ENGINE (Sprint 009 · Phase 2/4). Pure + deterministic: it reads the Sprint
 * 008 full-game artifact (never re-simulates, never mutates it) and the market snapshot (threshold + display
 * comparison only), and returns ONE directional prediction object. The market NEVER determines the direction
 * of a prediction — only the line a simulated distribution is evaluated against. Same artifact + same line
 * snapshot ⇒ byte-identical decision.
 */

import type { FullGameSimGame } from "@/lib/mlb/full-game/types";
import { strengthLabel, type StrengthLabel } from "./strength";
import { homeCoverProbability } from "../../markets/game-intelligence";
import type {
  GamePredictionDecision,
  MarketAgreement,
  PlayerPrediction,
  Side,
  TeamTotalPrediction,
} from "./types";

/**
 * v2 (TRUTH-001, founder decision 2026-10-09): the run-line pick is evaluated at the sportsbook's POSTED signed
 * line. v1 picked ±1.5 off the simulated favourite whatever the book posted, so 218 of 579 v1 picks sat on the
 * opposite sign to the book's line for that team. v1 picks stay as published and graded under `run_line`; v2
 * picks grade under `run_line_posted`, so the two definitions never share a record.
 */
export const DECISION_ENGINE_VERSION = "mlb-prediction-2026.10-v2";

/** Agreement is ALIGNED within this band (in probability points); descriptive only — never "edge". */
const AGREEMENT_EPSILON = 0.03;

/** Minimal player-pick input the engine consumes (from the legacy prop simulator's generated picks). */
export interface PlayerPickInput {
  player: string;
  team?: string | null;
  market: string;
  marketLabel?: string | null;
  line: number;
  side: "over" | "under";
  /** Simulated probability of THIS pick's side (0..1). */
  modelProbability: number;
  /** Market-implied probability of THIS pick's side, when known. */
  marketProbability?: number | null;
}

const MARKET_LABELS: Record<string, string> = {
  batter_hits: "Hits",
  batter_total_bases: "Total bases",
  batter_hits_runs_rbis: "Hits + Runs + RBIs",
  batter_home_runs: "Home runs",
  batter_runs_scored: "Runs",
  batter_rbis: "RBIs",
  pitcher_strikeouts: "Strikeouts",
};

const marketAgreement = (sim: number, market: number | null): MarketAgreement => {
  if (market == null) return "NO MARKET";
  if (Math.abs(sim - market) <= AGREEMENT_EPSILON) return "ALIGNED";
  return sim > market ? "MODEL HIGHER" : "MODEL LOWER";
};

/** Empirical over/under/push against a line, read from the artifact's integer total distribution. */
function overUnderPush(distribution: { value: number; probability: number }[], line: number) {
  let over = 0;
  let under = 0;
  let push = 0;
  for (const b of distribution) {
    if (b.value > line) over += b.probability;
    else if (b.value < line) under += b.probability;
    else push += b.probability;
  }
  return { over, under, push };
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Derive ONE canonical player prediction from a legacy prop pick. The direction is the side with the greater
 * SIMULATED probability (never the model-vs-market gap): if the pick's own side has < 0.5 simulated
 * probability, the opposite side is the prediction. Shared by the per-game decision AND the /today category
 * dashboards so a given player shows the SAME pick everywhere. Optional playerId/opponent enrich the display
 * only (portrait + matchup) and never affect the pick.
 */
export function buildPlayerPrediction(
  p: PlayerPickInput,
  enrich?: { playerId?: number | null; team?: string | null; opponent?: string | null },
): PlayerPrediction {
  const overIsHigher = p.side === "over" ? p.modelProbability >= 0.5 : p.modelProbability < 0.5;
  const pick: "OVER" | "UNDER" = overIsHigher ? "OVER" : "UNDER";
  const simProb = p.side === "over"
    ? overIsHigher ? p.modelProbability : 1 - p.modelProbability
    : overIsHigher ? 1 - p.modelProbability : p.modelProbability;
  const mp = p.marketProbability ?? null;
  const marketForPick = mp == null ? null : pick === (p.side === "over" ? "OVER" : "UNDER") ? mp : 1 - mp;
  return {
    player: p.player,
    team: enrich?.team ?? p.team ?? "",
    market: p.market,
    marketLabel: p.marketLabel ?? MARKET_LABELS[p.market] ?? p.market,
    line: p.line,
    pick,
    simulationProbability: round3(simProb),
    marketImpliedProbability: marketForPick == null ? null : round3(marketForPick),
    strengthLabel: strengthLabel(simProb),
    source: "legacy_prop_engine",
    playerId: enrich?.playerId ?? null,
    opponent: enrich?.opponent ?? null,
  };
}

const signed = (line: number): string => (line > 0 ? `+${line}` : `${line}`);

/**
 * The run-line call at the book's posted line (TRUTH-001 / founder decision 2026-10-09, Option A).
 *
 * `market.runLine.line` is the HOME side's signed line as captured (−1.5 home lays, +1.5 home receives; an
 * alternate such as +2.5 is possible) and `market.runLine.homeCover` is the book's no-vig probability that home
 * covers at that line. The model side is `homeCoverProbability` — the one sign rule shared with /markets and the
 * report Overview. The pick is whichever side the simulation gives the higher cover probability AT THAT LINE.
 *
 * Refused (null, with a reason) when: no market or no posted run line; the line is not a half-run (an integer
 * line can push and the push is not modelled here); the simulation published no cover entry at that magnitude.
 */
export function postedRunLine(
  game: Pick<FullGameSimGame, "gamePk" | "runLine" | "market">,
  teamName: (side: Side) => string,
): { prediction: GamePredictionDecision["runLine"]; unavailableReason: string | null } {
  const posted = game.market?.runLine ?? null;
  const homeLine = posted?.line;
  if (typeof homeLine !== "number" || !Number.isFinite(homeLine) || homeLine === 0) {
    return { prediction: null, unavailableReason: "Run line: no posted market line." };
  }
  if (Math.abs(homeLine % 1) !== 0.5) {
    return { prediction: null, unavailableReason: `Run line: the posted line ${signed(homeLine)} can push; push is not modelled, so no pick.` };
  }
  const model = homeCoverProbability({ gamePk: game.gamePk, runLine: game.runLine ?? [] }, homeLine);
  if (!model) {
    return { prediction: null, unavailableReason: `Run line: the simulation did not publish a ${Math.abs(homeLine)}-run margin, so the posted ${signed(homeLine)} cannot be evaluated.` };
  }
  const homeP = model.prob;
  const awayP = 1 - homeP; // a half-run line cannot push
  const pickSide: Side = homeP >= awayP ? "home" : "away";
  const pickLine = pickSide === "home" ? homeLine : -homeLine;
  const pickP = pickSide === "home" ? homeP : awayP;
  const marketHome = typeof posted?.homeCover === "number" && Number.isFinite(posted.homeCover) ? posted.homeCover : null;
  const marketPick = marketHome == null ? null : pickSide === "home" ? marketHome : 1 - marketHome;
  return {
    unavailableReason: null,
    prediction: {
      basis: "POSTED_LINE",
      // The book's favourite: the side laying the runs at the posted line.
      favorite: homeLine < 0 ? "home" : "away",
      line: Math.abs(homeLine),
      homeLine,
      pick: `${teamName(pickSide)} ${signed(pickLine)}`,
      pickSide,
      pickLine,
      coverProbability: round3(pickP),
      opposingCoverProbability: round3(1 - pickP),
      pushProbability: 0,
      marketImpliedProbability: marketPick == null ? null : Math.round(marketPick * 10000) / 10000,
      bookmaker: game.market?.bookmaker ?? null,
      capturedAt: game.market?.capturedAt ?? null,
      strengthLabel: strengthLabel(pickP),
    },
  };
}

/** Build the canonical directional prediction for one game. Deterministic; never fabricates an unsupported pick. */
export function buildGamePredictionDecision(
  game: FullGameSimGame,
  playerPicks: PlayerPickInput[] | null,
  opts?: { maxPlayers?: number },
): GamePredictionDecision {
  const maxPlayers = opts?.maxPlayers ?? 5;
  const base = {
    gamePk: game.gamePk,
    slateDate: game.date,
    slug: game.slug,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayTeamName: game.awayTeamName,
    homeTeamName: game.homeTeamName,
    artifactHash: game.artifactHash,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    completeness: game.completeness,
    market: game.market,
  };
  const unavailableReasons: string[] = [];

  // A game with no full-game outputs can produce no predictions — fail closed with a reason.
  if (game.status === "unavailable" || !game.winProbability || !game.runs || !game.totalRuns) {
    return {
      ...base,
      status: "unavailable",
      predictedWinner: null,
      projectedScore: null,
      moneyline: null,
      total: null,
      runLine: null,
      teamTotals: [],
      topPlayerPredictions: [],
      unavailableReasons: [
        game.gameStory?.[0] ?? "No full-game simulation is available for this game.",
      ],
    };
  }

  const teamName = (side: Side) => (side === "home" ? game.homeTeam : game.awayTeam);

  // ── Moneyline — the higher simulated win probability (never the market). ──
  const winnerSide: Side = game.winProbability.home >= game.winProbability.away ? "home" : "away";
  const winnerProb = winnerSide === "home" ? game.winProbability.home : game.winProbability.away;
  const mlMarket = winnerSide === "home" ? game.market?.moneyline?.home ?? null : game.market?.moneyline?.away ?? null;
  const moneyline = {
    side: winnerSide,
    team: teamName(winnerSide),
    simulationProbability: round3(winnerProb),
    marketImpliedProbability: mlMarket != null ? round3(mlMarket) : null,
    marketAgreement: marketAgreement(winnerProb, mlMarket),
    strengthLabel: strengthLabel(winnerProb),
  };

  // ── Projected score — the median simulated team runs (ONE canonical methodology). ──
  const projectedScore = {
    away: game.runs.away.median,
    home: game.runs.home.median,
    label: "Median simulation score",
  };

  // ── Total — empirical over/under against the POSTED line (not the median). ──
  const totalLine = game.market?.total?.line ?? null;
  let total: GamePredictionDecision["total"];
  if (totalLine == null) {
    total = {
      line: null,
      pick: "UNAVAILABLE",
      overProbability: null,
      underProbability: null,
      pushProbability: null,
      simulationMedian: game.totalRuns.median,
      marketImpliedOver: null,
      strengthLabel: null,
      unavailableReason: "No posted game-total line to evaluate against.",
    };
    unavailableReasons.push("Total: no posted market line.");
  } else {
    const { over, under, push } = overUnderPush(game.totalRuns.distribution, totalLine);
    const pick = over > under ? "OVER" : under > over ? "UNDER" : push > 0 ? "PUSH" : "OVER";
    const selectedProb = pick === "OVER" ? over : pick === "UNDER" ? under : push;
    total = {
      line: totalLine,
      pick,
      overProbability: round3(over),
      underProbability: round3(under),
      pushProbability: round3(push),
      simulationMedian: game.totalRuns.median,
      marketImpliedOver: game.market?.total?.over != null ? round3(game.market.total.over) : null,
      strengthLabel: strengthLabel(selectedProb),
    };
  }

  // ── Run line — evaluated at the sportsbook's POSTED signed line (v2). No posted line → no pick: a line is
  //    never inferred from the simulated favourite or from the ±1.5 convention. ──
  const runLineDecision = postedRunLine(game, teamName);
  const runLine: GamePredictionDecision["runLine"] = runLineDecision.prediction;
  if (runLineDecision.unavailableReason) unavailableReasons.push(runLineDecision.unavailableReason);

  // ── Team totals — only where a real market team-total line exists. None is ingested today, so these are
  // UNAVAILABLE with the simulated team-run median shown as evidence (never a fabricated pick). ──
  const teamTotals: TeamTotalPrediction[] = (["away", "home"] as Side[]).map((side) => ({
    team: teamName(side),
    side,
    line: null,
    pick: "UNAVAILABLE",
    overProbability: null,
    underProbability: null,
    pushProbability: null,
    simulationMedian: side === "home" ? game.runs!.home.median : game.runs!.away.median,
    unavailableReason: "No posted team-total line.",
  }));
  unavailableReasons.push("Team totals: no posted market lines (simulated team runs shown as evidence).");

  // ── Top player predictions — direction from the SIMULATED probability (never the model-vs-market gap). ──
  const topPlayerPredictions: PlayerPrediction[] = (playerPicks ?? [])
    .map((p) => buildPlayerPrediction(p))
    .sort((a, b) => b.simulationProbability - a.simulationProbability)
    .slice(0, maxPlayers);

  return {
    ...base,
    status: game.status,
    predictedWinner: { side: winnerSide, team: teamName(winnerSide) },
    projectedScore,
    moneyline,
    total,
    runLine,
    teamTotals,
    topPlayerPredictions,
    unavailableReasons,
  };
}
