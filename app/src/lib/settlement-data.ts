/**
 * Phase 8.2 — settlement data loader (revised).
 *
 * Reads from app/public/data/results/ at BUILD TIME (server component
 * via fs). This directory is the sanitized export from
 * `pipeline/validation/` produced by `python -m pipeline.export_results`.
 *
 * Why the dedicated /results/ directory:
 *   - Lives inside app/public/, so Next.js static export treats it as
 *     a known data location (same pattern as /data/boards/ and
 *     /data/slate.json).
 *   - No cross-directory `..` traversals during build.
 *   - PII / internal-only fields stripped at export time.
 *
 * Honest framing: never invents data. When no settled rows exist the
 * loaders return empty / null; the UI shows a polished empty state.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "results");

const SETTLED_PATH = path.join(DATA_DIR, "settled_leans.jsonl");
const MANIFEST_PATH = path.join(DATA_DIR, "available_dates.json");
const LIFETIME_PATH = path.join(DATA_DIR, "lifetime_summary.json");

export interface SettledLean {
  date: string;
  gameId?: string;
  playerId?: number;
  playerName?: string;
  team?: string;
  opponent?: string;
  market?: "PTS" | "REB" | "AST";
  side?: "Over" | "Under";
  line?: number;
  bookmaker?: string;
  oddsOver?: number;
  oddsUnder?: number;
  modelProjection?: number | null;
  edgePct?: number | null;
  confidence?: string;
  finalStat?: number;
  result?: "win" | "loss" | "push" | "stats_unavailable" | "invalid";
  projectionError?: number;
  absoluteProjectionError?: number;
  settlementSource?: string;
  failureReason?: string;
}

export interface BucketStats {
  wins: number;
  losses: number;
  pushes: number;
  total: number;
  decisive: number;
  hitRate: number | null;
}

export interface ComparisonReport {
  date: string;
  generatedAt: string;
  totalRows: number;
  totalSettled: number;
  decisive: number;
  wins: number;
  losses: number;
  pushes: number;
  statsUnavailable: number;
  invalid: number;
  hitRate: number | null;
  averageProjectionError: number | null;
  averageAbsoluteProjectionError: number | null;
  byMarket: Record<string, BucketStats>;
  byConfidence: Record<string, BucketStats>;
  byGame: Record<string, BucketStats>;
  byBookmaker: Record<string, BucketStats>;
  largestMisses: Array<Record<string, unknown>>;
  bestCalls: Array<Record<string, unknown>>;
  sampleSizeWarning: string | null;
  _disclaimer?: string;
}

export interface LifetimeSummary {
  totalDates: number;
  totalSettled: number;
  decisive: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  smallSample: boolean;
  oldestDate: string | null;
  newestDate: string | null;
}

// ---------------------------------------------------------------------------
// Readers — every one of these is null/empty-safe.
// ---------------------------------------------------------------------------
function readJsonSafe<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (err) {
    console.warn(`[settlement-data] could not read ${p}:`, err);
    return fallback;
  }
}

function readSettledLeans(): SettledLean[] {
  if (!fs.existsSync(SETTLED_PATH)) return [];
  try {
    const raw = fs.readFileSync(SETTLED_PATH, "utf-8");
    const out: SettledLean[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as SettledLean);
      } catch {
        // skip malformed lines silently
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getAvailableSettlementDates(): string[] {
  const manifest = readJsonSafe<{ dates?: string[] }>(MANIFEST_PATH, {});
  if (manifest.dates && manifest.dates.length > 0) {
    return [...manifest.dates].sort().reverse();
  }
  // Fallback: derive from settled rows
  const rows = readSettledLeans();
  const set = new Set<string>();
  for (const r of rows) if (r.date) set.add(r.date);
  return Array.from(set).sort().reverse();
}

export function getSettlementForDate(date: string): {
  rows: SettledLean[];
  report: ComparisonReport | null;
} {
  const rows = readSettledLeans().filter((r) => r.date === date);
  const reportPath = path.join(DATA_DIR, `comparison_report_${date}.json`);
  const report = fs.existsSync(reportPath)
    ? readJsonSafe<ComparisonReport | null>(reportPath, null)
    : null;
  return { rows, report };
}

export function getLatestSettlement(): {
  date: string;
  rows: SettledLean[];
  report: ComparisonReport | null;
} | null {
  const dates = getAvailableSettlementDates();
  if (dates.length === 0) return null;
  const date = dates[0];
  const { rows, report } = getSettlementForDate(date);
  return { date, rows, report };
}

export function getLifetimeSummary(): LifetimeSummary {
  const fallback: LifetimeSummary = {
    totalDates: 0,
    totalSettled: 0,
    decisive: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    hitRate: null,
    smallSample: true,
    oldestDate: null,
    newestDate: null,
  };
  const summary = readJsonSafe<LifetimeSummary | null>(LIFETIME_PATH, null);
  if (summary && typeof summary.totalSettled === "number") return summary;
  return fallback;
}

export function getResultForLean(
  date: string,
  playerId: number | undefined,
  market: string | undefined,
): SettledLean["result"] | undefined {
  if (playerId === undefined || market === undefined) return undefined;
  const rows = readSettledLeans();
  const decisive = rows.find(
    (r) =>
      r.date === date &&
      r.playerId === playerId &&
      r.market === market &&
      (r.result === "win" || r.result === "loss" || r.result === "push"),
  );
  if (decisive) return decisive.result;
  const any = rows.find(
    (r) => r.date === date && r.playerId === playerId && r.market === market,
  );
  return any?.result;
}
