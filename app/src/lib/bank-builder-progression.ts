/**
 * bank-builder-progression — PURE paper-bankroll ladder math for settled Builder
 * Picks. One source of truth for the ledger so the builder script and tests agree.
 *
 * Policy (matches bank-builder-ladder design §3.2): start at BANK_BUILDER_BASE, let it
 * ride per rung; a WIN multiplies the bankroll by the slip's combined decimal odds; a
 * LOSS resets to the base; a PUSH holds. Educational paper tracking only — no real money,
 * no fabrication (callers pass only settled, fully-resolved picks).
 */
export type SettledResult = "win" | "loss" | "push";

export interface SettledBuilderPick {
  date: string;
  result: SettledResult;
  combinedDecimal: number;
  combinedAmerican?: number;
  slipId?: string;
  sport?: string;
  riskProfile?: string;
  legs?: unknown[];
  settledAt?: string;
  settlementSource?: string;
  audit?: Record<string, boolean>;
}

export interface LedgerEntry extends SettledBuilderPick {
  stakeUnits: number;
  payoutUnits: number;
  profitUnits: number;
  bankrollBefore: number;
  bankrollAfter: number;
  wasReset: boolean;
}

export interface LedgerSummary {
  startingBankrollUnits: number;
  currentBankrollUnits: number;
  goalUnits: number;
  currentRunProfitUnits: number;
  currentRunRoiPct: number;
  record: { wins: number; losses: number; pushes: number };
  settledPickCount: number;
  currentStreak: number;
  lastSettledDate: string | null;
  lastSettledResult: SettledResult | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build the settled ledger + summary from chronological settled Builder Picks. Pure. */
export function buildBankBuilderLedger(
  picks: ReadonlyArray<SettledBuilderPick>,
  opts: { base: number; goal: number },
): { entries: LedgerEntry[]; summary: LedgerSummary } {
  const { base, goal } = opts;
  let bankroll = base;
  let streak = 0;
  const record = { wins: 0, losses: 0, pushes: 0 };
  const entries: LedgerEntry[] = [];

  // chronological order is the caller's responsibility; sort defensively by date
  const ordered = [...picks].sort((a, b) => a.date.localeCompare(b.date));
  for (const p of ordered) {
    const before = bankroll;
    let after: number, payout: number;
    if (p.result === "win") {
      after = r2(before * p.combinedDecimal);
      payout = after;
      record.wins++; streak = streak >= 0 ? streak + 1 : 1;
    } else if (p.result === "loss") {
      after = base; // reset on loss
      payout = 0;
      record.losses++; streak = streak <= 0 ? streak - 1 : -1;
    } else {
      after = before; payout = before; record.pushes++;
    }
    entries.push({
      ...p, stakeUnits: before, payoutUnits: payout, profitUnits: r2(after - before),
      bankrollBefore: before, bankrollAfter: after,
      wasReset: p.result === "loss" && before > base,
    });
    bankroll = after;
  }

  const last = entries[entries.length - 1] || null;
  return {
    entries,
    summary: {
      startingBankrollUnits: base, currentBankrollUnits: bankroll, goalUnits: goal,
      currentRunProfitUnits: r2(bankroll - base),
      currentRunRoiPct: Math.round(((bankroll - base) / base) * 1000) / 10,
      record, settledPickCount: entries.length, currentStreak: streak,
      lastSettledDate: last?.date ?? null, lastSettledResult: last?.result ?? null,
    },
  };
}
