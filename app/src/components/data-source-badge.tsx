/**
 * DataSourceBadge — compact strip showing data mode + source for the day.
 *
 * Phase 7B-2 — also surfaces:
 *   - Odds API source label (or "not configured" when key missing)
 *   - Today's odds quota remaining (from x-requests-remaining header)
 *   - "manual verified" tag when schedule came from operator override
 */
import type { MetaData, DataMode } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";

const MODE_DISPLAY: Record<
  DataMode,
  { label: string; color: string; bg: string }
> = {
  Live: {
    label: "live",
    color: "var(--lime)",
    bg: "var(--lime-dim)",
  },
  ScheduleLiveOddsUnavailable: {
    label: "schedule live · no odds",
    color: "var(--lime)",
    bg: "var(--lime-dim)",
  },
  NoGames: {
    label: "no games today",
    color: "var(--text-faint)",
    bg: "rgba(255,255,255,0.05)",
  },
  ScheduleUnavailable: {
    label: "schedule unavailable",
    color: "var(--rose)",
    bg: "rgba(244, 63, 94, 0.08)",
  },
  DemoForced: {
    label: "demo sample",
    color: "var(--amber)",
    bg: "var(--amber-dim)",
  },
};

export default function DataSourceBadge({ meta }: { meta: MetaData }) {
  const mode: DataMode =
    meta.todayDataMode ??
    (meta.dataMode as DataMode) ??
    (meta.isDemo ? "DemoForced" : "Live");

  const display = MODE_DISPLAY[mode] ?? MODE_DISPLAY.ScheduleUnavailable;

  // When the schedule came from manual override, surface that on the NBA row
  const nbaLabel = meta.todayManualOverrideUsed
    ? "manual verified"
    : meta.nbaScheduleSource || "—";

  // Phase 7B-2: odds row reflects sub-state, not just source name
  const oddsLabel = formatOddsLabel(meta);
  const oddsColor = oddsRowColor(meta);

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
            style={{ color: display.color, background: display.bg }}
          >
            {display.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">nba</span>
          <span className="text-[var(--text)]">{nbaLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">odds</span>
          <span style={{ color: oddsColor }}>{oddsLabel}</span>
          {typeof meta.todayOddsQuotaRemaining === "number" && (
            <span className="text-[var(--text-faint)]">
              · {meta.todayOddsQuotaRemaining} credits left
            </span>
          )}
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

function formatOddsLabel(meta: MetaData): string {
  switch (meta.todayOddsProviderStatus) {
    case "ok_with_props":
      return meta.oddsSource || "the_odds_api";
    case "ok_no_props":
      return "no props returned";
    case "failed":
      return "fetch failed";
    case "demo":
      return "demo";
    case "not_configured":
      return "not configured";
    default:
      return meta.oddsSource || "—";
  }
}

function oddsRowColor(meta: MetaData): string {
  switch (meta.todayOddsProviderStatus) {
    case "ok_with_props":
      return "var(--lime)";
    case "failed":
      return "var(--rose)";
    case "demo":
      return "var(--amber)";
    default:
      return "var(--text)";
  }
}
