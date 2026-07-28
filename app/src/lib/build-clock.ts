/**
 * build-clock — how stale is the clock this static export was frozen at?
 *
 * The site is `output: "export"`. Every server-rendered "today", every date-gated section,
 * and every kickoff-vs-now filter resolved ONCE, at build time, and then froze. The client
 * <FreshnessBadge> already re-derives *labels* against the real wall clock, but the
 * underlying HTML only changes on a new build.
 *
 * Sprint 032 found the gap: the build clock's age was never recorded, so nothing — not /ops,
 * not the founder, not the app — could tell whether production's frozen "today" was actually
 * today. These helpers turn that into a stated fact.
 *
 * FAIL CLOSED, ALWAYS. A missing, malformed, or unparseable marker returns `"unknown"`, never
 * `"current"`. We would rather say "we cannot tell you how fresh this build is" than imply a
 * freshness we did not measure. Same rule the rest of the codebase runs on: no fake freshness.
 */

import { currentEtDate, daysOldVs } from "./freshness";

/** The marker written by `scripts/build-info.mjs` and served at `/data/build-info.json`. */
export type BuildInfo = {
  schema?: number;
  builtAt?: string | null;
  buildEtDate?: string | null;
  commit?: {
    sha?: string | null;
    shortSha?: string | null;
    message?: string | null;
    committedAt?: string | null;
  } | null;
  environment?: string | null;
};

export type BuildClockStatus =
  | "current" // build clock == today ET — date-gated HTML is correct
  | "yesterday" // one day behind — "today" sections render the wrong day
  | "stale" // 2–6 days behind
  | "very_stale" // 7+ days behind
  | "future" // build clock ahead of today (clock skew / manual override)
  | "unknown"; // no usable marker — we do not guess

export type BuildClock = {
  status: BuildClockStatus;
  /** ET days between the frozen build clock and today. Null when unknown. */
  daysBehind: number | null;
  buildEtDate: string | null;
  builtAt: string | null;
  shortSha: string | null;
  environment: string | null;
  /** True only when we positively measured a same-day clock. */
  ok: boolean;
};

const UNKNOWN: BuildClock = {
  status: "unknown",
  daysBehind: null,
  buildEtDate: null,
  builtAt: null,
  shortSha: null,
  environment: null,
  ok: false,
};

const ET_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Classify a build marker against the real current ET date.
 *
 * `today` is injected rather than read, so a client component can pass the browser's real
 * wall clock (the whole point — the build's own clock is the thing under suspicion) and
 * tests can pin it.
 */
export function classifyBuildClock(info: BuildInfo | null | undefined, today?: string): BuildClock {
  if (!info || typeof info !== "object") return UNKNOWN;

  const buildEtDate = typeof info.buildEtDate === "string" && ET_DATE.test(info.buildEtDate)
    ? info.buildEtDate
    : null;
  if (!buildEtDate) return UNKNOWN;

  const now = today && ET_DATE.test(today) ? today : currentEtDate();
  const daysBehind = daysOldVs(buildEtDate, now);

  let status: BuildClockStatus;
  if (daysBehind < 0) status = "future";
  else if (daysBehind === 0) status = "current";
  else if (daysBehind === 1) status = "yesterday";
  else if (daysBehind < 7) status = "stale";
  else status = "very_stale";

  const builtAt =
    typeof info.builtAt === "string" && Number.isFinite(Date.parse(info.builtAt)) ? info.builtAt : null;

  return {
    status,
    daysBehind,
    buildEtDate,
    builtAt,
    shortSha: info.commit?.shortSha ?? null,
    environment: typeof info.environment === "string" ? info.environment : null,
    ok: status === "current",
  };
}

/**
 * Operator-facing sentence. Describes the *build*, never the data — a fresh build over stale
 * data is still stale data, and that is reported separately by the slate freshness surfaces.
 */
export function buildClockLabel(clock: BuildClock): string {
  switch (clock.status) {
    case "current":
      return "Build clock is today — date-gated sections are current.";
    case "yesterday":
      return "Build clock is one day behind — sections that key off \"today\" render yesterday.";
    case "stale":
      return `Build clock is ${clock.daysBehind} days behind — date-gated sections are frozen.`;
    case "very_stale":
      return `Build clock is ${clock.daysBehind} days behind — this export has not been rebuilt in over a week.`;
    case "future":
      return "Build clock is ahead of today — check for clock skew on the build host.";
    case "unknown":
      return "Build clock unknown — this export carries no build marker.";
  }
}

/**
 * Read the marker baked into the JS bundle by next.config.mjs.
 *
 * This is the zero-network path: the values are compiled in, so a client component can compare
 * the frozen clock against the browser's real clock with no fetch and no hydration mismatch
 * risk. Returns null when the build predates the marker — callers must handle that as
 * "unknown", not as "fine".
 */
export function buildInfoFromEnv(): BuildInfo | null {
  const builtAt = process.env.NEXT_PUBLIC_BUILD_AT;
  const buildEtDate = process.env.NEXT_PUBLIC_BUILD_ET_DATE;
  if (!builtAt || !buildEtDate) return null;
  return {
    builtAt,
    buildEtDate,
    commit: { shortSha: process.env.NEXT_PUBLIC_BUILD_SHA || null },
    environment: process.env.NEXT_PUBLIC_BUILD_ENV || null,
  };
}
