interface Props {
  date: string;
  dayLabel: string;
  reason?: "confirmed_empty" | "provider_failed" | "demo_future";
  /** Internal only — retained on the type for caller compatibility but
   *  never rendered to public users. */
  failureReason?: string | null;
  /** Optional forward pointer to the next slate that has games. Surfaced
   *  as a quiet chip below the body so an off-day or refresh-pending day
   *  doesn't feel like a dead end. */
  nextSlate?: { date: string; dayLabel: string; gameCount: number } | null;
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
  nextSlate,
}: Props) {
  const { headline, body } = copyForReason(date, reason);
  const isFailure = reason === "provider_failed";
  const align = isFailure ? "left" : "center";

  return (
    <div
      className="surface px-6 py-12"
      style={{
        textAlign: align,
        ...(isFailure
          ? { borderLeftWidth: "2px", borderLeftColor: "var(--vault-warn)" }
          : {}),
      }}
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
      <div
        className={`mt-3 max-w-[640px] text-[13px] text-[var(--text-mute)] leading-relaxed ${
          align === "center" ? "mx-auto" : ""
        }`}
      >
        {body}
      </div>
      {nextSlate && nextSlate.gameCount > 0 && (
        <div className={`mt-6 ${align === "center" ? "flex justify-center" : ""}`}>
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[2px] font-mono text-[11px] tracking-tight"
            style={{
              background: "var(--vault-panel)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text-mute)",
            }}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)" }}
            >
              next slate
            </span>
            <span style={{ color: "var(--vault-text)" }}>{nextSlate.dayLabel}</span>
            <span style={{ color: "var(--vault-text-faint)" }}>·</span>
            <span>
              {nextSlate.gameCount} game{nextSlate.gameCount === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      )}
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
