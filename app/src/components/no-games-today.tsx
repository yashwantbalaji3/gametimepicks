interface Props {
  date: string;
  dayLabel: string;
  reason?: "confirmed_empty" | "provider_failed" | "demo_future";
  failureReason?: string | null;
}

/**
 * NoGamesToday — clean empty state. Phase 7B-1.2 distinguishes:
 *   confirmed_empty   — nba_api returned 200 OK with zero games (off-day)
 *   provider_failed   — nba_api errored or unreachable AND no manual override
 *   demo_future       — legacy: kept for back-compat with prior phases
 *
 * Never invents games or fabricates data.
 */
export default function NoGamesToday({
  date,
  dayLabel,
  reason = "confirmed_empty",
  failureReason,
}: Props) {
  const { headline, body } = copyForReason(date, reason, failureReason);
  const isFailure = reason === "provider_failed";

  return (
    <div
      className="surface px-6 py-12 text-center"
      style={
        isFailure
          ? { borderLeftWidth: "2px", borderLeftColor: "var(--rose)", textAlign: "left" }
          : undefined
      }
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-3">
        {dayLabel}
        {isFailure && (
          <span className="ml-3 text-[var(--rose)]">· schedule unavailable</span>
        )}
      </div>
      <div className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight text-[var(--text)]">
        {headline}
      </div>
      <div className="mt-3 max-w-[640px] mx-auto text-[13px] text-[var(--text-mute)] leading-relaxed">
        {body}
      </div>
      {isFailure && failureReason && (
        <div className="mt-4 max-w-[640px] mx-auto font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
          provider error: {failureReason}
        </div>
      )}
    </div>
  );
}

function copyForReason(
  date: string,
  reason: Props["reason"],
  _failureReason?: string | null,
): { headline: string; body: React.ReactNode } {
  switch (reason) {
    case "provider_failed":
      return {
        headline: "Schedule provider unavailable.",
        body: (
          <>
            The pipeline could not confirm whether NBA games are scheduled for{" "}
            {date}. <code className="font-mono text-[12px]">nba_api</code>{" "}
            returned an error or was unreachable, and no manual schedule
            override exists for this date. This is{" "}
            <span className="text-[var(--text)] font-semibold">not</span> the
            same as &ldquo;no games today&rdquo; — we genuinely don&apos;t
            know.{" "}
            <span className="block mt-2">
              To recover: install <code className="font-mono text-[12px]">nba_api</code>{" "}
              and re-run the pipeline, or add a manual schedule entry to{" "}
              <code className="font-mono text-[12px]">
                pipeline/manual_overrides/schedule_overrides.json
              </code>
              .
            </span>
          </>
        ),
      };
    case "demo_future":
      return {
        headline: "No NBA games found.",
        body: (
          <>
            Demo mode only generates the primary date. Future-date previews
            require live mode (set{" "}
            <code className="font-mono text-[12px]">NBA_DATA_MODE=auto</code>{" "}
            and run the pipeline with{" "}
            <code className="font-mono text-[12px]">nba_api</code> reachable).
          </>
        ),
      };
    case "confirmed_empty":
    default:
      return {
        headline: "No NBA games found.",
        body: (
          <>
            The schedule provider confirmed there are no NBA games scheduled
            for {date}. This is an off-day — try the other tabs for upcoming
            dates.
          </>
        ),
      };
  }
}
