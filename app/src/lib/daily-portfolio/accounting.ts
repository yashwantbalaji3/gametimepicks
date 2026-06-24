/**
 * Daily-portfolio ACTIVATION ACCOUNTING.
 *
 * Turns the four model-built candidate lanes (Bank Builder A/B + Moonshot A/B) into an ACTIVE daily
 * paper portfolio with explicit, testable money math. The display model (and the only mutation this
 * layer makes) is:
 *   activeBankroll    = portfolio.currentBankroll        // UNCHANGED at activation (settled bankroll)
 *   openExposure      = Σ ACTIVE lane stakes             // rises when lanes activate
 *   availableBankroll = activeBankroll − openExposure
 *   potentialReturn   = Σ ACTIVE lane potential returns
 *   crown             = portfolio.crownBankroll          // historical, NEVER touched
 * Activating a lane raises open exposure + lowers available; it does NOT change active bankroll or the
 * crown (those only move on official settlement). Pure + deterministic given (root, nowIso, date).
 */
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupModelPicks, buildDailyLaneCandidates, type LaneCandidate, type ModelPick } from "../world-cup/model-qualified-picks";
import { readLaneRungs, selectSafestTargetFitCard, SEED_EXPOSURE, type GeneratedLane } from "./bank-builder-generation";
import { selectCrossLaneBankBuilder } from "./bank-builder-correlation-review";
import { loadMlbModelPicks } from "./mlb-model-picks";
import { loadWorldCupTeamLegs } from "./wc-team-legs";

/** Activation cutoff — a lane cannot be newly activated if any leg kicks off within this many minutes. */
export const ACTIVATION_CUTOFF_MIN = 30;
export const MOONSHOT_MAX_EXPOSURE = 50;

export interface ActivationEligibility { eligible: boolean; reason: string }
export interface PortfolioLaneLeg { id: string; matchup: string; market: string; selection: string; player: string | null; odds: number; provider: string | null; modelConfidence: number; kickoffEt: string; risk: string; photoUrl?: string | null; teamLogo?: string | null }
export interface PortfolioLane {
  id: string;
  product: "bank-builder" | "moonshot";
  productLabel: string;
  lane: "A" | "B";
  step: number;
  clearedSteps: number;
  status: "active" | "candidate" | "awaiting";
  stake: number;            // the balance riding on the card (rolled for Bank Builder)
  exposure: number;         // the at-risk amount: Bank Builder $100 seed; Moonshot $25 stake
  targetReturn: number | null; // rung goal (Bank Builder), else null
  fitsTarget: boolean;
  combinedOdds: number;
  combinedDecimal: number;
  potentialReturn: number;
  legCount: number;
  targetLegs: number;
  legs: PortfolioLaneLeg[];
  correlationNote: string | null;
  shortfallNote: string | null;
  whyThisCard: string[];
  activationEligibility: ActivationEligibility;
}
export interface PersistedDailyPortfolio {
  version: "daily-portfolio-v1";
  date: string;
  generatedAt: string | null;
  activeBankroll: number;
  crownBankroll: number;
  openExposure: number;
  availableBankroll: number;
  potentialReturn: number;
  products: {
    bankBuilder: { exposure: number; record: { wins: number; losses: number; voids: number; pending: number } };
    moonshot: { exposure: number; record: { wins: number; losses: number; voids: number; pending: number } };
  };
  lanes: PortfolioLane[];
  settlement: { status: "pending" | "settled" | "none"; realizedPnl: number };
  note: string;
}

const PRODUCT_LABEL: Record<string, string> = { "bank-builder": "Bank Builder", moonshot: "Moonshot" };

function laneEligibility(lane: LaneCandidate, nowMs: number): ActivationEligibility {
  if (lane.legCount < lane.targetLegs) return { eligible: false, reason: `only ${lane.legCount}/${lane.targetLegs} model-qualified legs — awaiting a full lane` };
  for (const l of lane.legs) {
    const ms = l.kickoffUtc ? Date.parse(l.kickoffUtc) : NaN;
    if (!Number.isFinite(ms)) return { eligible: false, reason: `${l.matchup} has no machine kickoff` };
    if (nowMs >= ms) return { eligible: false, reason: `${l.matchup} has started — no late activation` };
    if (ms - nowMs < ACTIVATION_CUTOFF_MIN * 60000) return { eligible: false, reason: `${l.matchup} within ${ACTIVATION_CUTOFF_MIN}m of kickoff` };
  }
  return { eligible: true, reason: "all legs pre-event and outside the cutoff" };
}

function whyThisCard(lane: LaneCandidate): string[] {
  const why: string[] = [];
  if (lane.product === "bank-builder") why.push("Lower-volatility: the 2 highest model-confidence legs, max 1 per game.");
  else why.push("Higher-upside: 5 model-qualified legs for a longer combined price.");
  const avg = lane.legs.length ? Math.round((lane.legs.reduce((s, l) => s + l.modelProbability, 0) / lane.legs.length) * 100) : 0;
  why.push(`Avg model confidence ${avg}% across ${lane.legCount} legs · combined ${lane.combinedOdds > 0 ? "+" : ""}${lane.combinedOdds}.`);
  if (lane.correlationNote) why.push(lane.correlationNote);
  return why;
}

const toLeg = (p: ModelPick): PortfolioLaneLeg => ({ id: p.id, matchup: p.matchup, market: p.marketLabel, selection: p.selection, player: p.player, odds: p.odds, provider: p.provider, modelConfidence: p.modelProbability, kickoffEt: p.kickoffEt, risk: p.risk, photoUrl: p.playerPortrait ?? null, teamLogo: p.teamLogo ?? null });

function toPortfolioLane(lane: LaneCandidate, status: PortfolioLane["status"], eligibility: ActivationEligibility): PortfolioLane {
  return {
    id: lane.id, product: lane.product, productLabel: PRODUCT_LABEL[lane.product] ?? lane.product, lane: lane.lane,
    step: 1, clearedSteps: 0, status, stake: lane.stake, exposure: lane.stake, targetReturn: null, fitsTarget: true,
    combinedOdds: lane.combinedOdds, combinedDecimal: lane.combinedDecimal,
    potentialReturn: lane.potentialReturn, legCount: lane.legCount, targetLegs: lane.targetLegs,
    legs: lane.legs.map(toLeg),
    correlationNote: lane.correlationNote, shortfallNote: lane.shortfallNote,
    whyThisCard: whyThisCard(lane), activationEligibility: eligibility,
  };
}

/** Map a Bank Builder GeneratedLane (target-fit next-step card) to a PortfolioLane. Exposure is the
 *  $100 seed (ledger convention); the card displays the rolled balance riding toward the rung goal. */
function toBBLane(g: GeneratedLane, status: PortfolioLane["status"], eligibility: ActivationEligibility): PortfolioLane {
  return {
    id: `bank-builder-lane-${g.lane.toLowerCase()}-step-${g.step}`, product: "bank-builder", productLabel: "Bank Builder", lane: g.lane,
    step: g.step, clearedSteps: g.clearedSteps, status, stake: g.rolledStake, exposure: g.seedExposure,
    targetReturn: g.targetReturn, fitsTarget: g.fitsTarget,
    combinedOdds: g.combinedOdds, combinedDecimal: g.combinedDecimal, potentialReturn: g.potentialReturn,
    legCount: g.legs.length, targetLegs: 2, legs: g.legs.map(toLeg),
    correlationNote: g.correlationNote, shortfallNote: g.shortfallNote,
    whyThisCard: g.whyThisCard, activationEligibility: eligibility,
  };
}

/** Activation eligibility for a Bank Builder generated lane (pre-event, cutoff, full + target-fit). */
function bbEligibility(g: GeneratedLane, nowMs: number): ActivationEligibility {
  if (g.legs.length < 2) return { eligible: false, reason: "fewer than 2 model-qualified legs — awaiting a full card" };
  if (!g.fitsTarget) return { eligible: false, reason: `no 2-leg combo reaches the Step ${g.step} target — candidate only` };
  for (const l of g.legs) {
    const ms = l.kickoffUtc ? Date.parse(l.kickoffUtc) : NaN;
    if (!Number.isFinite(ms)) return { eligible: false, reason: `${l.matchup} has no machine kickoff` };
    if (nowMs >= ms) return { eligible: false, reason: `${l.matchup} has started — no late activation` };
    if (ms - nowMs < ACTIVATION_CUTOFF_MIN * 60000) return { eligible: false, reason: `${l.matchup} within ${ACTIVATION_CUTOFF_MIN}m of kickoff` };
  }
  return { eligible: true, reason: "all legs pre-event, outside the cutoff, and the card reaches the rung target" };
}

function readMoney(root: string): { activeBankroll: number; crownBankroll: number } {
  let activeBankroll = 10176.17, crownBankroll = 10376.17;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8"));
    if (typeof p.currentBankroll === "number") activeBankroll = p.currentBankroll;
    if (typeof p.crownBankroll === "number") crownBankroll = p.crownBankroll;
  } catch { /* defaults */ }
  return { activeBankroll, crownBankroll };
}

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Build the activated daily portfolio object. `activate=false` leaves every lane a candidate (plan/
 * dry-run); `activate=true` marks eligible lanes ACTIVE (placing paper exposure). Eligible Moonshot
 * exposure is capped at MOONSHOT_MAX_EXPOSURE. NEVER changes active bankroll or crown.
 */
export function buildPersistedDailyPortfolio(root: string, nowIso: string, date: string, generatedAt: string | null, activate: boolean): PersistedDailyPortfolio {
  const { activeBankroll, crownBankroll } = readMoney(root);
  const pool = loadWorldCupModelPicks(root, nowIso, date);
  // Bank Builder draws from a SOCCER-FIRST cross-sport pool: the broad World Cup team-leg pool (real
  // de-vigged moneyline favorites + totals for every game, e.g. Brazil moneyline) is PREFERRED; the model
  // pool fills any game/market the outlook didn't cover; the MLB board is the last fill. The selector leans
  // on the World Cup legs. Moonshot stays World-Cup-only (the WC longshot lane).
  const wcTeam = loadWorldCupTeamLegs(root, nowIso, date);
  const seenWc = new Set(wcTeam.map((p) => `${p.gameId}:${p.marketKey}`));
  const wcFill = pool.filter((p) => !seenWc.has(`${p.gameId}:${p.marketKey}`));
  const bbPool = [...wcTeam, ...wcFill, ...loadMlbModelPicks(root, nowIso, date)];
  const nowMs = Date.parse(nowIso);
  const lanes: PortfolioLane[] = [];

  // ── Bank Builder: pick Lane A + Lane B TOGETHER so they share no game (cross-lane independence),
  //    each fitting its next rung (Lane A Step 4, Lane B Step 2), team/game markets preferred. ──
  const rungs = readLaneRungs(root);
  const usedBB = new Set<string>();
  if (rungs.laneA && rungs.laneB) {
    const { laneA, laneB } = selectCrossLaneBankBuilder(bbPool, rungs.laneA, rungs.laneB);
    for (const g of [laneA, laneB]) {
      g.legs.forEach((l) => usedBB.add(l.id));
      const elig = bbEligibility(g, nowMs);
      const status: PortfolioLane["status"] = g.legs.length < 2 ? "awaiting" : (activate && elig.eligible ? "active" : "candidate");
      lanes.push(toBBLane(g, status, elig));
    }
  } else {
    // Only one lane has a next rung — fall back to the single-lane target-fit selector.
    for (const rung of [rungs.laneA, rungs.laneB]) {
      if (!rung) continue;
      const g = selectSafestTargetFitCard(pool, rung, usedBB);
      g.legs.forEach((l) => usedBB.add(l.id));
      const elig = bbEligibility(g, nowMs);
      const status: PortfolioLane["status"] = g.legs.length < 2 ? "awaiting" : (activate && elig.eligible ? "active" : "candidate");
      lanes.push(toBBLane(g, status, elig));
    }
  }

  // ── Moonshot: 5 higher-upside legs per lane, from the pool MINUS the Bank Builder legs (distinct lanes). ──
  const poolForMoon = pool.filter((p) => !usedBB.has(p.id));
  const cands = buildDailyLaneCandidates(poolForMoon, date);
  let moonshotExposure = 0;
  for (const c of [cands.moonshotA, cands.moonshotB] as LaneCandidate[]) {
    const elig = laneEligibility(c, nowMs);
    let status: PortfolioLane["status"] = c.legCount < c.targetLegs ? "awaiting" : "candidate";
    if (activate && elig.eligible) {
      if (moonshotExposure + c.stake > MOONSHOT_MAX_EXPOSURE) { lanes.push(toPortfolioLane(c, "candidate", { eligible: false, reason: `Moonshot exposure cap $${MOONSHOT_MAX_EXPOSURE} reached` })); continue; }
      status = "active"; moonshotExposure += c.stake;
    }
    lanes.push(toPortfolioLane(c, status, elig));
  }

  const active = lanes.filter((l) => l.status === "active");
  const coreExposure = round2(active.filter((l) => l.product === "bank-builder").reduce((s, l) => s + l.exposure, 0));
  const moonExposure = round2(active.filter((l) => l.product === "moonshot").reduce((s, l) => s + l.exposure, 0));
  const openExposure = round2(coreExposure + moonExposure);
  const potentialReturn = round2(active.reduce((s, l) => s + l.potentialReturn, 0));
  const zero = { wins: 0, losses: 0, voids: 0, pending: 0 };

  return {
    version: "daily-portfolio-v1", date, generatedAt,
    activeBankroll, crownBankroll,
    openExposure, availableBankroll: round2(activeBankroll - openExposure), potentialReturn,
    products: {
      bankBuilder: { exposure: coreExposure, record: { ...zero, pending: active.filter((l) => l.product === "bank-builder").length } },
      moonshot: { exposure: moonExposure, record: { ...zero, pending: active.filter((l) => l.product === "moonshot").length } },
    },
    lanes,
    settlement: { status: active.length ? "pending" : "none", realizedPnl: 0 },
    note: active.length
      ? "Active daily paper portfolio — open exposure is at risk; active bankroll and crown are unchanged until official settlement."
      : "Daily paper portfolio candidates — no exposure placed; active bankroll and crown unchanged.",
  };
}
