/**
 * DataSourceBadge — compact strip showing data mode + source for the day.
 *
 * Reads meta.json and renders:
 *   DATA · Demo / Live / Hybrid
 *   NBA      <source>     <status>
 *   ODDS     <source>     <status>
 *   FALLBACKS espn, balldontlie, opticodds, sportsdata
 *   SYNCED   <timestamp>
 *
 * Designed to slot into the Model Board and Methodology pages without
 * crowding them.
 */
import type { MetaData } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";

export default function DataSourceBadge({ meta }: { meta: MetaData }) {
  const mode = meta.dataMode || (meta.isDemo ? "Demo" : "Live");
  const modeColor =
    mode === "Live" ? "var(--lime)" : mode === "Hybrid" ? "var(--amber)" : "var(--text-faint)";
  const modeBg =
    mode === "Live" ? "var(--lime-dim)" : mode === "Hybrid" ? "var(--amber-dim)" : "rgba(255,255,255,0.05)";

  const fallbacks = meta.fallbackSourcesAvailable || {};
  const enabledFallbacks = Object.entries(fallbacks)
    .filter(([, status]) => status === "enabled")
    .map(([name]) => name);
  const disabledFallbacks = Object.entries(fallbacks)
    .filter(([, status]) => status === "disabled")
    .map(([name]) => name);

  return (
    <aside className="surface px-4 py-3 font-mono text-[11px] tracking-wide">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">data</span>
          <span
            className="px-2 py-0.5 rounded-[2px] uppercase tracking-wider"
            style={{ color: modeColor, background: modeBg }}
          >
            {mode}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">nba</span>
          <span className="text-[var(--text)]">{meta.nbaScheduleSource || "—"}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">odds</span>
          <span className="text-[var(--text)]">{meta.oddsSource || "—"}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">synced</span>
          <span className="text-[var(--text-mute)]">
            {formatTimestamp(meta.lastPipelineRun)}
          </span>
        </div>
      </div>

      {(enabledFallbacks.length > 0 || disabledFallbacks.length > 0) && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          <span className="text-[var(--text-faint)] uppercase">fallbacks</span>
          {enabledFallbacks.map((n) => (
            <span key={n} className="text-[var(--lime)]">
              {n} on
            </span>
          ))}
          {disabledFallbacks.map((n) => (
            <span key={n} className="text-[var(--text-faint)]">
              {n} off
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}
