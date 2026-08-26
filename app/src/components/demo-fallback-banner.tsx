import type { DataMode } from "@/lib/types";

interface Props {
  dataMode: DataMode;
  failureReason?: string | null;
}

/**
 * DemoFallbackBanner — high-visibility banner shown above demo content.
 *
 * Phase 7B-1.2: only renders for DemoForced (operator opted into demo
 * explicitly). The auto-fallback-to-demo path is gone — when nba_api
 * fails and there's no manual override, we show ScheduleUnavailable
 * instead of silently substituting demo data.
 */
export default function DemoFallbackBanner({ dataMode, failureReason }: Props) {
  if (dataMode !== "DemoForced") return null;

  return (
    <div
      className="surface mt-2 mb-6 border-l-4 px-5 py-4"
      style={{
        borderLeftColor: "var(--vault-warn)",
        backgroundImage:
          "repeating-linear-gradient(135deg, transparent, transparent 8px, color-mix(in srgb, var(--vault-demo-accent) 4%, transparent) 8px, color-mix(in srgb, var(--vault-demo-accent) 4%, transparent) 9px)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--vault-warn)] px-2 py-1 rounded-[2px] bg-[var(--vault-warn-dim)] shrink-0 mt-0.5">
          demo sample
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[18px] md:text-[20px] font-semibold tracking-tight text-[var(--text)]">
            Demo sample
          </div>
          <div className="mt-2 text-[13px] text-[var(--text-mute)] leading-relaxed">
            The site is showing a representative sample slate instead of
            tonight&apos;s real games. Live data appears here when the
            primary data sources are available.
          </div>
          {failureReason && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              note: {failureReason}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
