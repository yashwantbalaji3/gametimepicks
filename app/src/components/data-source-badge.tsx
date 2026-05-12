/**
 * DataSourceBadge — public-safe status strip.
 *
 * Public users see only: schedule status, model leans status, updated time,
 * and an "educational analytics only" tag. Internal-only details (provider
 * names, API quotas, fallback toggles, operator override flags) are NEVER
 * rendered to public users.
 *
 * Operator details render only when NEXT_PUBLIC_SHOW_DIAGNOSTICS=true, which
 * must remain unset in production. Production builds tree-shake the operator
 * branch entirely.
 */
import type { MetaData, DataMode } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";

const SHOW_DIAGNOSTICS =
  process.env.NEXT_PUBLIC_SHOW_DIAGNOSTICS === "true";

type ScheduleStatus = "live" | "pending" | "unavailable";
type LeansStatus = "available" | "pending" | "unavailable";
type DisplayEntry = { label: string; color: string };

const SCHEDULE_DISPLAY: Record<ScheduleStatus, DisplayEntry> = {
  live: { label: "live", color: "var(--vault-success)" },
  pending: { label: "pending", color: "var(--vault-warn)" },
  unavailable: { label: "unavailable", color: "var(--rose)" },
};

const LEANS_DISPLAY: Record<LeansStatus, DisplayEntry> = {
  available: { label: "available", color: "var(--vault-gold-bright)" },
  pending: { label: "pending", color: "var(--text-faint)" },
  unavailable: { label: "unavailable", color: "var(--text-faint)" },
};

function scheduleStatusFor(mode: DataMode): ScheduleStatus {
  switch (mode) {
    case "Live":
    case "ScheduleLiveOddsUnavailable":
    case "NoGames":
      return "live";
    case "DemoForced":
      return "pending";
    case "ScheduleUnavailable":
    default:
      return "unavailable";
  }
}

function leansStatusFor(mode: DataMode): LeansStatus {
  switch (mode) {
    case "Live":
      return "available";
    case "ScheduleLiveOddsUnavailable":
    case "DemoForced":
      return "pending";
    case "NoGames":
    case "ScheduleUnavailable":
    default:
      return "unavailable";
  }
}

export default function DataSourceBadge({ meta }: { meta: MetaData }) {
  const mode: DataMode =
    meta.todayDataMode ??
    (meta.dataMode as DataMode) ??
    (meta.isDemo ? "DemoForced" : "Live");

  const schedule = SCHEDULE_DISPLAY[scheduleStatusFor(mode)];
  const leans = LEANS_DISPLAY[leansStatusFor(mode)];

  return (
    <aside className="surface px-4 py-3 font-mono text-[11px] tracking-wide">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <StatusItem label="schedule" value={schedule.label} color={schedule.color} />
        <StatusItem label="model leans" value={leans.label} color={leans.color} />
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-faint)] uppercase">updated</span>
          <span className="text-[var(--text-mute)]">
            {formatTimestamp(meta.lastPipelineRun)}
          </span>
        </div>
        <span className="text-[var(--text-faint)] uppercase">
          educational analytics only
        </span>
      </div>

      {SHOW_DIAGNOSTICS && <OperatorDetails meta={meta} mode={mode} />}
    </aside>
  );
}

function StatusItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--text-faint)] uppercase">{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

/**
 * Operator-only diagnostics. Gated by NEXT_PUBLIC_SHOW_DIAGNOSTICS=true,
 * which must never be set in production. Local dev / Vercel preview only.
 */
function OperatorDetails({
  meta,
  mode,
}: {
  meta: MetaData;
  mode: DataMode;
}) {
  const fallbacks = meta.fallbackSourcesAvailable || {};
  const enabled = Object.entries(fallbacks)
    .filter(([, s]) => s === "enabled")
    .map(([n]) => n);
  const disabled = Object.entries(fallbacks)
    .filter(([, s]) => s === "disabled")
    .map(([n]) => n);

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      <span className="text-[var(--vault-warn)] uppercase">operator only</span>
      <span className="text-[var(--text-faint)]">mode={mode}</span>
      {meta.todayManualOverrideUsed && (
        <span className="text-[var(--text-faint)]">schedule=manual</span>
      )}
      {meta.nbaScheduleSource && (
        <span className="text-[var(--text-faint)]">
          schedule.src={meta.nbaScheduleSource}
        </span>
      )}
      {meta.oddsSource && (
        <span className="text-[var(--text-faint)]">
          odds.src={meta.oddsSource}
        </span>
      )}
      {typeof meta.todayOddsQuotaRemaining === "number" && (
        <span className="text-[var(--text-faint)]">
          credits={meta.todayOddsQuotaRemaining}
        </span>
      )}
      {enabled.length > 0 && (
        <span className="text-[var(--vault-gold-bright)]">
          fb.on=[{enabled.join(",")}]
        </span>
      )}
      {disabled.length > 0 && (
        <span className="text-[var(--text-faint)]">
          fb.off=[{disabled.join(",")}]
        </span>
      )}
    </div>
  );
}
