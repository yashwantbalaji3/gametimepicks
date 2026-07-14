/**
 * Internal Soccer Projection Engine V1 — a REAL projection model, not sportsbook de-vig.
 *
 * This is GameTime's first internal soccer engine: a bivariate-Poisson scoreline model whose supremacy is
 * driven by FIFA rating points (an input we actually have, 110/110 tournament coverage) and whose scoring
 * volume is anchored to a World-Cup base rate (optionally to the market total). From the scoreline matrix it
 * derives 1X2, total goals, BTTS, double chance, draw-no-bet, and a correct-score distribution.
 *
 * HONESTY (this is the whole point of the internal-first rule):
 *   • modelMode is `internal_soccer_projection_v1` when the prediction uses ONLY ratings (independent of the
 *     book), or `market_anchored_soccer_v1` when the scoring volume is anchored to the market total. It is
 *     NEVER labelled "independent"/"validated" — those are earned by a passing backtest, not by existing.
 *   • It is a rating-driven Poisson model. It is NOT an xG model, NOT trained on event data, and its
 *     correct-score distribution is a *model* output (bivariate Poisson), disclosed as such.
 *   • Pure/deterministic: no fs, no React, no randomness, no clock. Same inputs → same output. This is what
 *     makes it unit-testable and backtestable with leakage control (ratings are static/pre-match).
 *
 * Nothing here is web-served. The build script writes to data/internal/... only.
 */

export type SoccerModelMode = "internal_soccer_projection_v1" | "market_anchored_soccer_v1";

export interface Distribution {
  /** index i => probability of exactly i goals (0..len-2), with the final element the overflow tail (>= len-1). */
  pmf: number[];
  expected: number;
}

export interface ScorelineProbability {
  home: number;
  away: number;
  prob: number;
}

export interface MatchProjection {
  modelMode: SoccerModelMode;
  lambdaHome: number;
  lambdaAway: number;
  expectedGoals: { home: number; away: number; source: "model" };
  matchResult90: { homeWin: number; draw: number; awayWin: number };
  totalGoals: { line: number; over: number; under: number; expected: number; distribution: Distribution };
  btts: { yes: number; no: number };
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  drawNoBet: { home: number; away: number };
  correctScore: { distribution: ScorelineProbability[]; source: "internal_model" };
}

export interface ProjectMatchInput {
  homeFifaPoints: number;
  awayFifaPoints: number;
  /** Anchor total goals to the market line when provided → modelMode becomes market_anchored_soccer_v1. */
  marketTotalLine?: number | null;
  /** World Cup is largely neutral-site; default 0. A small home edge for a true host game can be passed. */
  homeAdvantageGoals?: number;
  /** Tuning knobs — exposed so the backtest can grid-search honestly rather than hard-coding magic numbers. */
  supremacyPerFifaPoint?: number;
  baseTotalGoals?: number;
  maxGoals?: number;
}

/** Poisson pmf. */
export function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // exp(k*ln(lambda) - lambda - ln(k!)) — stable for the small k we use.
  let logFactK = 0;
  for (let i = 2; i <= k; i++) logFactK += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFactK);
}

/** Full scoreline matrix P(home=i, away=j), i,j in 0..maxGoals, tail mass folded into the maxGoals bucket. */
export function scorelineMatrix(lambdaHome: number, lambdaAway: number, maxGoals: number): number[][] {
  const hp: number[] = [];
  const ap: number[] = [];
  let hCum = 0;
  let aCum = 0;
  for (let i = 0; i < maxGoals; i++) {
    hp[i] = poisson(i, lambdaHome);
    ap[i] = poisson(i, lambdaAway);
    hCum += hp[i];
    aCum += ap[i];
  }
  hp[maxGoals] = Math.max(0, 1 - hCum); // overflow tail so rows sum to 1
  ap[maxGoals] = Math.max(0, 1 - aCum);
  const m: number[][] = [];
  for (let i = 0; i <= maxGoals; i++) {
    m[i] = [];
    for (let j = 0; j <= maxGoals; j++) m[i][j] = hp[i] * ap[j];
  }
  return m;
}

const DEFAULTS = {
  supremacyPerFifaPoint: 0.0035, // ~0.35 goals of supremacy per 100 FIFA points
  baseTotalGoals: 2.6, // long-run World Cup goals-per-match
  maxGoals: 10,
  supremacyCap: 2.6, // never let ratings alone imply more than a ~2.6 goal edge
};

/**
 * Project a single match from ratings. Independent of the book unless marketTotalLine is supplied (which only
 * sets the scoring VOLUME, never the winner — supremacy is always rating-driven).
 */
export function projectMatch(input: ProjectMatchInput): MatchProjection {
  const supPer = input.supremacyPerFifaPoint ?? DEFAULTS.supremacyPerFifaPoint;
  const maxGoals = input.maxGoals ?? DEFAULTS.maxGoals;
  const homeAdv = input.homeAdvantageGoals ?? 0;
  const marketAnchored = typeof input.marketTotalLine === "number" && input.marketTotalLine > 0;
  const baseTotal = marketAnchored ? (input.marketTotalLine as number) : (input.baseTotalGoals ?? DEFAULTS.baseTotalGoals);

  const rawSupremacy = (input.homeFifaPoints - input.awayFifaPoints) * supPer;
  const supremacy = Math.max(-DEFAULTS.supremacyCap, Math.min(DEFAULTS.supremacyCap, rawSupremacy)) + homeAdv;

  const lambdaHome = Math.max(0.12, (baseTotal + supremacy) / 2);
  const lambdaAway = Math.max(0.12, (baseTotal - supremacy) / 2);

  const m = scorelineMatrix(lambdaHome, lambdaAway, maxGoals);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let bttsYes = 0;
  const totalPmf: number[] = new Array(maxGoals * 2 + 1).fill(0);
  const scores: ScorelineProbability[] = [];
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = m[i][j];
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
      if (i >= 1 && j >= 1) bttsYes += p;
      totalPmf[i + j] += p;
      if (i <= 5 && j <= 5) scores.push({ home: i, away: j, prob: p });
    }
  }

  const totalExpected = lambdaHome + lambdaAway;
  const line = 2.5; // the standard soccer total line for over/under reporting
  let over = 0;
  for (let t = Math.ceil(line); t < totalPmf.length; t++) over += totalPmf[t];
  const under = Math.max(0, 1 - over);

  scores.sort((a, b) => b.prob - a.prob);

  return {
    modelMode: marketAnchored ? "market_anchored_soccer_v1" : "internal_soccer_projection_v1",
    lambdaHome,
    lambdaAway,
    expectedGoals: { home: lambdaHome, away: lambdaAway, source: "model" },
    matchResult90: { homeWin, draw, awayWin },
    totalGoals: { line, over, under, expected: totalExpected, distribution: { pmf: totalPmf, expected: totalExpected } },
    btts: { yes: bttsYes, no: Math.max(0, 1 - bttsYes) },
    doubleChance: { homeOrDraw: homeWin + draw, awayOrDraw: awayWin + draw, homeOrAway: homeWin + awayWin },
    drawNoBet: { home: homeWin / (homeWin + awayWin || 1), away: awayWin / (homeWin + awayWin || 1) },
    correctScore: { distribution: scores.slice(0, 12), source: "internal_model" },
  };
}

/** Multiclass Brier score for a 1X2 prediction. outcome: "home" | "draw" | "away". Lower is better; 0 perfect. */
export function brier1x2(p: { homeWin: number; draw: number; awayWin: number }, outcome: "home" | "draw" | "away"): number {
  const y = { home: outcome === "home" ? 1 : 0, draw: outcome === "draw" ? 1 : 0, away: outcome === "away" ? 1 : 0 };
  return (p.homeWin - y.home) ** 2 + (p.draw - y.draw) ** 2 + (p.awayWin - y.away) ** 2;
}

/** Ranked-probability score (ordinal, home<draw<away) — a fairer soccer metric than plain Brier. */
export function rps1x2(p: { homeWin: number; draw: number; awayWin: number }, outcome: "home" | "draw" | "away"): number {
  const P = [p.homeWin, p.draw, p.awayWin];
  const O = [outcome === "home" ? 1 : 0, outcome === "draw" ? 1 : 0, outcome === "away" ? 1 : 0];
  let cumP = 0;
  let cumO = 0;
  let sum = 0;
  for (let i = 0; i < 2; i++) {
    cumP += P[i];
    cumO += O[i];
    sum += (cumP - cumO) ** 2;
  }
  return sum; // divided by (r-1)=2 by convention; kept raw for aggregation, normalized in the report
}
