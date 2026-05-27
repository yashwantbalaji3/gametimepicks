/**
 * Loader for the daily postmortem JSON written by
 * `pipeline.audit_daily`. Server-only — reads from disk at build
 * time, never fetched by the client.
 *
 * Honest contract:
 *   - When no audit file exists for any date, returns `null` and the
 *     consumer renders nothing. We never invent rows.
 *   - The returned shape is a strict subset of the on-disk JSON —
 *     just the fields the /results banner actually displays.
 *   - Recommendations are passed through verbatim from Python.
 */
import fs from "node:fs";
import path from "node:path";

const AUDIT_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "daily",
);

export interface DailyAuditSummary {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number;
  totalSlips: number;
}

export interface DailyAuditRecommendation {
  id: string;
  severity: "info" | "warn";
  message: string;
}

export interface DailyAuditPayload {
  date: string;
  generatedAt: string;
  summary: DailyAuditSummary;
  recommendations: DailyAuditRecommendation[];
  warnings: string[];
}

/** Sorted list of dates that have an audit JSON on disk. */
export function listDailyAuditDates(): string[] {
  try {
    if (!fs.existsSync(AUDIT_DIR)) return [];
    return fs
      .readdirSync(AUDIT_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/** Load a single date's audit, or `null` if absent / malformed. */
export function getDailyAudit(date: string): DailyAuditPayload | null {
  const file = path.join(AUDIT_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<DailyAuditPayload>;
    if (!raw.date || !raw.summary) return null;
    return {
      date: raw.date,
      generatedAt: raw.generatedAt ?? "",
      summary: {
        wins: Number(raw.summary.wins ?? 0),
        losses: Number(raw.summary.losses ?? 0),
        pushes: Number(raw.summary.pushes ?? 0),
        pending: Number(raw.summary.pending ?? 0),
        decisive: Number(raw.summary.decisive ?? 0),
        hitRate: Number(raw.summary.hitRate ?? 0),
        totalSlips: Number(raw.summary.totalSlips ?? 0),
      },
      recommendations: Array.isArray(raw.recommendations)
        ? raw.recommendations.filter(
            (r): r is DailyAuditRecommendation =>
              !!r && typeof r === "object" && typeof r.id === "string",
          )
        : [],
      warnings: Array.isArray(raw.warnings)
        ? raw.warnings.filter((w): w is string => typeof w === "string")
        : [],
    };
  } catch {
    return null;
  }
}

/** Latest audit on disk, or `null` if none exist. */
export function getLatestDailyAudit(): DailyAuditPayload | null {
  const dates = listDailyAuditDates();
  if (dates.length === 0) return null;
  return getDailyAudit(dates[dates.length - 1]);
}
