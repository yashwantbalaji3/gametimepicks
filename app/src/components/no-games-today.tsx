interface Props {
  date: string;
  dayLabel: string;
  reason?: "confirmed_empty" | "provider_failed" | "demo_future";
  /** Internal only — retained on the type for caller compatibility but
   *  never rendered to public users. */
  failureReason?: string | null;
}

/**
 * NoGamesToday — clean empty state. Three sub-states:
 *   confirmed_empty   — schedule confirmed zero games (true off-day)
 *   provider_failed   — schedule not loaded yet on this refresh
 *   demo_future       — legacy: kept for back-compat with prior phases
 *
 * Never invents games or fabricates data. Never surfaces raw error
 * strings or internal provider names to users.
 */
export default function NoGamesToday({
  date,
  dayLabel,
  reason = "confirmed_empty",
}: Props) {
  const { headline, body } = copyForReason(date, reason);
  const isFailure = reason === "provider_failed";

  return (
    <div
      className="surface px-6 py-12 text-center"
      style={
        isFailure
          ? { borderLeftWidth: "2px", borderLeftColor: "var(--vault-warn)", textAlign: "left" }
          : undefined
      }
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-3">
        {dayLabel}
        {isFailure && (
          <span className="ml-3 text-[var(--vault-warn)]">· refresh pending</span>
        )}
      </div>
      <div className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight text-[var(--text)]">
        {headline}
      </div>
      <div className="mt-3 max-w-[640px] mx-auto text-[13px] text-[var(--text-mute)] leading-relaxed">
        {body}
      </div>
    </div>
  );
}

function copyForReason(
  date: string,
  reason: Props["reason"],
): { headline: string; body: React.ReactNode } {
  switch (reason) {
    case "provider_failed":
      return {
        headline: "Today's slate is refreshing.",
        body: (
          <>
            We don&apos;t have a confirmed schedule for {date} yet — the
            next scheduled refresh will retry. Check back in a few minutes,
            or try the other tabs for upcoming dates.
          </>
        ),
      };
    case "demo_future":
      return {
        headline: "No NBA games found.",
        body: (
          <>
            Demo mode only generates the primary date. Live mode is needed
            to show schedules for future dates.
          </>
        ),
      };
    case "confirmed_empty":
    default:
      return {
        headline: "No NBA games found.",
        body: (
          <>
            There are no NBA games scheduled for {date}. This is an
            off-day — try the other tabs for upcoming dates.
          </>
        ),
      };
  }
}
