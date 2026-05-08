/**
 * DataSourceBadge — public-safe board status strip.
 *
 * This component intentionally hides operator/admin implementation details:
 * - no provider names
 * - no API credit counts
 * - no fallback provider toggles
 * - no manual override wording
 * - no pipeline internals
 *
 * Public users should only see product-facing state.
 */
import type { MetaData, DataMode } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";

const MODE_DISPLAY: Record<
  DataMode,
  { label: string; color: string; bg: string }
> = {
  Live: {
    label: "Model board live",
    color: "var(--vault-gold-bright)",
    bg: "var(--vault-gold-dim)",
  },
  ScheduleLiveOddsUnavailable: {
    label: "Model leans pending",
    color: "var(--vault-gold-bright)",
    bg: "var(--vault-gold-dim)",
  },
  NoGames: {
    label: "No games today",
    color: "var(--text-faint)",
    bg: "rgba(255,255,255,0.05)",
  },
  ScheduleUnavailable: {
    label: "Schedule unavailable",
    color: "var(--rose)",
    bg: "rgba(244, 63, 94, 0.08)",
  },
  DemoForced: {
    label: "Sample data",
    color: "var(--vault-warn)",
    bg: "var(--vault-warn-dim)",
  },
};

export default function DataSourceBadge({ meta }: { meta: MetaData }) {
  const mode: DataMode =
    meta.todayDataMode ??
    (meta.dataMode as DataMode) ??
    (meta.isDemo ? "DemoForced" : "Live");

  const display = MODE_DISPLAY[mode] ?? MODE_DISPLAY.ScheduleUnavailable;

  const scheduleLabel = scheduleStatusLabel(meta);
  const oddsLabel = oddsStatusLabel(meta);
  const resultsLabel = resultsStatusLabel();
  const freshnessLabel = freshnessStatusLabel(meta.lastPipelineRun);

  const showDiagnostics =
    process.env.NEXT_PUBLIC_SHOW_DIAGNOSTICS === "true";

  return (
    <aside className="surface px-4 py-3 font-mono text-[11px] tracking-wide">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">status</span>
          <span
            className="px-2 py-0.5 rounded-[2px] uppercase tracking-wider"
            style={{ color: display.color, background: display.bg }}
          >
            {display.label}
          </span>
        </div>

        <StatusItem label={scheduleLabel} />
        <StatusItem label={oddsLabel} />
        <StatusItem label={resultsLabel} />
        <StatusItem label={freshnessLabel} muted />
        <StatusItem label="Educational analytics only" muted />
      </div>

      {showDiagnostics && (
        <details className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] text-[var(--text-faint)]">
          <summary className="cursor-pointer uppercase tracking-wider">
            operator diagnostics
          </summary>
          <div className="mt-2 grid gap-1">
            <div>mode: {mode}</div>
            <div>schedule source: {meta.nbaScheduleSource || "unknown"}</div>
            <div>odds status: {meta.todayOddsProviderStatus || "unknown"}</div>
            <div>odds source: {meta.oddsSource || "unavailable"}</div>
            <div>synced: {formatTimestamp(meta.lastPipelineRun)}</div>
          </div>
        </details>
      )}
    </aside>
  );
}

function StatusItem({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <span className={muted ? "text-[var(--text-faint)]" : "text-[var(--text)]"}>
      {label}
    </span>
  );
}

function scheduleStatusLabel(meta: MetaData): string {
  const mode = meta.todayDataMode ?? meta.dataMode;

  if (mode === "ScheduleUnavailable") return "Schedule unavailable";
  if (mode === "NoGames") return "No games today";
  if (mode === "ScheduleLiveOddsUnavailable") return "Schedule live";

  return "Schedule live";
}

function oddsStatusLabel(meta: MetaData): string {
  switch (meta.todayOddsProviderStatus) {
    case "ok_with_props":
      return "Model leans available";
    case "ok_no_props":
      return "Model leans pending";
    case "failed":
      return "Odds temporarily unavailable";
    case "dry_run":
      return "Model leans pending";
    case "not_configured":
      return "Model leans pending";
    case "demo":
      return "Sample model data";
    default:
      return "Model leans pending";
  }
}

function resultsStatusLabel(): string {
  return "Verified results pending";
}

function freshnessStatusLabel(lastPipelineRun?: string | null): string {
  if (!lastPipelineRun) return "Recently updated";

  const formatted = formatTimestamp(lastPipelineRun);
  if (!formatted || formatted === "—") return "Recently updated";

  return `Updated ${formatted}`;
}
