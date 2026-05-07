"use client";

/**
 * Phase 14 — TodayAwareSlateBanner.
 *
 * The site is statically exported, so HTML is generated once at build
 * time. If the build ran on May 5 but the user visits on May 7, the
 * baked-in "Today's slate" labels are wrong.
 *
 * This client component:
 *   1. Receives the slate's primaryDate and the build-time guess at today
 *   2. After hydration, recomputes "today" using the user's real clock
 *      translated to ET
 *   3. If the slate is older than today, displays a "latest available
 *      slate (N days old)" banner instead of "today's slate"
 *   4. Surfaces the relative time since the pipeline last ran
 *
 * The banner is intentionally honest: it never claims a stale slate is
 * current. It also never crashes if window/Intl is missing — graceful
 * fallback to the build-time computation.
 */
import { useEffect, useState } from "react";
import {
  currentEtDate,
  classifySlate,
  daysOldVs,
  classifyRun,
  runFreshnessLabel,
  relativeTimeLabel,
  type SlateFreshness,
  type RunFreshness,
} from "@/lib/freshness";

interface Props {
  /** primaryDate from slate.json */
  slatePrimaryDate: string | null | undefined;
  /** lastPipelineRun from meta.json */
  lastPipelineRun: string | null | undefined;
  /** Build-time guess at "today" — used as the SSR fallback */
  buildTimeToday: string;
  /** When meta.dataMode == "ScheduleUnavailable", we surface a different message. */
  dataMode?: string;
}

export default function TodayAwareSlateBanner({
  slatePrimaryDate,
  lastPipelineRun,
  buildTimeToday,
  dataMode,
}: Props) {
  // Start with the build-time today (matches SSR output, no hydration mismatch)
  const [today, setToday] = useState<string>(buildTimeToday);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // After hydration: switch to the user's real clock
    setToday(currentEtDate());
    setNow(new Date());
  }, []);

  const slateClass: SlateFreshness = classifySlate(slatePrimaryDate, today);
  const runClass: RunFreshness = classifyRun(lastPipelineRun, now ?? undefined);
  const relTime = relativeTimeLabel(lastPipelineRun, now ?? undefined);

  // Don't render anything when the slate is genuinely current AND the
  // pipeline ran recently — no need to clutter the page.
  if (slateClass === "current" && (runClass === "fresh" || runClass === "recent")) {
    return null;
  }

  // Schedule unavailable is a separate honest-no-data state — don't
  // double up with our staleness banner.
  if (dataMode === "ScheduleUnavailable" || dataMode === "NoGames") {
    return null;
  }

  let label = "";
  let detail = "";
  let tone: "warn" | "neutral" = "neutral";

  if (slateClass === "no_data") {
    label = "no current slate";
    detail = "We don't have a board to show right now. Check back soon.";
    tone = "warn";
  } else if (slateClass === "previous" && slatePrimaryDate) {
    const days = daysOldVs(slatePrimaryDate, today);
    if (days <= 1) {
      label = "latest available slate";
      detail = `Showing ${slatePrimaryDate}. A newer slate hasn't been generated yet.`;
      tone = "neutral";
    } else {
      label = "stale slate";
      detail = `Showing ${slatePrimaryDate} — ${days} days old. A newer slate hasn't been generated yet.`;
      tone = "warn";
    }
  } else if (slateClass === "future" && slatePrimaryDate) {
    label = "upcoming slate";
    detail = `Showing ${slatePrimaryDate}. Live during the matchups.`;
    tone = "neutral";
  } else if (runClass === "stale" || runClass === "very_stale") {
    label = `data ${runFreshnessLabel(runClass)}`;
    detail = relTime ? `Last refreshed ${relTime}.` : "";
    tone = "warn";
  } else {
    return null;
  }

  return (
    <div
      className="rounded-[3px] px-4 py-3 text-[13px] leading-relaxed flex flex-wrap items-baseline gap-x-3 gap-y-1"
      style={{
        background: tone === "warn" ? "var(--vault-warn-dim)" : "var(--vault-panel-elevated)",
        border: "1px solid var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
      role="status"
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.18em] shrink-0"
        style={{
          color: tone === "warn" ? "var(--vault-warn)" : "var(--vault-gold)",
        }}
      >
        {label}
      </span>
      <span className="flex-1 min-w-0">{detail}</span>
      {relTime && (
        <span
          className="font-mono text-[11px] shrink-0"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {relTime}
        </span>
      )}
    </div>
  );
}
