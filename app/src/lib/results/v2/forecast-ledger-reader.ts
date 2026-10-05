/**
 * Build-time reader of the Universal Forecast Ledger (data/internal/forecast-ledger/v1) for Results V2 · the Forecast
 * Record. ONE reader: the /results/forecasts pages, the CSV emit and the /results card all read through here, so a
 * filtered count on a page and the rows in its CSV come from the same rows.
 */
import fs from "node:fs";
import path from "node:path";

import { forecastRecord } from "./forecast-record.mjs";

export const LEDGER_DIR = path.resolve(process.cwd(), "..", "data/internal/forecast-ledger/v1");
export const SPORT_SLUGS: Record<string, string> = { NFL: "nfl", MLB: "mlb", EPL: "epl", LIGUE_1: "ligue-1", UFC: "ufc" };
const SLUG_TO_SPORT: Record<string, string> = Object.fromEntries(Object.entries(SPORT_SLUGS).map(([k, v]) => [v, k]));

export type LedgerRow = Record<string, any>;

let cache: { rows: LedgerRow[]; manifest: any } | null = null;

export function readForecastLedger(dir: string = LEDGER_DIR): { rows: LedgerRow[]; manifest: any } {
  if (cache && dir === LEDGER_DIR) return cache;
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { rows: [], manifest: null };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows: LedgerRow[] = [];
  for (const s of Object.values<any>(manifest.sports ?? {})) {
    const p = path.join(dir, s.file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) if (line.trim()) rows.push(JSON.parse(line));
  }
  const out = { rows, manifest };
  if (dir === LEDGER_DIR) cache = out;
  return out;
}

export function forecastRecordView() {
  const { rows, manifest } = readForecastLedger();
  return forecastRecord(rows, { declaredGaps: manifest?.declaredGaps ?? [] });
}

export const sportFromSlug = (slug: string) => SLUG_TO_SPORT[slug] ?? null;
export const familySlug = (family: string) => family.replace(/_/g, "-");
export const familyFromSlug = (slug: string) => slug.replace(/-/g, "_");
export const csvHref = (sport: string, family: string) => `/data/forecast-record/v1/${SPORT_SLUGS[sport]}-${familySlug(family)}.csv`;
export const familyHref = (sport: string, family: string) => `/results/forecasts/${SPORT_SLUGS[sport]}/${familySlug(family)}/`;

/** Every (sport, family) the ledger holds — the static params of the family pages and the CSV files. */
export function ledgerFamilies(): Array<{ sport: string; family: string }> {
  const { rows } = readForecastLedger();
  const seen = new Map<string, { sport: string; family: string }>();
  for (const r of rows) seen.set(`${r.sport}|${r.family}`, { sport: r.sport, family: r.family });
  return [...seen.values()].sort((a, b) => (a.sport + a.family < b.sport + b.family ? -1 : 1));
}

export function familyRows(sport: string, family: string): LedgerRow[] {
  return readForecastLedger().rows
    .filter((r) => r.sport === sport && r.family === family)
    .sort((a, b) => String(b.eventStart ?? b.publishedAt ?? "").localeCompare(String(a.eventStart ?? a.publishedAt ?? "")) || (a.forecastId < b.forecastId ? -1 : 1));
}
