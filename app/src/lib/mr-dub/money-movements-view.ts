/**
 * The /mr-dub money-movements view (Session 8 · A): reads the protected owners, reconciles card by card,
 * and hands the panel only what reconciled. Open exposure is the page's one existing figure
 * (computeOpenExposure), so the panel can never print a second, different "open exposure".
 */
import fs from "node:fs";
import path from "node:path";
import { reconcileMoney } from "./money-movements.mjs";
import { computeOpenExposure } from "./open-exposure";
import type { MoneyMovementsView } from "@/components/mr-dub/money-movements-panel";

const readJson = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));

export function buildMoneyMovementsView(root: string, today: string, limit = 12): MoneyMovementsView {
  const dir = path.join(root, "mr-dub", "settled");
  try {
    const receipts = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
      .map((f) => ({ ...readJson(path.join(dir, f)), date: f.slice(0, 10) }));
    const portfolio = readJson(path.join(root, "mr-dub", "portfolio.json"));
    const r = reconcileMoney({
      portfolio,
      ledgerEvents: readJson(path.join(root, "mr-dub", "ledger.json")).events ?? [],
      summaryDays: readJson(path.join(root, "mr-dub", "daily-summary.json")).days ?? [],
      receipts,
    });
    const s = r.summary;
    return {
      ok: r.ok,
      currentBankroll: s.currentBankroll, peak: s.peak, peakDate: s.peakDate, deltaToPeak: s.deltaToPeak,
      openExposure: computeOpenExposure(root, today).total,
      rows: r.movements.slice(-limit).reverse(), totalRows: r.movements.length, foldedThrough: s.foldedThrough,
    };
  } catch {
    return { ok: false, currentBankroll: 0, peak: 0, peakDate: null, deltaToPeak: 0, openExposure: 0, rows: [], totalRows: 0, foldedThrough: null };
  }
}
