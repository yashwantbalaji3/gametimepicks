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

const POLICY_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "audit",
  "policy.json",
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

// ---------------------------------------------------------------------------
// PR #118 — confirming-signal policy summary loader
// ---------------------------------------------------------------------------

/**
 * Minimal subset of `app/public/data/audit/policy.json` that the
 * /results banner uses. Server-only — the full policy stays a build
 * artifact; this loader returns only what's safe to render publicly.
 *
 * `null` when the policy file is missing or malformed. Consumers must
 * tolerate that — the banner still renders without it.
 */
export interface DailyAuditPolicySummary {
  daysAvailable: number;
  daysRequired: number;
  windowDays: number;
  confirmed: boolean;
  /** Names of model-changing + UI signals that have confirmed. */
  confirmedSignalNames: string[];
  warnings: string[];
}

/** PR `feature/learning-signal-tables` — raw signal dictionary
 *  read straight from the policy file so the learning-signals
 *  helper can show fires / daysRequired / confirmed per row.
 *  Returns null when the policy file is missing or malformed. */
export function getRawAuditPolicy(): {
  confirmed?: boolean;
  signals?: Record<
    string,
    {
      fires?: number;
      daysRequired?: number;
      confirmed?: boolean;
      strength?: number;
      weightMultiplier?: number;
    }
  >;
} | null {
  if (!fs.existsSync(POLICY_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const sigsIn = (raw.signals ?? {}) as Record<string, unknown>;
    const sigsOut: Record<
      string,
      {
        fires?: number;
        daysRequired?: number;
        confirmed?: boolean;
        strength?: number;
        weightMultiplier?: number;
      }
    > = {};
    for (const [name, sig] of Object.entries(sigsIn)) {
      if (!sig || typeof sig !== "object") continue;
      // `marketDemotions` is a per-market dict; flatten each market
      // entry into a top-level `market:<market>` signal so the
      // learning-signals table can surface each one.
      if (name === "marketDemotions") {
        const m = sig as Record<string, Record<string, unknown>>;
        for (const [mk, mv] of Object.entries(m)) {
          if (!mv || typeof mv !== "object") continue;
          sigsOut[`market:${mk}`] = {
            fires: Number((mv as { fires?: number }).fires ?? 0),
            daysRequired: Number(
              (mv as { daysRequired?: number }).daysRequired ?? 0,
            ),
            confirmed: Boolean(
              (mv as { confirmed?: boolean }).confirmed,
            ),
            strength: Number(
              (mv as { strength?: number }).strength ?? 0,
            ),
            weightMultiplier: Number(
              (mv as { weightMultiplier?: number }).weightMultiplier ?? 1,
            ),
          };
        }
        continue;
      }
      const s = sig as {
        fires?: number;
        daysRequired?: number;
        confirmed?: boolean;
        strength?: number;
      };
      sigsOut[name] = {
        fires: Number(s.fires ?? 0),
        daysRequired: Number(s.daysRequired ?? 0),
        confirmed: Boolean(s.confirmed),
        strength: Number(s.strength ?? 0),
      };
    }
    return {
      confirmed: Boolean(raw.confirmed),
      signals: sigsOut,
    };
  } catch {
    return null;
  }
}

export function getDailyAuditPolicy(): DailyAuditPolicySummary | null {
  if (!fs.existsSync(POLICY_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8")) as Record<string, unknown>;
    const window = (raw.window ?? {}) as Record<string, unknown>;
    const signals = (raw.signals ?? {}) as Record<string, unknown>;
    const confirmedNames: string[] = [];
    for (const [name, sig] of Object.entries(signals)) {
      if (name === "marketDemotions") {
        const m = (sig ?? {}) as Record<string, { confirmed?: boolean }>;
        for (const [mk, mv] of Object.entries(m)) {
          if (mv && mv.confirmed) confirmedNames.push(`market:${mk}`);
        }
      } else {
        const s = sig as { confirmed?: boolean } | null;
        if (s && s.confirmed) confirmedNames.push(name);
      }
    }
    return {
      daysAvailable: Number(window.daysAvailable ?? 0),
      daysRequired: Number(window.daysRequired ?? 0),
      windowDays: Number(window.windowDays ?? 0),
      confirmed: Boolean(raw.confirmed),
      confirmedSignalNames: confirmedNames,
      warnings: Array.isArray(raw.warnings)
        ? raw.warnings.filter((w): w is string => typeof w === "string")
        : [],
    };
  } catch {
    return null;
  }
}
