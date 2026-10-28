/**
 * THE CURRENT ERA'S MONEY (P0 U2) — what the core paper bankroll did in the era the products run in today.
 *
 * /mr-dub and /bank-builder led with June figures ($100 → $14,065.40, 139.65×, peak $20,465.40) while the current
 * era (settled receipts since Aug 15, Rule S) is 28–38 and down $5,000. This reads the money owner's own fold —
 * nothing is computed beyond one subtraction check:
 *
 *   start   = protectedFold.base.currentBankroll — the bankroll the fold starts from (the July-7 protected base)
 *   pl      = protectedFold.bankrollDelta        — Σ of the folded days' deltas (every day since the first receipt)
 *   current = portfolio.currentBankroll
 *
 * It RECONCILES or it says nothing: when start + pl ≠ current (to the cent) the function returns null and the hero
 * shows no era P/L rather than a figure that does not add up. The era's dates are NOT read here — they are the
 * current-era record's window (lib/results/current-record.ts), so the money and the record cannot name different
 * eras.
 */
import fs from "node:fs";
import path from "node:path";

export interface CurrentEraMoney {
  startBankroll: number;
  bankroll: number;
  /** Settled P/L across the current era (negative = down). */
  pl: number;
}

type FoldDoc = { currentBankroll?: unknown; protectedFold?: { base?: { currentBankroll?: unknown }; bankrollDelta?: unknown } | null };

const cents = (n: number) => Math.round(n * 100);

export function currentEraMoney(portfolio: FoldDoc | null | undefined): CurrentEraMoney | null {
  const start = portfolio?.protectedFold?.base?.currentBankroll;
  const pl = portfolio?.protectedFold?.bankrollDelta;
  const bankroll = portfolio?.currentBankroll;
  if (typeof start !== "number" || typeof pl !== "number" || typeof bankroll !== "number") return null;
  if (![start, pl, bankroll].every(Number.isFinite)) return null;
  if (cents(start) + cents(pl) !== cents(bankroll)) return null;
  return { startBankroll: start, bankroll, pl };
}

export function loadCurrentEraMoney(root: string = path.join(process.cwd(), "public", "data")): CurrentEraMoney | null {
  try {
    return currentEraMoney(JSON.parse(fs.readFileSync(path.join(root, "mr-dub", "portfolio.json"), "utf8")));
  } catch {
    return null;
  }
}
