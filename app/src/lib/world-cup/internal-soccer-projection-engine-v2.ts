/**
 * Internal Soccer Projection Engine V2 — rating-Poisson WITH tournament-form features.
 *
 * The tuning mission proved a global coefficient is a dead end. V2 instead adds a REAL, leakage-clean feature:
 * each team's in-tournament scoring/conceding form from matches STRICTLY BEFORE kickoff. The FIFA-Poisson base
 * (v1) is nudged by an attack×defense form factor, weighted by how many prior matches exist (1–2 games of form
 * is noisy, so it is blended toward "no adjustment"). With zero prior matches (group game 1), V2 === V1 exactly.
 *
 * modelMode: `rating_poisson_with_form_v1`. Still internal, still rating-driven, NOT independent/validated.
 * Pure/deterministic. Reuses the v1 Poisson primitives so v1 behavior is untouched.
 */
import { poisson, scorelineMatrix } from "./internal-soccer-projection-engine";
import type { MatchProjection, ScorelineProbability } from "./internal-soccer-projection-engine";

export interface TeamForm {
  goalsFor: number;
  goalsAgainst: number;
  matchesPlayed: number;
}

export interface ProjectMatchV2Input {
  homeFifaPoints: number;
  awayFifaPoints: number;
  homeForm: TeamForm;
  awayForm: TeamForm;
  /** How much to trust form at full history (matchesPlayed>=3). 0 => V2 collapses to V1. Default 0.5. */
  formWeight?: number;
  supremacyPerFifaPoint?: number;
  baseTotalGoals?: number;
  supremacyCap?: number;
  maxGoals?: number;
}

const REF_GOALS_PER_TEAM_PER_GAME = 1.3; // half of the 2.6 WC base — the "average" attack/defense rate

/** Ratio of a rate to the reference, guarded; returns 1.0 (neutral) when no history. */
function rate(count: number, games: number): number {
  if (games <= 0) return REF_GOALS_PER_TEAM_PER_GAME;
  return count / games;
}

export function projectMatchV2(input: ProjectMatchV2Input): MatchProjection & { formApplied: number } {
  const supPer = input.supremacyPerFifaPoint ?? 0.0035;
  const baseTotal = input.baseTotalGoals ?? 2.6;
  const cap = input.supremacyCap ?? 2.6;
  const maxGoals = input.maxGoals ?? 10;
  const formWeight = input.formWeight ?? 0.5;

  // v1 FIFA base
  const supremacy = Math.max(-cap, Math.min(cap, (input.homeFifaPoints - input.awayFifaPoints) * supPer));
  let lambdaHome = (baseTotal + supremacy) / 2;
  let lambdaAway = (baseTotal - supremacy) / 2;

  // Form factor: home attack rate × away defense weakness (both relative to reference), and symmetrically.
  const homeAttack = rate(input.homeForm.goalsFor, input.homeForm.matchesPlayed) / REF_GOALS_PER_TEAM_PER_GAME;
  const awayDefense = rate(input.awayForm.goalsAgainst, input.awayForm.matchesPlayed) / REF_GOALS_PER_TEAM_PER_GAME;
  const awayAttack = rate(input.awayForm.goalsFor, input.awayForm.matchesPlayed) / REF_GOALS_PER_TEAM_PER_GAME;
  const homeDefense = rate(input.homeForm.goalsAgainst, input.homeForm.matchesPlayed) / REF_GOALS_PER_TEAM_PER_GAME;
  const homeFormFactor = homeAttack * awayDefense;
  const awayFormFactor = awayAttack * homeDefense;

  // Trust form only in proportion to the SHORTER history (both teams need games for the factor to mean anything).
  const commonGames = Math.min(input.homeForm.matchesPlayed, input.awayForm.matchesPlayed);
  const w = Math.min(1, commonGames / 3) * formWeight;

  lambdaHome = Math.max(0.12, lambdaHome * (1 + w * (homeFormFactor - 1)));
  lambdaAway = Math.max(0.12, lambdaAway * (1 + w * (awayFormFactor - 1)));

  const m = scorelineMatrix(lambdaHome, lambdaAway, maxGoals);
  let homeWin = 0, draw = 0, awayWin = 0, bttsYes = 0;
  const totalPmf: number[] = new Array(maxGoals * 2 + 1).fill(0);
  const scores: ScorelineProbability[] = [];
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = m[i][j];
      if (i > j) homeWin += p; else if (i === j) draw += p; else awayWin += p;
      if (i >= 1 && j >= 1) bttsYes += p;
      totalPmf[i + j] += p;
      if (i <= 5 && j <= 5) scores.push({ home: i, away: j, prob: p });
    }
  }
  const totalExpected = lambdaHome + lambdaAway;
  let over = 0;
  for (let t = 3; t < totalPmf.length; t++) over += totalPmf[t];
  scores.sort((a, b) => b.prob - a.prob);

  return {
    modelMode: "market_anchored_soccer_v1", // shape parity; the v2 mode is carried in artifacts as rating_poisson_with_form_v1
    lambdaHome,
    lambdaAway,
    expectedGoals: { home: lambdaHome, away: lambdaAway, source: "model" },
    matchResult90: { homeWin, draw, awayWin },
    totalGoals: { line: 2.5, over, under: Math.max(0, 1 - over), expected: totalExpected, distribution: { pmf: totalPmf, expected: totalExpected } },
    btts: { yes: bttsYes, no: Math.max(0, 1 - bttsYes) },
    doubleChance: { homeOrDraw: homeWin + draw, awayOrDraw: awayWin + draw, homeOrAway: homeWin + awayWin },
    drawNoBet: { home: homeWin / (homeWin + awayWin || 1), away: awayWin / (homeWin + awayWin || 1) },
    correctScore: { distribution: scores.slice(0, 12), source: "internal_model" },
    formApplied: w,
  };
}
