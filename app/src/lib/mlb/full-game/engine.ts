/**
 * FULL-GAME ENGINE — base/out state → half-inning → nine innings + extras (Sprint 008 · Phase 2.2).
 *
 * Simulates ONE complete baseball game from 0–0 through the final out using the plate-appearance model.
 * Deterministic: every random choice descends from the injected SeededRng. Produces the final score AND
 * the per-player box-score line from the SAME events (so player props come from this universe, Phase 3).
 *
 * Documented baseball rules implemented (all testable, no impossible states):
 *   • 3 outs end a half-inning; away bats the top, home the bottom; batting order persists across innings.
 *   • Bottom of the 9th is skipped if the home team already leads; walk-off ends the inning the moment the
 *     home team takes the lead in the 9th or later.
 *   • Extra innings use the 2020s automatic runner on second (the prior half's last batter), per the
 *     current MLB rule; a documented safety cap prevents non-termination.
 *   • Starter faces batters until a batters-faced cap or a blow-up run threshold, then a league-average
 *     team BULLPEN aggregate finishes — no fabricated reliever identities.
 */

import { SeededRng } from "../../game-simulations/rng";
import {
  LEAGUE,
  buildPaOutcome,
  pitcherStrikeoutRate,
  samplePaOutcome,
  type PaOutcomeProbs,
} from "./plate-appearance";
import type { BatterInput, GameInput, PitcherInput } from "./types";

/** Starter removal policy (documented, deterministic thresholds). */
const STARTER_MAX_BATTERS_FACED = 25; // ≈ 6 innings of work
const STARTER_CHASE_RUNS = 7; // pulled early if the inning-by-inning damage reaches a blow-up
const EXTRA_INNINGS_CAP = 30; // safety cap so a pathological tie always terminates (documented)

/** One batter's accumulated line for a single simulated game. */
export interface BatterGameLine {
  pa: number;
  hits: number;
  totalBases: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

/** One STARTER's accumulated line for a single simulated game (bullpen is not tracked per-pitcher). */
export interface PitcherGameLine {
  battersFaced: number;
  strikeouts: number;
  hitsAllowed: number;
  runsAllowed: number;
  outsRecorded: number;
}

/** The result of one complete simulated game. */
export interface GameResult {
  awayRuns: number;
  homeRuns: number;
  innings: number;
  extra: boolean;
  awayBatters: BatterGameLine[];
  homeBatters: BatterGameLine[];
  awayStarter: PitcherGameLine;
  homeStarter: PitcherGameLine;
}

const emptyBatterLine = (): BatterGameLine => ({
  pa: 0,
  hits: 0,
  totalBases: 0,
  homeRuns: 0,
  runs: 0,
  rbi: 0,
  walks: 0,
  strikeouts: 0,
});
const emptyPitcherLine = (): PitcherGameLine => ({
  battersFaced: 0,
  strikeouts: 0,
  hitsAllowed: 0,
  runsAllowed: 0,
  outsRecorded: 0,
});

/** Precomputed PA distributions for one batter vs the opposing starter and vs the bullpen. */
interface BatterModel {
  vsStarter: PaOutcomeProbs;
  vsBullpen: PaOutcomeProbs;
}

/** The mutable state of the pitcher currently on the mound for one team. */
interface MoundState {
  usingStarter: boolean;
  line: PitcherGameLine; // the STARTER's line (frozen once the bullpen enters)
  bullpenRuns: number; // runs the bullpen has allowed (not reported per-pitcher)
}

function buildBatterModels(lineup: BatterInput[], opposingStarter: PitcherInput | null): BatterModel[] {
  const starterK = pitcherStrikeoutRate(opposingStarter?.expStrikeouts ?? null, true);
  return lineup.map((b) => ({
    vsStarter: buildPaOutcome({ expHits: b.expHits, expTotalBases: b.expTotalBases, pitcherKRate: starterK }),
    vsBullpen: buildPaOutcome({ expHits: b.expHits, expTotalBases: b.expTotalBases, pitcherKRate: LEAGUE.BULLPEN_K_RATE }),
  }));
}

/**
 * Advance the base/out state for one non-out reaching event. `bases` holds the lineup-slot index of the
 * runner on 1st/2nd/3rd (-1 = empty). Returns the runs scored (as scoring runner slots) — RBI is credited
 * to the batter by the caller. Advancement probabilities are documented league approximations.
 */
function advanceReachingBase(
  outcome: "walk" | "single" | "double" | "triple" | "homeRun",
  bases: [number, number, number],
  batterSlot: number,
  rng: SeededRng,
): number[] {
  const scored: number[] = [];
  const [b1, b2, b3] = bases;
  if (outcome === "homeRun") {
    if (b3 >= 0) scored.push(b3);
    if (b2 >= 0) scored.push(b2);
    if (b1 >= 0) scored.push(b1);
    scored.push(batterSlot);
    bases[0] = bases[1] = bases[2] = -1;
    return scored;
  }
  if (outcome === "triple") {
    if (b3 >= 0) scored.push(b3);
    if (b2 >= 0) scored.push(b2);
    if (b1 >= 0) scored.push(b1);
    bases[0] = bases[1] = -1;
    bases[2] = batterSlot;
    return scored;
  }
  if (outcome === "double") {
    if (b3 >= 0) scored.push(b3);
    if (b2 >= 0) scored.push(b2);
    // runner from 1st scores a bit more often than not, else to 3rd (league-typical).
    let newThird = -1;
    if (b1 >= 0) {
      if (rng.next() < 0.6) scored.push(b1);
      else newThird = b1;
    }
    bases[0] = -1;
    bases[1] = batterSlot;
    bases[2] = newThird;
    return scored;
  }
  if (outcome === "single") {
    if (b3 >= 0) scored.push(b3);
    let newThird = -1;
    let newSecond = -1;
    if (b2 >= 0) {
      if (rng.next() < 0.7) scored.push(b2);
      else newThird = b2;
    }
    if (b1 >= 0) {
      // to 2nd most of the time, occasionally first-to-third.
      if (rng.next() < 0.32 && newThird < 0) newThird = b1;
      else newSecond = b1;
    }
    bases[0] = batterSlot;
    bases[1] = newSecond;
    bases[2] = newThird;
    return scored;
  }
  // walk / HBP — only forced runners advance.
  if (b1 >= 0) {
    if (b2 >= 0) {
      if (b3 >= 0) scored.push(b3);
      bases[2] = b2;
    }
    bases[1] = b1;
  }
  bases[0] = batterSlot;
  return scored;
}

/**
 * Simulate one half-inning. Mutates the batting-order pointer, mound state, and each batter's game line.
 * `walkOff` (bottom of the 9th+) carries the away total to beat so the inning ends the instant the home
 * team takes the lead. Returns runs scored and the new order pointer.
 */
function simulateHalfInning(params: {
  lineup: BatterInput[];
  models: BatterModel[];
  batterLines: BatterGameLine[];
  mound: MoundState;
  orderPtr: number;
  rng: SeededRng;
  isExtra: boolean;
  walkOff: { awayTotal: number; homeBefore: number } | null;
}): { runs: number; orderPtr: number } {
  const { lineup, models, batterLines, mound, rng, isExtra, walkOff } = params;
  const n = lineup.length;
  let orderPtr = params.orderPtr;
  let outs = 0;
  let runs = 0;
  const bases: [number, number, number] = [-1, -1, -1];
  // Automatic runner on second in extras: the player who made the last out (slot before the leadoff batter).
  if (isExtra) bases[1] = (orderPtr - 1 + n) % n;

  while (outs < 3) {
    const slot = orderPtr % n;
    const model = models[slot];
    const probs = mound.usingStarter ? model.vsStarter : model.vsBullpen;
    const outcome = samplePaOutcome(probs, rng.next());

    const line = batterLines[slot];
    line.pa += 1;
    if (mound.usingStarter) mound.line.battersFaced += 1;

    if (outcome === "strikeout") {
      outs += 1;
      line.strikeouts += 1;
      if (mound.usingStarter) {
        mound.line.strikeouts += 1;
        mound.line.outsRecorded += 1;
      }
    } else if (outcome === "fieldOut") {
      // Sacrifice fly / productive out: a runner on third scores with modest probability when < 2 outs.
      if (outs < 2 && bases[2] >= 0 && rng.next() < 0.4) {
        runs += 1;
        batterLines[bases[2]].runs += 1;
        line.rbi += 1;
        bases[2] = -1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
      outs += 1;
      if (mound.usingStarter) mound.line.outsRecorded += 1;
    } else if (outcome === "walk") {
      const scored = advanceReachingBase("walk", bases, slot, rng);
      line.walks += 1;
      for (const s of scored) {
        runs += 1;
        batterLines[s].runs += 1;
        line.rbi += 1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
    } else {
      // a base hit
      const basesForHit = outcome === "single" ? 1 : outcome === "double" ? 2 : outcome === "triple" ? 3 : 4;
      line.hits += 1;
      line.totalBases += basesForHit;
      if (outcome === "homeRun") line.homeRuns += 1;
      if (mound.usingStarter) mound.line.hitsAllowed += 1;
      const scored = advanceReachingBase(outcome, bases, slot, rng);
      for (const s of scored) {
        runs += 1;
        batterLines[s].runs += 1;
        line.rbi += 1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
    }

    orderPtr += 1;

    // Starter removal: pulled after a batters-faced cap or a blow-up run total.
    if (mound.usingStarter && (mound.line.battersFaced >= STARTER_MAX_BATTERS_FACED || mound.line.runsAllowed >= STARTER_CHASE_RUNS)) {
      mound.usingStarter = false;
    }

    // Walk-off: the moment the home team leads in the bottom of the 9th+, the game ends.
    if (walkOff && walkOff.homeBefore + runs > walkOff.awayTotal) break;
  }

  return { runs, orderPtr };
}

/** Simulate ONE complete game. Deterministic given the injected RNG. */
export function simulateGame(game: GameInput, rng: SeededRng): GameResult {
  const awayModels = buildBatterModels(game.awayLineup, game.homeStarter);
  const homeModels = buildBatterModels(game.homeLineup, game.awayStarter);
  const awayLines = game.awayLineup.map(emptyBatterLine);
  const homeLines = game.homeLineup.map(emptyBatterLine);

  // The home team's pitcher faces the away lineup; the away team's pitcher faces the home lineup.
  const homeMound: MoundState = { usingStarter: !!game.homeStarter, line: emptyPitcherLine(), bullpenRuns: 0 };
  const awayMound: MoundState = { usingStarter: !!game.awayStarter, line: emptyPitcherLine(), bullpenRuns: 0 };

  let awayRuns = 0;
  let homeRuns = 0;
  let awayPtr = 0;
  let homePtr = 0;
  let inning = 1;
  let extra = false;

  for (; ; inning += 1) {
    if (inning > 9) extra = true;
    // TOP — away bats vs the home team's pitcher.
    const top = simulateHalfInning({
      lineup: game.awayLineup,
      models: awayModels,
      batterLines: awayLines,
      mound: homeMound,
      orderPtr: awayPtr,
      rng,
      isExtra: inning > 9,
      walkOff: null,
    });
    awayRuns += top.runs;
    awayPtr = top.orderPtr;

    // Bottom of the 9th+ is skipped when the home team already leads.
    if (inning >= 9 && homeRuns > awayRuns) break;

    // BOTTOM — home bats vs the away team's pitcher (walk-off aware in the 9th+).
    const bottom = simulateHalfInning({
      lineup: game.homeLineup,
      models: homeModels,
      batterLines: homeLines,
      mound: awayMound,
      orderPtr: homePtr,
      rng,
      isExtra: inning > 9,
      walkOff: inning >= 9 ? { awayTotal: awayRuns, homeBefore: homeRuns } : null,
    });
    homeRuns += bottom.runs;
    homePtr = bottom.orderPtr;

    if (inning >= 9 && homeRuns !== awayRuns) break;
    if (inning >= EXTRA_INNINGS_CAP) {
      // Safety valve: award the home team a single run so the game always terminates (documented, ~never hit).
      if (homeRuns === awayRuns) homeRuns += 1;
      break;
    }
  }

  return {
    awayRuns,
    homeRuns,
    innings: inning,
    extra,
    awayBatters: awayLines,
    homeBatters: homeLines,
    awayStarter: awayMound.line,
    homeStarter: homeMound.line,
  };
}
