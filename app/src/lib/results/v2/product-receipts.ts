/**
 * RESULTS V2 · PRODUCT RECEIPTS FOR ONE DAY (Bank Builder V2 · G-4). Server/build time only.
 *
 * The settled Bank Builder and Moonshot cards for a day, straight from the owner's receipts
 * (public/data/mr-dub/settled/<date>.json, read through ladder-position.mjs readReceipts) — each lane's result and
 * every leg with its official score and the owner's grade. Nothing is graded or recomputed; a leg the owner has not
 * graded is "pending", never a loss. This is the receipt the record is folded from.
 */
import path from "node:path";

import { readReceipts } from "@/lib/products/ladder-position.mjs";

export interface ReceiptLeg { matchup: string | null; selection: string | null; market: string | null; official: string | null; result: string }
export interface ReceiptLane { product: "bank-builder" | "moonshot" | string; lane: string | null; result: string; legs: ReceiptLeg[] }
export interface DayReceipts { date: string; settledAt: string | null; source: string | null; lanes: ReceiptLane[] }

const root = () => path.join(process.cwd(), "public", "data");
let cache: Array<Record<string, any>> | null = null;
const all = () => (cache ??= readReceipts(root(), null) as Array<Record<string, any>>);

export function productReceiptsFor(date: string): DayReceipts | null {
  const r = all().find((x) => x.date === date);
  if (!r) return null;
  return {
    date, settledAt: r.settledAt ?? null, source: r.source ?? null,
    lanes: (r.lanes ?? []).map((l: any) => ({
      product: String(l.product ?? ""), lane: l.lane ?? null, result: String(l.result ?? l.status ?? "pending"),
      legs: (l.legs ?? []).map((g: any) => ({
        matchup: g.matchup ?? null, selection: g.selection ?? null, market: g.market ?? null,
        official: g.official != null ? String(g.official) : null, result: String(g.result ?? "pending"),
      })),
    })),
  };
}

/** Days with a product receipt — the day pages they add to /results/date/[date]. */
export function productReceiptDates(): string[] {
  return all().map((r) => String(r.date)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
}
