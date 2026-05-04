interface Props {
  date: string;
  dayLabel: string;
  reason?: "no_schedule" | "demo_future" | "unknown";
}

/**
 * NoGamesToday — clean empty state when a date has no scheduled games.
 *
 * Used when:
 *   - The NBA off-season has no games today
 *   - A future demo date wasn't generated (Phase 7B-1 demo behavior)
 *   - The schedule provider returned an empty list
 *
 * Never invents games or fabricates data.
 */
export default function NoGamesToday({ date, dayLabel, reason }: Props) {
  return (
    <div className="surface px-6 py-12 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-3">
        {dayLabel}
      </div>
      <div className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight text-[var(--text)]">
        No NBA games found.
      </div>
      <div className="mt-3 max-w-[480px] mx-auto text-[13px] text-[var(--text-mute)] leading-relaxed">
        {reason === "demo_future" ? (
          <>
            Demo mode only generates the primary date. Future-date previews
            require live mode (set <code className="font-mono text-[12px]">NBA_DATA_MODE=auto</code>{" "}
            and run the pipeline with{" "}
            <code className="font-mono text-[12px]">nba_api</code> reachable).
          </>
        ) : (
          <>
            No NBA games scheduled for {date}. This may be an off-day or the
            schedule source has no listings for this date.
          </>
        )}
      </div>
    </div>
  );
}
