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
  type LeagueParams,
  type PaOutcomeProbs,
} from "./plate-appearance";
import type { BatterInput, GameInput, PitcherInput } from "./types";

const EXTRA_INNINGS_CAP = 30; // safety cap so a pathological tie always terminates (documented)

/**
 * ENGINE PARAMETERS (P317). Every documented league approximation the engine used to hold as a literal,
 * gathered in one object so a research candidate can vary them through the SAME engine the public
 * artifact runs — never a parallel copy. `DEFAULT_ENGINE_PARAMS` IS the published engine, byte for byte:
 * a mechanism at rate 0 draws nothing from the random stream, so every committed artifact hash still
 * reproduces (pinned by engine.test / simulate.test). Anything else is research until it is adopted
 * through the registered path; no production caller passes params.
 */
export interface EngineParams {
  league: LeagueParams;
  advancement: {
    /** Runner on first scores on a double (else stops at third). */
    doubleScoresRunnerFromFirst: number;
    /** Runner on second scores on a single (else stops at third). */
    singleScoresRunnerFromSecond: number;
    /** Runner on first goes first-to-third on a single when third is open. */
    singleFirstToThird: number;
    /** A runner on third scores on a non-strikeout out with fewer than two outs (sacrifice fly / productive out). */
    productiveOutScoresFromThird: number;
    /** A non-strikeout out with a runner on first and fewer than two outs also retires that runner. 0 = never. */
    groundIntoDoublePlay: number;
    /** Before a pitch with runners on, every runner moves up one base (wild pitch / passed ball / balk). 0 = never. */
    freeAdvance: number;
  };
  starter: {
    /** Batters faced before the starter hands over to the bullpen aggregate (≈ 6 innings of work). */
    maxBattersFaced: number;
    /** Runs allowed that pull the starter early (a blow-up). */
    chaseRuns: number;
  };
}

/** The published engine's parameters — the literals it has carried since S008, unchanged. */
export const DEFAULT_ENGINE_PARAMS: EngineParams = Object.freeze({
  league: { ...LEAGUE },
  advancement: {
    doubleScoresRunnerFromFirst: 0.6,
    singleScoresRunnerFromSecond: 0.7,
    singleFirstToThird: 0.32,
    productiveOutScoresFromThird: 0.4,
    groundIntoDoublePlay: 0,
    freeAdvance: 0,
  },
  starter: { maxBattersFaced: 25, chaseRuns: 7 },
}) as EngineParams;

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

function buildBatterModels(lineup: BatterInput[], opposingStarter: PitcherInput | null, league: LeagueParams): BatterModel[] {
  const starterK = pitcherStrikeoutRate(opposingStarter?.expStrikeouts ?? null, true, league);
  return lineup.map((b) => ({
    vsStarter: buildPaOutcome({ expHits: b.expHits, expTotalBases: b.expTotalBases, pitcherKRate: starterK }, league),
    vsBullpen: buildPaOutcome({ expHits: b.expHits, expTotalBases: b.expTotalBases, pitcherKRate: league.BULLPEN_K_RATE }, league),
  }));
}

/**
 * Advance the base/out state for one non-out reaching event. `bases` holds the lineup-slot index of the
 * runner on 1st/2nd/3rd (-1 = empty). Returns the runs scored (as scoring runner slots) — RBI is credited
 * to the batter by the caller. Advancement probabilities are documented league approximations.
 */
function advanceReachingBase(
  outcome: "walk" | "single" | "double" | "triple" | "homeRun" | "reachOnError",
  bases: [number, number, number],
  batterSlot: number,
  rng: SeededRng,
  adv: EngineParams["advancement"],
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
      if (rng.next() < adv.doubleScoresRunnerFromFirst) scored.push(b1);
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
      if (rng.next() < adv.singleScoresRunnerFromSecond) scored.push(b2);
      else newThird = b2;
    }
    if (b1 >= 0) {
      // to 2nd most of the time, occasionally first-to-third.
      if (rng.next() < adv.singleFirstToThird && newThird < 0) newThird = b1;
      else newSecond = b1;
    }
    bases[0] = batterSlot;
    bases[1] = newSecond;
    bases[2] = newThird;
    return scored;
  }
  if (outcome === "reachOnError") {
    // An error: the batter reaches first and every runner moves up exactly one base.
    if (b3 >= 0) scored.push(b3);
    bases[2] = b2;
    bases[1] = b1;
    bases[0] = batterSlot;
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
  engine: EngineParams;
}): { runs: number; orderPtr: number } {
  const { lineup, models, batterLines, mound, rng, isExtra, walkOff, engine } = params;
  const adv = engine.advancement;
  const n = lineup.length;
  let orderPtr = params.orderPtr;
  let outs = 0;
  let runs = 0;
  const bases: [number, number, number] = [-1, -1, -1];
  // Automatic runner on second in extras: the player who made the last out (slot before the leadoff batter).
  if (isExtra) bases[1] = (orderPtr - 1 + n) % n;

  while (outs < 3) {
    // Free advancement before the pitch (wild pitch / passed ball / balk). Research-only: at 0 it draws nothing.
    if (adv.freeAdvance > 0 && (bases[0] >= 0 || bases[1] >= 0 || bases[2] >= 0) && rng.next() < adv.freeAdvance) {
      if (bases[2] >= 0) {
        runs += 1;
        batterLines[bases[2]].runs += 1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
      bases[2] = bases[1];
      bases[1] = bases[0];
      bases[0] = -1;
      if (walkOff && walkOff.homeBefore + runs > walkOff.awayTotal) break;
    }
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
      // Double play (research-only: at 0 it draws nothing): a runner on first is also retired with < 2 outs.
      if (adv.groundIntoDoublePlay > 0 && outs < 2 && bases[0] >= 0 && rng.next() < adv.groundIntoDoublePlay) {
        bases[0] = -1;
        outs += 1;
        if (mound.usingStarter) mound.line.outsRecorded += 1;
      }
      // Sacrifice fly / productive out: a runner on third scores with modest probability when < 2 outs
      // (a double play that ends the inning scores nobody).
      if (outs < 2 && bases[2] >= 0 && rng.next() < adv.productiveOutScoresFromThird) {
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
      const scored = advanceReachingBase("walk", bases, slot, rng, adv);
      line.walks += 1;
      for (const s of scored) {
        runs += 1;
        batterLines[s].runs += 1;
        line.rbi += 1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
    } else if (outcome === "reachOnError") {
      // Reached on an error: no hit, no RBI — the runs are simply scored.
      const scored = advanceReachingBase("reachOnError", bases, slot, rng, adv);
      for (const s of scored) {
        runs += 1;
        batterLines[s].runs += 1;
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
      const scored = advanceReachingBase(outcome, bases, slot, rng, adv);
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
    if (mound.usingStarter && (mound.line.battersFaced >= engine.starter.maxBattersFaced || mound.line.runsAllowed >= engine.starter.chaseRuns)) {
      mound.usingStarter = false;
    }

    // Walk-off: the moment the home team leads in the bottom of the 9th+, the game ends.
    if (walkOff && walkOff.homeBefore + runs > walkOff.awayTotal) break;
  }

  return { runs, orderPtr };
}

/** Simulate ONE complete game. Deterministic given the injected RNG. */
export function simulateGame(game: GameInput, rng: SeededRng, params: EngineParams = DEFAULT_ENGINE_PARAMS): GameResult {
  const awayModels = buildBatterModels(game.awayLineup, game.homeStarter, params.league);
  const homeModels = buildBatterModels(game.homeLineup, game.awayStarter, params.league);
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
      engine: params,
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
      engine: params,
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
