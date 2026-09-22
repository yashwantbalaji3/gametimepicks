/**
 * Today's eligible universe for the Play products (v1.7 Phase H, "calendar-aware discovery").
 *
 * Reads the PUBLIC availability summary the eligible-leg builder writes each product day:
 * `public/data/products/availability/latest.json` — per sport, counts and a plain-English reason,
 * never an internal reason code. The page renders it; it decides nothing.
 */
import fs from "node:fs";
import path from "node:path";

export interface SportAvailability {
  sport: string;
  label: string;
  eligibleLegs: number;
  events: number;
  marketFamilies: number;
  reason: string;
  /** every eligible leg is market-priced with no forecast behind it (gate F1) */
  marketPricedOnly: boolean;
}
export interface ProductAvailability {
  date: string;
  asOf: string;
  sports: SportAvailability[];
  totalEligible: number;
}

const LABEL: Record<string, string> = { mlb: "MLB", nfl: "NFL", ufc: "UFC", epl: "Premier League", nba: "NBA" };
const ORDER = ["mlb", "nfl", "ufc", "epl", "nba"];

export function loadProductAvailability(dataRoot = path.join(process.cwd(), "public", "data")): ProductAvailability | null {
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(path.join(dataRoot, "products", "availability", "latest.json"), "utf8")); } catch { return null; }
  if (!doc || doc.schemaVersion !== 1 || !doc.sports) return null;
  const sports: SportAvailability[] = ORDER.filter((s) => doc.sports[s]).map((s) => {
    const x = doc.sports[s];
    return { sport: s, label: LABEL[s] ?? s.toUpperCase(), eligibleLegs: Number(x.eligibleLegs) || 0, events: Number(x.events) || 0, marketFamilies: Number(x.marketFamilies) || 0, reason: typeof x.reason === "string" ? x.reason : "not covered", marketPricedOnly: x.marketPricedOnly === true };
  });
  return { date: String(doc.date), asOf: String(doc.asOf), sports, totalEligible: sports.reduce((a, s) => a + s.eligibleLegs, 0) };
}
