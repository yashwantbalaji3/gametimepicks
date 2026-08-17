/**
 * Risk-ladder reader — today's card per tier plus the tier-by-tier record.
 *
 * Fail-closed on the date like every other slate reader here: a ladder built for another day is not
 * this day's ladder, and the surface renders nothing rather than yesterday's picks under today's
 * heading.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";

import type { LadderCard, LadderSkip } from "@/components/parlays/risk-ladder-board";
import type { BettorTier } from "@/components/parlays/parlay-lab-entry";

export interface TierRecord {
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
  readonly pending: number;
  readonly decisive: number;
  readonly hitRate: number | null;
  readonly roi: number | null;
  readonly staked: number;
  readonly returned: number | null;
}

/** The live ledger — restarted at the policy change, with the prior policy preserved beside it. */
export interface LabLedger {
  readonly policy: { readonly version: number; readonly since: string; readonly summary: string };
  readonly streams: readonly {
    readonly id: string; readonly label: string; readonly live: boolean; readonly blocked?: string;
    readonly settledDays: number;
    readonly record: { readonly wins: number; readonly losses: number; readonly hitRate: number | null; readonly roi: number | null };
  }[];
  readonly priorPolicy: {
    readonly label: string; readonly summary: string; readonly gradedDays: number;
    readonly wins: number; readonly losses: number; readonly roi: number | null; readonly note: string;
    readonly firstDay: string | null; readonly lastDay: string | null;
  };
}

export function loadLabLedger(root: string): LabLedger | null {
  try { return JSON.parse(fs.readFileSync(path.join(root, "parlays", "lab-ledger.json"), "utf8")); }
  catch { return null; }
}

export interface RiskLadder {
  readonly date: string;
  readonly generatedAt: string;
  readonly cards: readonly LadderCard[];
  readonly skipped: readonly LadderSkip[];
  readonly bettorTiers: readonly BettorTier[];
  readonly record: {
    readonly gradedDays: number;
    readonly firstDay: string | null;
    readonly lastDay: string | null;
    readonly byTier: Record<string, TierRecord>;
    readonly overall: {
      readonly wins: number;
      readonly losses: number;
      readonly staked: number;
      readonly returned: number | null;
      readonly roi: number | null;
    };
  };
}

/** The ladder for `date`, or null when none was published for it. */
export function loadRiskLadder(root: string, date: string): RiskLadder | null {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(root, "parlays", "risk-ladder", `${date}.json`), "utf8")) as RiskLadder;
    return doc?.date === date ? doc : null;
  } catch {
    return null;
  }
}

/**
 * The lifetime record on its own, for surfaces that report the stream without carding today —
 * /results reads this even on a day with no slate.
 */
export function loadRiskLadderRecord(root: string): RiskLadder["record"] | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(root, "parlays", "risk-ladder", "latest.json"), "utf8")) as RiskLadder).record ?? null;
  } catch {
    return null;
  }
}
