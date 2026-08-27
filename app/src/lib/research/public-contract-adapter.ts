/**
 * SPRINT 051 — the one typed reader for the public research contract.
 *
 * WHY A READER AND NOT A CALCULATOR
 * Sprint 050 built `public/data/research/*.json` so that a number appearing on two pages comes from
 * one place. That guarantee survives only if surfaces READ it. The moment a page computes "the hit
 * rate" from partial data — because the artifact was awkward to reach, or a field was missing — the
 * contract is decorative and the pages start disagreeing again. That is exactly how `/board` and
 * `/about` each ended up with a hardcoded 51.7% that drifted from the ledger for weeks.
 *
 * So this layer is deliberately dumb about statistics. It parses, validates, and hands values through
 * unchanged. It has no `reduce`, no averaging, no rate arithmetic. If a value is missing, the answer is
 * `UNAVAILABLE` — never a recomputation, never a default that reads as fine.
 *
 * FAIL-CLOSED, ALWAYS
 * A missing artifact yields `UNAVAILABLE`. An unknown schema version yields `UNAVAILABLE`. Malformed
 * JSON yields `UNAVAILABLE`. None of them yield `READY`, because a status surface that shows green
 * when it cannot read its own inputs is worse than one that is simply down.
 *
 * Server-only: reads from disk. Pages load here and pass plain data to client components.
 */
import fs from "node:fs";
import path from "node:path";

/** The schema version this reader understands. A future artifact must be handled explicitly. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/* P214 R-I: resolved lazily and env-overridable so the adapter TESTS can scaffold their own copy
   of the artifacts — their corrupt-file probes used to mutate the LIVE files, and node --test's
   per-file processes let a concurrent reader catch the file mid-write ("Unexpected end of JSON
   input" in CI). Production behavior is unchanged: the env is never set outside the test scaffold. */
const researchDir = () => process.env.GTP_RESEARCH_DIR ?? path.join(process.cwd(), "public", "data", "research");

export type StageState =
  | "READY"
  | "DUE"
  | "DELAYED_WITHIN_GRACE"
  | "FAILED"
  | "QUARANTINED"
  | "STALE"
  | "UNAVAILABLE";

const VALID_STATES: readonly StageState[] = [
  "READY", "DUE", "DELAYED_WITHIN_GRACE", "FAILED", "QUARANTINED", "STALE", "UNAVAILABLE",
];

export interface StageView {
  readonly stage: string;
  readonly state: StageState;
  readonly detail: string;
}

export interface SystemStatusView {
  readonly overall: StageState;
  readonly overallReason: string;
  readonly stages: readonly StageView[];
  /** True when the contract could not be read at all, as opposed to read and unhealthy. */
  readonly unreadable: boolean;
}

export interface RegistryMarketView {
  readonly market: string;
  readonly status: "APPROVED" | "MONITOR" | "RECALIBRATE" | "DISABLED";
  readonly n: number;
  readonly hitRate: number | null;
  readonly hitRate95: { readonly low: number | null; readonly high: number | null };
  readonly overconfidencePp: number | null;
  readonly rationale: string;
}

export interface RegistryView {
  readonly counts: Readonly<Record<string, number>>;
  readonly noneApproved: boolean;
  readonly statusNote: string;
  readonly markets: readonly RegistryMarketView[];
}

export interface QuarantineView {
  readonly date: string;
  readonly state: "QUARANTINED";
  readonly publicExplanation: string;
}

export interface ModelUniverseView {
  readonly label: string;
  readonly decisiveRows: number;
  readonly hitRate: number | null;
  readonly dateRange: readonly [string, string] | null;
  readonly overconfidencePp: number | null;
  readonly separationNote: string;
}

export interface CalibrationView {
  readonly version: string;
  readonly fitWindow: { readonly from: string; readonly to: string; readonly rows: number };
  readonly heldOutWindow: { readonly from: string; readonly to: string; readonly rows: number };
  readonly rawBrier: number;
  readonly calibratedBrier: number;
  readonly marketBrier: number;
  readonly stillBehindMarket: boolean;
  readonly plainLanguage: readonly string[];
}

export interface TerminalView {
  readonly available: boolean;
  readonly unavailableReason: string | null;
  readonly asOfSettledDate: string | null;
  readonly positioning: { readonly product: string; readonly posture: string; readonly whatWeCompare: readonly string[] } | null;
  readonly modelUniverse: ModelUniverseView | null;
  readonly calibration: CalibrationView | null;
  readonly registry: RegistryView | null;
  readonly quarantines: readonly QuarantineView[];
  readonly systemStatus: SystemStatusView;
}

// ── parsing ────────────────────────────────────────────────────────────────────

function readArtifact(file: string): { ok: true; data: unknown } | { ok: false; reason: string } {
  const p = path.join(researchDir(), file);
  if (!fs.existsSync(p)) return { ok: false, reason: `${file} is not present` };
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { ok: false, reason: `${file} could not be parsed` };
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/** An unreadable contract is UNAVAILABLE, never READY. */
function unreadableStatus(reason: string): SystemStatusView {
  return {
    overall: "UNAVAILABLE",
    overallReason: reason,
    stages: [],
    unreadable: true,
  };
}

export function loadSystemStatus(): SystemStatusView {
  const res = readArtifact("system-status.json");
  if (!res.ok) return unreadableStatus(res.reason);

  const d = res.data as Record<string, unknown>;
  const rawStages = Array.isArray(d.stages) ? d.stages : null;
  if (!rawStages) return unreadableStatus("system-status.json has no stages");

  const stages: StageView[] = rawStages.map((s) => {
    const st = s as Record<string, unknown>;
    const state = str(st.state) as StageState;
    return {
      stage: str(st.stage, "unknown"),
      // An unrecognised state is treated as UNAVAILABLE rather than passed through — a surface must
      // never render a state it has no defined meaning for.
      state: VALID_STATES.includes(state) ? state : "UNAVAILABLE",
      detail: str(st.detail, "no detail recorded"),
    };
  });

  const overall = str(d.overall) as StageState;
  return {
    overall: VALID_STATES.includes(overall) ? overall : "UNAVAILABLE",
    overallReason: str(d.overallReason, "no reason recorded"),
    stages,
    unreadable: false,
  };
}

export function loadTerminal(): TerminalView {
  const res = readArtifact("terminal-summary.json");
  if (!res.ok) {
    return {
      available: false, unavailableReason: res.reason, asOfSettledDate: null,
      positioning: null, modelUniverse: null, calibration: null, registry: null,
      quarantines: [], systemStatus: unreadableStatus(res.reason),
    };
  }

  const d = res.data as Record<string, unknown>;
  if (num(d.schemaVersion) !== SUPPORTED_SCHEMA_VERSION) {
    // An artifact from a future build may mean something different by the same field names. Refusing
    // is the only safe response; rendering it would be guessing.
    const reason = `terminal-summary.json is schema version ${String(d.schemaVersion)}, this build understands ${SUPPORTED_SCHEMA_VERSION}`;
    return {
      available: false, unavailableReason: reason, asOfSettledDate: null,
      positioning: null, modelUniverse: null, calibration: null, registry: null,
      quarantines: [], systemStatus: unreadableStatus(reason),
    };
  }

  const mu = (d.modelUniverse ?? {}) as Record<string, unknown>;
  const range = Array.isArray(mu.dateRange) && mu.dateRange.length === 2
    ? ([String(mu.dateRange[0]), String(mu.dateRange[1])] as const)
    : null;

  const cal = d.calibration as Record<string, unknown> | null | undefined;
  const evaluation = (cal?.evaluation ?? {}) as Record<string, unknown>;

  const reg = (d.registry ?? {}) as Record<string, unknown>;
  const markets = (reg.markets ?? {}) as Record<string, Record<string, unknown>>;

  return {
    available: true,
    unavailableReason: null,
    asOfSettledDate: str(d.asOfSettledDate) || null,
    positioning: d.positioning
      ? {
          product: str((d.positioning as Record<string, unknown>).product),
          posture: str((d.positioning as Record<string, unknown>).posture),
          whatWeCompare: ((d.positioning as Record<string, unknown>).whatWeCompare as string[]) ?? [],
        }
      : null,
    modelUniverse: {
      label: str(mu.label, "model research universe"),
      decisiveRows: num(mu.decisiveRows) ?? 0,
      hitRate: num(mu.hitRate),
      dateRange: range,
      overconfidencePp: num(mu.overconfidencePp),
      separationNote: str(mu.separateFromPaperRecord),
    },
    calibration: cal
      ? {
          version: str(cal.version),
          fitWindow: (cal.fitWindow ?? { from: "", to: "", rows: 0 }) as CalibrationView["fitWindow"],
          heldOutWindow: (cal.heldOutWindow ?? { from: "", to: "", rows: 0 }) as CalibrationView["heldOutWindow"],
          rawBrier: num(evaluation.rawModelBrier) ?? 0,
          calibratedBrier: num(evaluation.calibratedBrier) ?? 0,
          marketBrier: num(evaluation.marketBrier) ?? 0,
          stillBehindMarket: evaluation.stillBehindMarket === true,
          plainLanguage: (cal.plainLanguage as string[]) ?? [],
        }
      : null,
    registry: {
      counts: (reg.counts ?? {}) as Record<string, number>,
      noneApproved: reg.noneApproved === true,
      statusNote: str(reg.statusNote),
      markets: Object.entries(markets).map(([market, v]) => ({
        market,
        status: str(v.status, "MONITOR") as RegistryMarketView["status"],
        n: num(v.n) ?? 0,
        hitRate: num(v.hitRate),
        hitRate95: {
          low: num((v.hitRate95 as Record<string, unknown>)?.low),
          high: num((v.hitRate95 as Record<string, unknown>)?.high),
        },
        overconfidencePp: num(v.overconfidencePp),
        rationale: str(v.rationale),
      })),
    },
    // A quarantined slate is carried through with its explanation and WITHOUT any record. The reader
    // deliberately does not expose a hitRate field here even if a future artifact grew one.
    quarantines: (Array.isArray(d.quarantines) ? d.quarantines : []).map((q) => {
      const qq = q as Record<string, unknown>;
      return {
        date: str(qq.date),
        state: "QUARANTINED" as const,
        publicExplanation: str(qq.publicExplanation),
      };
    }),
    systemStatus: loadSystemStatus(),
  };
}

export interface DailyBriefView {
  readonly available: boolean;
  readonly date: string | null;
  readonly decisiveRows: number;
  readonly wins: number;
  readonly decisiveHitRate: number | null;
  readonly meanStatedProbability: number | null;
  readonly meanMarketProbability: number | null;
  readonly calibrationErrorPp: number | null;
  readonly modelBrier: number | null;
  readonly marketBrier: number | null;
  readonly byMarketFamily: readonly {
    readonly market: string; readonly n: number; readonly hitRate: number | null;
    readonly calibrationErrorPp: number | null; readonly sufficientSample: boolean;
  }[];
  readonly observations: readonly string[];
  readonly whatShouldNotBeConcluded: readonly string[];
}

export function loadDailyBrief(): DailyBriefView {
  const empty: DailyBriefView = {
    available: false, date: null, decisiveRows: 0, wins: 0, decisiveHitRate: null,
    meanStatedProbability: null, meanMarketProbability: null, calibrationErrorPp: null,
    modelBrier: null, marketBrier: null, byMarketFamily: [], observations: [],
    whatShouldNotBeConcluded: [],
  };
  const res = readArtifact("daily-brief.json");
  if (!res.ok) return empty;

  const d = res.data as Record<string, unknown>;
  const scoring = (d.scoring ?? {}) as Record<string, unknown>;
  return {
    available: true,
    date: str(d.date) || null,
    decisiveRows: num(d.decisiveRows) ?? 0,
    wins: num(d.wins) ?? 0,
    decisiveHitRate: num(d.decisiveHitRate),
    meanStatedProbability: num(d.meanStatedProbability),
    meanMarketProbability: num(d.meanMarketProbability),
    calibrationErrorPp: num(d.calibrationErrorPp),
    modelBrier: num(scoring.modelBrier),
    marketBrier: num(scoring.marketBrier),
    byMarketFamily: (Array.isArray(d.byMarketFamily) ? d.byMarketFamily : []).map((m) => {
      const mm = m as Record<string, unknown>;
      return {
        market: str(mm.market),
        n: num(mm.n) ?? 0,
        hitRate: num(mm.hitRate),
        calibrationErrorPp: num(mm.calibrationErrorPp),
        sufficientSample: mm.sufficientSample === true,
      };
    }),
    observations: (d.observations as string[]) ?? [],
    whatShouldNotBeConcluded: (d.whatShouldNotBeConcluded as string[]) ?? [],
  };
}

// ── presentation helpers (formatting only — never arithmetic on rates) ─────────

/** Human label for a state. Kept here so every surface uses the same words. */
export const STATE_LABEL: Readonly<Record<StageState, string>> = {
  READY: "Ready",
  DUE: "Due",
  DELAYED_WITHIN_GRACE: "Running late",
  FAILED: "Failed",
  QUARANTINED: "Withheld",
  STALE: "Out of date",
  UNAVAILABLE: "Unavailable",
};

/**
 * A short, non-technical gloss for each state.
 *
 * "Running late" must read differently from "Failed" — a scheduler that habitually starts two hours
 * after its cron is not a failure, and conflating the two teaches the reader to ignore both.
 */
export const STATE_MEANING: Readonly<Record<StageState, string>> = {
  READY: "Up to date and working.",
  DUE: "Expected soon; not late yet.",
  DELAYED_WITHIN_GRACE: "Later than usual, still inside the normal window. Not a failure.",
  FAILED: "This step did not complete.",
  QUARANTINED: "Deliberately withheld because the data failed an integrity check.",
  STALE: "Ran, but the data behind it is older than it should be.",
  UNAVAILABLE: "We could not read this. Treat it as unknown, not as fine.",
};

/** Formats a rate for display, or an explicit dash. Never invents a value. */
export const formatRate = (v: number | null | undefined, digits = 2): string =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
