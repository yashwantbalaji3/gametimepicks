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
  /** Game rules (MLB-001, founder decision 6 2026-10-09). Absent = the published v2 rules (LEGACY_RULES). */
  rules?: EngineRules;
  /**
   * MLB-005 RESEARCH ONLY (coherent worlds). Absent = the published engine, byte for byte: no extra random draw, no
   * changed rate. `explicitPa` reads each batter's `pa` distributions instead of deriving them from the board's
   * projections; `workloadPmf` draws each starter's batters-faced limit from his `bfLimitPmf` once per game.
   */
  research?: { explicitPa?: boolean; workloadPmf?: boolean; substitution?: boolean };
}

/** One recorded event of a simulated game (MLB-005 world log). Emitted only when an observer is passed. */
export type WorldEvent =
  | {
    kind: "PA"; inning: number; half: "TOP" | "BOTTOM"; outsBefore: number; basesBefore: [number, number, number];
    batterSlot: number; pitcher: "STARTER" | "BULLPEN"; outcome: string; scored: number[]; rbi: number; outsAfter: number;
    /** Research (substitution): the PA was taken by the slot's replacement, not its starter. */
    sub?: boolean;
  }
  | { kind: "HALF_START"; inning: number; half: "TOP" | "BOTTOM"; bases: [number, number, number] }
  | { kind: "FREE_ADVANCE"; inning: number; half: "TOP" | "BOTTOM"; scored: number[] }
  | { kind: "STARTER_REMOVED"; inning: number; half: "TOP" | "BOTTOM"; battersFaced: number; limit: number }
  | { kind: "HALF_END"; inning: number; half: "TOP" | "BOTTOM"; runs: number; outs: number; endedOn: "HOME_RUN" | "OTHER" | null };
export type WorldObserver = (e: WorldEvent) => void;

/**
 * GAME RULES. The published engine (v2) used three simplifications the MLB-001 audit confirmed against the
 * official rules; they stay available ONLY so every committed artifact hash reproduces byte for byte.
 *
 *   extrasAutomaticRunner  ALWAYS — a runner on 2nd in every extra half-inning, postseason included.
 *                          Official (2023+): regular season only; NO automatic runner in the postseason.
 *   walkOffScoring         ALL_RUNNERS_SCORE — every runner who crosses on the ending play counts.
 *                          Official (Rule 9.06(f) / 5.08(b)): on a non-home-run, the game ends when the winning run
 *                          scores; only the runs needed to win count. A home run counts every runner.
 *   unresolvedAtCap        AWARD_HOME_RUN — a game still tied at the inning cap was given to the home team.
 *                          Corrected: DISCARD — that game is not a legal result; the caller draws a fresh game and
 *                          records how many were discarded. The cap still bounds the loop (no unbounded simulation).
 */
export interface EngineRules {
  id: string;
  extrasAutomaticRunner: "ALWAYS" | "REGULAR_SEASON_ONLY";
  walkOffScoring: "ALL_RUNNERS_SCORE" | "WINNING_RUN_ONLY";
  unresolvedAtCap: "AWARD_HOME_RUN" | "DISCARD";
}

export const LEGACY_RULES: EngineRules = Object.freeze({
  id: "mlb-rules-legacy-v2",
  extrasAutomaticRunner: "ALWAYS",
  walkOffScoring: "ALL_RUNNERS_SCORE",
  unresolvedAtCap: "AWARD_HOME_RUN",
}) as EngineRules;

/** The official 2026 MLB rules for the three corrected behaviours. */
export const OFFICIAL_RULES_2026: EngineRules = Object.freeze({
  id: "mlb-rules-official-2026",
  extrasAutomaticRunner: "REGULAR_SEASON_ONLY",
  walkOffScoring: "WINNING_RUN_ONLY",
  unresolvedAtCap: "DISCARD",
}) as EngineRules;

/** Whether an extra half-inning starts with a runner on second under `rules` for this game. */
export function automaticRunnerApplies(rules: EngineRules, ruleset: GameInput["ruleset"]): boolean {
  if (rules.extrasAutomaticRunner === "ALWAYS") return true;
  return ruleset !== "POSTSEASON";
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
  /** True when the game was still tied at the inning cap under `unresolvedAtCap: DISCARD`: not a legal result. */
  incomplete?: boolean;
  /** How the game ended in the bottom of the 9th or later, when the home team walked off. */
  walkOff?: "HOME_RUN" | "OTHER" | null;
  /** Research (substitution): each STARTING batter's own line, which stops when he is replaced. Slot lines include both. */
  awayStarterBatters?: BatterGameLine[];
  homeStarterBatters?: BatterGameLine[];
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
  /** MLB-005 research: this game's drawn batters-faced limit (absent = the fixed cap). */
  bfLimit?: number;
}

function buildBatterModels(lineup: BatterInput[], opposingStarter: PitcherInput | null, league: LeagueParams, explicitPa = false): BatterModel[] {
  const starterK = pitcherStrikeoutRate(opposingStarter?.expStrikeouts ?? null, true, league);
  if (explicitPa) {
    // MLB-005 research: every batter must carry explicit distributions; a missing one fails closed (no silent mix).
    const missing = lineup.filter((b) => !b.pa).map((b) => b.playerId);
    if (missing.length) throw new Error(`explicitPa: no PA distribution for ${missing.join(",")}`);
    return lineup.map((b) => ({ vsStarter: b.pa!.vsStarter, vsBullpen: b.pa!.vsBullpen }));
  }
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
/** Research (substitution) state of one batting team. */
interface SubState { subbed: boolean[]; starterLines: BatterGameLine[]; subModels: BatterModel[]; hazards: number[][] }

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
  automaticRunner: boolean;
  observer?: WorldObserver;
  inning?: number;
  half?: "TOP" | "BOTTOM";
  sub?: SubState;
}): { runs: number; orderPtr: number; endedOn: "HOME_RUN" | "OTHER" | null } {
  const { lineup, models, batterLines, mound, rng, isExtra, walkOff, engine, observer, sub } = params;
  const inning = params.inning ?? 0;
  const half = params.half ?? "TOP";
  const rules = engine.rules ?? LEGACY_RULES;
  // Official walk-off: on a non-home-run the game ends the moment the winning run scores — no later runner counts.
  const winningRunOnly = !!walkOff && rules.walkOffScoring === "WINNING_RUN_ONLY";
  const decided = (r: number) => !!walkOff && walkOff.homeBefore + r > walkOff.awayTotal;
  const adv = engine.advancement;
  const n = lineup.length;
  let orderPtr = params.orderPtr;
  let outs = 0;
  let runs = 0;
  const bases: [number, number, number] = [-1, -1, -1];
  // Automatic runner on second in extras: the player who made the last out (slot before the leadoff batter).
  if (isExtra && params.automaticRunner) bases[1] = (orderPtr - 1 + n) % n;
  let endedOn: "HOME_RUN" | "OTHER" | null = null;
  observer?.({ kind: "HALF_START", inning, half, bases: [bases[0], bases[1], bases[2]] });

  while (outs < 3) {
    // Free advancement before the pitch (wild pitch / passed ball / balk). Research-only: at 0 it draws nothing.
    if (adv.freeAdvance > 0 && (bases[0] >= 0 || bases[1] >= 0 || bases[2] >= 0) && rng.next() < adv.freeAdvance) {
      const faScored: number[] = [];
      if (bases[2] >= 0) {
        runs += 1;
        batterLines[bases[2]].runs += 1;
        faScored.push(bases[2]);
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
      bases[2] = bases[1];
      bases[1] = bases[0];
      bases[0] = -1;
      if (sub) for (const s of faScored) if (!sub.subbed[s]) sub.starterLines[s].runs += 1;
      observer?.({ kind: "FREE_ADVANCE", inning, half, scored: faScored });
      if (walkOff && walkOff.homeBefore + runs > walkOff.awayTotal) { endedOn = "OTHER"; break; }
    }
    const slot = orderPtr % n;
    // Research (substitution): before each later trip, the starter may be replaced for the rest of the game.
    if (sub && !sub.subbed[slot] && sub.starterLines[slot].pa >= 1) {
      const hz = sub.hazards[slot];
      const h = hz[Math.min(sub.starterLines[slot].pa, hz.length - 1)] ?? 0;
      if (h > 0 && rng.next() < h) sub.subbed[slot] = true;
    }
    const isSub = !!sub && sub.subbed[slot];
    const model = isSub ? sub!.subModels[slot] : models[slot];
    const probs = mound.usingStarter ? model.vsStarter : model.vsBullpen;
    const outcome = samplePaOutcome(probs, rng.next());

    const line = batterLines[slot];
    const lineBefore = sub && !isSub ? { ...line } : null;
    line.pa += 1;
    if (mound.usingStarter) mound.line.battersFaced += 1;
    // MLB-005 world log (observer only; no random draw, no state change).
    const paPitcher: "STARTER" | "BULLPEN" = mound.usingStarter ? "STARTER" : "BULLPEN";
    const outsBefore = outs;
    const basesBefore: [number, number, number] | null = observer ? [bases[0], bases[1], bases[2]] : null;
    const rbiBefore = line.rbi;
    const paScored: number[] = [];

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
        paScored.push(bases[2]);
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
        if (winningRunOnly && decided(runs)) break;
        runs += 1;
        batterLines[s].runs += 1;
        paScored.push(s);
        line.rbi += 1;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
    } else if (outcome === "reachOnError") {
      // Reached on an error: no hit, no RBI — the runs are simply scored.
      const scored = advanceReachingBase("reachOnError", bases, slot, rng, adv);
      for (const s of scored) {
        if (winningRunOnly && decided(runs)) break;
        runs += 1;
        batterLines[s].runs += 1;
        paScored.push(s);
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
      // Where each runner started (1st = 1, 2nd = 2, 3rd = 3), for the walk-off hit rule below. No random draw.
      const startBase = winningRunOnly && outcome !== "homeRun" ? new Map(bases.map((s, i) => [s, i + 1] as [number, number]).filter(([s]) => s >= 0)) : null;
      const scored = advanceReachingBase(outcome, bases, slot, rng, adv);
      let lastScorer = -1;
      for (const s of scored) {
        // A home run scores every runner even in a walk-off; any other hit stops at the winning run.
        if (winningRunOnly && outcome !== "homeRun" && decided(runs)) break;
        runs += 1;
        batterLines[s].runs += 1;
        paScored.push(s);
        line.rbi += 1;
        lastScorer = s;
        if (mound.usingStarter) mound.line.runsAllowed += 1;
        else mound.bullpenRuns += 1;
      }
      // Official Rule 9.06(f): a game-ending hit other than a home run credits the batter with only as many bases as the
      // winning runner advanced (runner from 3rd → a single; from 2nd → at most a double). Total bases follow.
      if (startBase && decided(runs) && lastScorer >= 0) {
        const advanced = 4 - (startBase.get(lastScorer) ?? 0);
        if (advanced >= 1 && advanced < basesForHit) line.totalBases -= basesForHit - advanced;
      }
    }

    if (sub) {
      // The starter's own line: his PA's batting stats while he is in the game, and every run he scores himself.
      if (lineBefore) { const sl = sub.starterLines[slot]; for (const k of ["pa", "hits", "totalBases", "homeRuns", "rbi", "walks", "strikeouts"] as const) sl[k] += line[k] - lineBefore[k]; }
      for (const s of paScored) if (s === slot ? !isSub : !sub.subbed[s]) sub.starterLines[s].runs += 1;
    }
    observer?.({ kind: "PA", inning, half, outsBefore, basesBefore: basesBefore!, batterSlot: slot, pitcher: paPitcher, outcome, scored: paScored, rbi: line.rbi - rbiBefore, outsAfter: outs, ...(sub ? { sub: isSub } : {}) });
    orderPtr += 1;

    // Starter removal: pulled after a batters-faced cap (or this game's drawn limit, research) or a blow-up run total.
    const bfLimit = mound.bfLimit ?? engine.starter.maxBattersFaced;
    if (mound.usingStarter && (mound.line.battersFaced >= bfLimit || mound.line.runsAllowed >= engine.starter.chaseRuns)) {
      mound.usingStarter = false;
      observer?.({ kind: "STARTER_REMOVED", inning, half, battersFaced: mound.line.battersFaced, limit: bfLimit });
    }

    // Walk-off: the moment the home team leads in the bottom of the 9th+, the game ends.
    if (walkOff && walkOff.homeBefore + runs > walkOff.awayTotal) {
      endedOn = outcome === "homeRun" ? "HOME_RUN" : "OTHER";
      break;
    }
  }

  observer?.({ kind: "HALF_END", inning, half, runs, outs, endedOn });
  return { runs, orderPtr, endedOn };
}

/** Draw one batters-faced limit from a pmf (index = BF). One uniform draw. */
function drawLimit(pmf: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < pmf.length; i += 1) { acc += pmf[i]; if (u < acc) return i; }
  return pmf.length - 1;
}

/** Simulate ONE complete game. Deterministic given the injected RNG. */
export function simulateGame(game: GameInput, rng: SeededRng, params: EngineParams = DEFAULT_ENGINE_PARAMS, observer?: WorldObserver): GameResult {
  const explicitPa = params.research?.explicitPa === true;
  const awayModels = buildBatterModels(game.awayLineup, game.homeStarter, params.league, explicitPa);
  const homeModels = buildBatterModels(game.homeLineup, game.awayStarter, params.league, explicitPa);
  const awayLines = game.awayLineup.map(emptyBatterLine);
  const homeLines = game.homeLineup.map(emptyBatterLine);
  // Research (substitution): each batting team's replacement models and starter-only lines. Fails closed without inputs.
  const subState = (lineup: BatterInput[]): SubState | undefined => {
    if (!params.research?.substitution) return undefined;
    const missing = lineup.filter((b) => !b.subHazard?.length || !b.subPa).map((b) => b.playerId);
    if (missing.length) throw new Error(`substitution: no hazard or replacement for ${missing.join(",")}`);
    return { subbed: lineup.map(() => false), starterLines: lineup.map(emptyBatterLine), subModels: lineup.map((b) => ({ vsStarter: b.subPa!.vsStarter, vsBullpen: b.subPa!.vsBullpen })), hazards: lineup.map((b) => b.subHazard!) };
  };
  const awaySub = subState(game.awayLineup);
  const homeSub = subState(game.homeLineup);

  // The home team's pitcher faces the away lineup; the away team's pitcher faces the home lineup.
  const homeMound: MoundState = { usingStarter: !!game.homeStarter, line: emptyPitcherLine(), bullpenRuns: 0 };
  const awayMound: MoundState = { usingStarter: !!game.awayStarter, line: emptyPitcherLine(), bullpenRuns: 0 };
  if (params.research?.workloadPmf) {
    // MLB-005 research: each starter's batters-faced limit for THIS game, one draw each (home, then away). A starter
    // without a distribution fails closed rather than silently keeping the fixed cap.
    for (const [starter, mound] of [[game.homeStarter, homeMound], [game.awayStarter, awayMound]] as const) {
      if (!starter) continue;
      if (!starter.bfLimitPmf?.length) throw new Error(`workloadPmf: no batters-faced distribution for ${starter.playerId}`);
      mound.bfLimit = Math.max(1, drawLimit(starter.bfLimitPmf, rng.next()));
    }
  }

  let awayRuns = 0;
  let homeRuns = 0;
  let awayPtr = 0;
  let homePtr = 0;
  let inning = 1;
  let extra = false;
  let walkOff: GameResult["walkOff"] = null;
  let incomplete = false;
  const rules = params.rules ?? LEGACY_RULES;
  const automaticRunner = automaticRunnerApplies(rules, game.ruleset);

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
      automaticRunner,
      observer,
      inning,
      half: "TOP",
      sub: awaySub,
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
      automaticRunner,
      observer,
      inning,
      half: "BOTTOM",
      sub: homeSub,
    });
    homeRuns += bottom.runs;
    homePtr = bottom.orderPtr;
    if (bottom.endedOn) walkOff = bottom.endedOn;

    if (inning >= 9 && homeRuns !== awayRuns) break;
    if (inning >= EXTRA_INNINGS_CAP) {
      if (homeRuns === awayRuns) {
        // LEGACY (v2): award the home team a run so the game terminates. Corrected: the game is not a legal
        // result — it is reported incomplete and the caller discards it (no fabricated run, no unbounded loop).
        if (rules.unresolvedAtCap === "AWARD_HOME_RUN") homeRuns += 1;
        else incomplete = true;
      }
      break;
    }
  }

  return {
    awayRuns,
    homeRuns,
    innings: inning,
    extra,
    ...(incomplete ? { incomplete: true } : {}),
    walkOff,
    awayBatters: awayLines,
    homeBatters: homeLines,
    awayStarter: awayMound.line,
    homeStarter: homeMound.line,
    ...(awaySub && homeSub ? { awayStarterBatters: awaySub.starterLines, homeStarterBatters: homeSub.starterLines } : {}),
  };
}
