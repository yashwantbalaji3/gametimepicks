/**
 * GROWTH OPS VIEW — a PURE assembler for the internal /ops growth panel. It reports what the operator needs
 * to interpret distribution:
 *   • the analytics-sink state (live / disabled / misconfigured);
 *   • a FACTUAL funnel readout where every real-user metric is `NOT YET MEASURED` until a provider is live —
 *     never a fabricated zero;
 *   • a production-health read (latest slate/brief/social-pack dates + freshness) that SURFACES a stale or
 *     failed daily-production incident rather than masking it.
 *
 * No React/Next imports so tsx can unit-test it directly; the /ops page passes the artifact dates + config.
 */
import type { SinkConfig } from "./sink";

export const NOT_YET_MEASURED = "NOT YET MEASURED" as const;
export type FunnelValue = typeof NOT_YET_MEASURED | number;

export interface FunnelRow {
  step: string;
  event: string;
  value: FunnelValue;
}
export type SlateFreshness = "fresh" | "generating" | "stale" | "unknown";

export interface GrowthOpsView {
  sink: { enabled: boolean; hasEndpoint: boolean; state: "live" | "disabled" | "misconfigured" };
  funnel: FunnelRow[];
  sourceMix: FunnelRow[];
  health: {
    today: string;
    latestSlate: string | null;
    slateFreshness: SlateFreshness;
    latestBrief: string | null;
    latestSocialPack: string | null;
    daysBehind: number | null;
    /** Non-null ⇒ a production incident to surface (never mask). */
    incident: string | null;
  };
}

function dayDelta(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Build the growth-ops view. Real-user counts are only populated when a live query path supplies them
 * (`measuredCounts`); with the provider dark they stay `NOT YET MEASURED`.
 * @param opts.nowUtcHour UTC hour (0–23) — used only to tell "still generating" from "late/failed".
 * @param opts.measuredCounts OPTIONAL real counts from a live sink's query path (omit → all NOT YET MEASURED).
 */
export function buildGrowthOpsView(opts: {
  today: string;
  latestSlate: string | null;
  latestBrief?: string | null;
  latestSocialPack?: string | null;
  nowUtcHour: number;
  sinkConfig: SinkConfig;
  measuredCounts?: Partial<Record<string, number>>;
}): GrowthOpsView {
  const { today, latestSlate, sinkConfig } = opts;
  const c = opts.measuredCounts;
  const val = (key: string): FunnelValue => (c && typeof c[key] === "number" ? (c[key] as number) : NOT_YET_MEASURED);

  const funnel: FunnelRow[] = [
    { step: "Homepage → Today", event: "home_cta_click", value: val("home_cta_click") },
    { step: "Today hub", event: "daily_hub_view", value: val("daily_hub_view") },
    { step: "Daily brief", event: "daily_brief_view", value: val("daily_brief_view") },
    { step: "Game report", event: "game_report_open", value: val("game_report_open") },
    { step: "Results / recap", event: "results_recap_open", value: val("results_recap_open") },
    { step: "Next-day return", event: "return_visit", value: val("return_visit") },
  ];
  const sourceMix: FunnelRow[] = ["direct", "x", "discord", "instagram", "tiktok", "organic", "referral"].map((s) => ({
    step: s,
    event: "source_visit",
    value: val(`source:${s}`),
  }));

  // Production health / incident surfacing.
  const daysBehind = latestSlate ? dayDelta(latestSlate, today) : null;
  let slateFreshness: SlateFreshness = "unknown";
  let incident: string | null = null;
  if (latestSlate == null || daysBehind == null) {
    slateFreshness = "unknown";
  } else if (daysBehind <= 0) {
    slateFreshness = "fresh";
  } else if (daysBehind === 1 && opts.nowUtcHour < 15) {
    // Within the morning production window (≤ ~14:15 UTC = 10:15 ET) — legitimately generating.
    slateFreshness = "generating";
  } else {
    slateFreshness = "stale";
    incident = `Daily MLB production is late/failed: latest slate is ${latestSlate} (${daysBehind} day${daysBehind === 1 ? "" : "s"} behind today ${today}). Manually run workflow_dispatch: mlb-daily-production.`;
  }

  const state: GrowthOpsView["sink"]["state"] = sinkConfig.enabled ? "live" : sinkConfig.endpoint ? "misconfigured" : "disabled";

  return {
    sink: { enabled: sinkConfig.enabled, hasEndpoint: sinkConfig.endpoint != null, state },
    funnel,
    sourceMix,
    health: {
      today,
      latestSlate,
      slateFreshness,
      latestBrief: opts.latestBrief ?? latestSlate,
      latestSocialPack: opts.latestSocialPack ?? null,
      daysBehind,
      incident,
    },
  };
}
