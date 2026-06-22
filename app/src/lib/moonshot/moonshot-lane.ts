/**
 * Moonshot Lane — a SEPARATE high-volatility World-Cup-forward paper challenge, independent of the
 * disciplined Dual Bank Builder (Lane A/B). Server-only loader + pure view model. Reads its own
 * artifact (`public/data/moonshot-lane/active.json`) and NEVER touches the Lane A/B engine namespace.
 *
 * Paper-only. Never described as lower-risk — Moonshot is intentionally higher-variance.
 */
import fs from "node:fs";
import path from "node:path";

export interface MoonshotLeg {
  legId: string;
  kind: "team" | "player";
  sport: string;
  fixture: string;
  participant: string;
  team?: string | null;
  opponent: string | null;
  countryCode: string | null;
  playerId?: number | null;
  photoUrl?: string | null;
  market: string;
  marketLabel: string;
  side: string | null;
  line: number | null;
  odds: number;
  modelProbability: number;
  startTime: string | null;
  dataQuality: string;
  confidence: string;
  settlement: { result: string; source: string; official: string; started: boolean };
  why?: string;
  // Display/settlement enrichment (present on settled-era artifacts; optional for back-compat).
  displaySelection?: string;
  kickoffEt?: string;
  settlementStatus?: string; // "hit" | "miss" | "pending"
}

export interface MoonshotCard {
  cardId: string;
  scope: string;
  risk: string;
  stake: number;
  combinedOdds: number;
  projectedReturn: number;
  legs: MoonshotLeg[];
  correlationProfile: string;
  distinctGames: number;
  jointModelProbability: number;
  whyThisCard: string[];
  whyItCanFail: string[];
  dataQuality: string;
  eligible: boolean;
  result?: string; // "won" | "lost" | "void" when the card has settled
  slateLabel?: string;
  crossSlate?: boolean;
}

/** A prior, completed Moonshot run kept as day-by-day history (separate from the current lane). */
export interface MoonshotPriorRun {
  card: MoonshotCard | null;
  result: string;
  note: string;
}

export interface MoonshotStep {
  step: number;
  stake: number;
  targetReturn: number;
  requiredMultiple: number;
  targetOddsBand?: string;
  status: "active" | "awaiting" | "upcoming" | "cleared" | "stopped";
  card: MoonshotCard | null;
}

export interface MoonshotLane {
  id: string;
  name: string;
  subtitle: string;
  paperOnly: boolean;
  publicVisible: boolean;
  status: "active" | "awaiting" | "stopped" | "completed";
  sportScope: "world_cup" | "mixed";
  startingStake: number;
  targetReturn: number;
  currentStake: number;
  currentStep: number;
  generatedAt: string;
  ladder: MoonshotStep[];
  disclaimer: string;
  // When stopped, the public restart candidate / reason (so the lane never reads as a dead "stopped"
  // row): either an explicit card or an honest reason why no high-volatility card qualifies yet.
  restartCandidate?: { headline: string; reason: string; stake: number | null } | null;
  // Settled-state extras (present once the lane has stopped/settled; optional for back-compat).
  stopNote?: string;
  settledAt?: string;
  priorRun?: MoonshotPriorRun | null;
}

const MOONSHOT_PATH = ["moonshot-lane", "active.json"];

/** Load the Moonshot lane artifact, or null if none exists / it is not publicly visible. */
export function loadMoonshotLane(rootOverride?: string): MoonshotLane | null {
  try {
    const root = rootOverride ?? path.join(process.cwd(), "public", "data");
    const lane = JSON.parse(fs.readFileSync(path.join(root, ...MOONSHOT_PATH), "utf8")) as MoonshotLane;
    if (!lane || lane.publicVisible === false) return null;
    return lane;
  } catch {
    return null;
  }
}

/** The active step's card, if any (the step the lane is currently riding). */
export function activeMoonshotCard(lane: MoonshotLane | null): MoonshotCard | null {
  if (!lane) return null;
  const step = lane.ladder.find((s) => s.step === lane.currentStep);
  return step?.status === "active" ? step.card : null;
}

/** Paper exposure the Moonshot lane currently has at risk (the active step's stake), else 0. */
export function moonshotOpenExposure(lane: MoonshotLane | null): number {
  return activeMoonshotCard(lane)?.stake ?? 0;
}

/** Every leg is pre-event relative to `nowIso` — Moonshot never shows a started game as bettable. */
export function moonshotAllPreEvent(card: MoonshotCard | null, nowIso: string): boolean {
  if (!card) return false;
  return card.legs.every((l) => !!l.startTime && l.startTime > nowIso && !l.settlement.started);
}
