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

/** Activation cutoff — a lane cannot be newly activated if any leg kicks off within this many minutes. */
export const ACTIVATION_CUTOFF_MIN = 30;
export const MOONSHOT_MAX_EXPOSURE = 50;

export interface ActivationEligibility { eligible: boolean; reason: string }
export interface PortfolioLaneLeg { id: string; matchup: string; market: string; selection: string; player: string | null; odds: number; provider: string | null; modelConfidence: number; kickoffEt: string; risk: string }
export interface PortfolioLane {
  id: string;
  product: "bank-builder" | "moonshot";
  productLabel: string;
  lane: "A" | "B";
  step: number;
  status: "active" | "candidate" | "awaiting";
  stake: number;
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

function toPortfolioLane(lane: LaneCandidate, status: PortfolioLane["status"], eligibility: ActivationEligibility): PortfolioLane {
  return {
    id: lane.id, product: lane.product, productLabel: PRODUCT_LABEL[lane.product] ?? lane.product, lane: lane.lane,
    step: 1, status, stake: lane.stake, combinedOdds: lane.combinedOdds, combinedDecimal: lane.combinedDecimal,
    potentialReturn: lane.potentialReturn, legCount: lane.legCount, targetLegs: lane.targetLegs,
    legs: lane.legs.map((p: ModelPick) => ({ id: p.id, matchup: p.matchup, market: p.marketLabel, selection: p.selection, player: p.player, odds: p.odds, provider: p.provider, modelConfidence: p.modelProbability, kickoffEt: p.kickoffEt, risk: p.risk })),
    correlationNote: lane.correlationNote, shortfallNote: lane.shortfallNote,
    whyThisCard: whyThisCard(lane), activationEligibility: eligibility,
  };
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
  const cands = buildDailyLaneCandidates(pool, date);
  const ordered: LaneCandidate[] = [cands.bankBuilderA, cands.bankBuilderB, cands.moonshotA, cands.moonshotB];
  const nowMs = Date.parse(nowIso);

  let moonshotExposure = 0;
  const lanes: PortfolioLane[] = ordered.map((c) => {
    const elig = laneEligibility(c, nowMs);
    let status: PortfolioLane["status"] = c.legCount < c.targetLegs ? "awaiting" : "candidate";
    if (activate && elig.eligible) {
      // Enforce the Moonshot exposure cap across active moonshot lanes.
      if (c.product === "moonshot" && moonshotExposure + c.stake > MOONSHOT_MAX_EXPOSURE) {
        return toPortfolioLane(c, "candidate", { eligible: false, reason: `Moonshot exposure cap $${MOONSHOT_MAX_EXPOSURE} reached` });
      }
      status = "active";
      if (c.product === "moonshot") moonshotExposure += c.stake;
    }
    return toPortfolioLane(c, status, elig);
  });

  const active = lanes.filter((l) => l.status === "active");
  const coreExposure = round2(active.filter((l) => l.product === "bank-builder").reduce((s, l) => s + l.stake, 0));
  const moonExposure = round2(active.filter((l) => l.product === "moonshot").reduce((s, l) => s + l.stake, 0));
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
