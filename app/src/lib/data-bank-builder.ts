/**
 * data-bank-builder — server-side loader for the persisted Bank Builder paper-bankroll
 * ledger/summary (written by scripts/build-bank-builder-ledger.mjs from SETTLED results).
 * Fail-closed: returns null when the artifact is absent so the page falls back to the
 * honest base-rung prototype state. No fabrication.
 */
import fs from "node:fs";
import path from "node:path";

export interface BankBuilderSummary {
  generatedAt: string;
  startingBankrollUnits: number;
  currentBankrollUnits: number;
  goalUnits: number;
  currentRunProfitUnits: number;
  currentRunRoiPct: number;
  record: { wins: number; losses: number; pushes: number };
  settledPickCount: number;
  currentProgressionStep: number;
  currentStreak: number;
  lastSettledDate: string | null;
  lastSettledResult: "win" | "loss" | "push" | null;
  nextEligibleDate: string | null;
  nextPickStatus: string;
  nextPick: {
    date: string; slipId: string; sport: string; combinedAmerican: number;
    legCount: number; stakeUnits: number; projectedPayoutUnits: number; step: number;
  } | null;
}

export interface BankBuilderLedgerEntry {
  date: string; result: "win" | "loss" | "push"; combinedAmerican: number;
  bankrollBefore: number; bankrollAfter: number; progressionStepBefore: number;
  progressionStepAfter: number; legs: Array<{ player: string; market: string; side: string; line: number; result: string }>;
  settlementSource: string; audit: Record<string, boolean>;
}

function read<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "bank-builder", rel), "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadBankBuilderSummary(): BankBuilderSummary | null {
  return read<BankBuilderSummary>("summary-latest.json");
}

export function loadBankBuilderLedger(): { entries: BankBuilderLedgerEntry[] } | null {
  return read<{ entries: BankBuilderLedgerEntry[] }>("ledger-latest.json");
}
