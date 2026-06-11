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

export interface BankBuilderLeg {
  player: string; market: string; side: string; line: number;
  odds?: number; result: string; finalStat?: number; source?: string;
}

export interface BankBuilderLedgerEntry {
  date: string; sport?: string; slipId?: string; riskProfile?: string;
  result: "win" | "loss" | "push"; combinedAmerican: number; combinedDecimal?: number;
  stakeUnits?: number; payoutUnits?: number; profitUnits?: number;
  bankrollBefore: number; bankrollAfter: number;
  progressionStepBefore: number; progressionStepAfter: number;
  legs: BankBuilderLeg[]; settledAt?: string; settlementSource: string;
  audit: Record<string, boolean>;
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

/** Featured (non-ladder) special-event card — e.g. the NBA Finals same-game card.
 *  Settled from official box-score data; trackedLadder is false. Null when none. */
export interface FeaturedBuilderLeg {
  player: string; playerId?: number | null; team?: string | null; opponent?: string | null;
  market: string; marketLabel?: string | null; side: string; line: number | null;
  oddsForSide?: number | null; confidence?: string | null;
  finalStat?: number | null; result?: "win" | "loss" | "push" | null;
}
export interface FeaturedBuilderCard {
  date: string; sport: string; event: string; cardType: string;
  trackedLadder: boolean; status: string; result: "win" | "loss" | "push" | null;
  stakeDollars: number; combinedAmerican: number; combinedDecimal: number;
  projectedReturn: number; settledReturn: number; profit: number;
  officialResultConfirmed: boolean; settlementSource: string; settledAt?: string;
  correlationNote?: string; legs: FeaturedBuilderLeg[];
}
export function loadFeaturedBuilderCard(): FeaturedBuilderCard | null {
  return read<FeaturedBuilderCard>("featured-latest.json");
}

/** Public $100→$10,000 ladder (2026-06-11 migration). Source of truth for the
 *  public Bank Builder hero/ladder. The canonical tracked ledger is preserved
 *  separately as audit/history. Null pre-migration (falls back to canonical). */
export interface PublicBuilderSummary {
  ladder: string; startingBankrollUnits: number; currentBankrollUnits: number;
  currentProgressionStep: number; currentStepStart: number | null; currentStepGoal: number | null;
  goalUnits: number; record: { wins: number; losses: number; pushes: number };
  currentStreak: number; lastSettledDate: string | null; lastSettledResult: string | null;
  lastSettledLabel?: string | null; nextTargetUnits: number; generatedAt: string;
}
export interface PublicBuilderEntry {
  step: number; date: string; sport: string; event?: string; result: "win" | "loss" | "push";
  bankrollBefore: number; bankrollAfter: number; stakeUnits: number; payoutUnits: number;
  profitUnits: number; combinedAmerican?: number; settlementSource?: string;
  officialResultConfirmed?: boolean; sameGame?: boolean; correlationNote?: string;
  legs: Array<{ player: string; market: string; side: string; line: number | null; oddsForSide?: number | null; result?: string; finalStat?: number | null }>;
}
export interface PublicBuilderLedger {
  ladder: string; base: number; goal: number; migratedAt: string; migrationDoc: string;
  entries: PublicBuilderEntry[]; nextPickStatus: string; nextEligibleDate: string;
  nextStakeUnits: number; nextTargetUnits: number;
}
export function loadPublicBankBuilderSummary(): PublicBuilderSummary | null {
  return read<PublicBuilderSummary>("public-summary-latest.json");
}
export function loadPublicBankBuilderLedger(): PublicBuilderLedger | null {
  return read<PublicBuilderLedger>("public-ledger-latest.json");
}

/**
 * Public view of the Bank Builder ledger: separates the current paper run + last
 * settled slip + next slip from the lifetime experimental audit. The lifetime record
 * is preserved (honest) but flagged `hiddenFromHero` so the product page never leads
 * with it. Pure — safe to unit-test.
 */
export interface BankBuilderPublicView {
  currentRun: {
    startingBankroll: number; currentBankroll: number; profit: number; roiPct: number;
    currentStep: number; streak: string; lastSettledDate: string | null; lastSettledResult: string | null;
  };
  lastSettledSlip: {
    date: string; sport: string; result: string; paperStake: number; americanOdds: number;
    paperReturn: number; paperProfit: number;
    legs: Array<{ name: string; market: string; selection: string; finalStat?: number; result: string }>;
  } | null;
  nextSlip: { status: string; date: string | null };
  lifetimeAudit: { record: string; hiddenFromHero: true };
}

export function toPublicBankBuilderView(
  summary: BankBuilderSummary | null,
  lastEntry: BankBuilderLedgerEntry | null,
): BankBuilderPublicView | null {
  if (!summary) return null;
  const streak = summary.currentStreak > 0 ? `W${summary.currentStreak}`
    : summary.currentStreak < 0 ? `L${-summary.currentStreak}` : "—";
  return {
    currentRun: {
      startingBankroll: summary.startingBankrollUnits, currentBankroll: summary.currentBankrollUnits,
      profit: summary.currentRunProfitUnits, roiPct: summary.currentRunRoiPct,
      currentStep: summary.currentProgressionStep, streak,
      lastSettledDate: summary.lastSettledDate, lastSettledResult: summary.lastSettledResult,
    },
    lastSettledSlip: lastEntry ? {
      date: lastEntry.date, sport: (lastEntry.sport ?? "MLB").toUpperCase(), result: lastEntry.result,
      paperStake: lastEntry.stakeUnits ?? lastEntry.bankrollBefore, americanOdds: lastEntry.combinedAmerican,
      paperReturn: lastEntry.bankrollAfter, paperProfit: Math.round((lastEntry.bankrollAfter - lastEntry.bankrollBefore) * 100) / 100,
      legs: (lastEntry.legs ?? []).map((l) => ({ name: l.player, market: l.market, selection: `${l.side} ${l.line}`, finalStat: l.finalStat, result: l.result })),
    } : null,
    nextSlip: { status: summary.nextPick ? "ready" : "pending", date: summary.nextEligibleDate },
    // Lifetime record kept for transparency but explicitly hidden from the hero.
    lifetimeAudit: { record: `${summary.record.wins}-${summary.record.losses}`, hiddenFromHero: true },
  };
}
