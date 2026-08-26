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
      className="vault-data-orbit relative overflow-hidden rounded-[6px] px-6 sm:px-10 py-14 sm:py-20"
      style={{
        textAlign: align,
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-base) 85%, transparent) 0%, rgba(14, 10, 7, 0.85) 100%)",
        border: `1px solid ${
          isFailure ? "color-mix(in srgb, var(--vault-danger) 30%, transparent)" : "var(--vault-border)"
        }`,
        ...(isFailure
          ? {
              borderLeftWidth: "2px",
              borderLeftColor: "var(--vault-warn)",
            }
          : {}),
      }}
    >
      <div className="relative">
        <div
          className={`vault-quiet-label mb-4 ${
            align === "center" ? "flex justify-center" : ""
          }`}
          style={{ color: "var(--vault-text-faint)", letterSpacing: "0.06em" }}
        >
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: isFailure
                  ? "var(--vault-warn)"
                  : "var(--vault-text-faint)",
              }}
            />
            {dayLabel}
            {isFailure && (
              <span style={{ color: "var(--vault-warn)" }}>
                · refresh pending
              </span>
            )}
          </span>
        </div>

        <div
          className="vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {headline}
        </div>

        <div
          className={`mt-4 max-w-[640px] text-[14px] leading-relaxed ${
            align === "center" ? "mx-auto" : ""
          }`}
          style={{ color: "var(--vault-text-mute)" }}
        >
          {body}
        </div>

        {nextSlate && nextSlate.gameCount > 0 && (
          <div
            className={`mt-8 ${align === "center" ? "flex justify-center" : ""}`}
          >
            <span
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full font-mono text-[12px] tracking-tight"
              style={{
                background: "var(--vault-panel-elevated)",
                border: "1px solid var(--vault-border-strong)",
                color: "var(--vault-text-mute)",
              }}
            >
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
                style={{ background: "var(--vault-gold-bright)" }}
              />
              <span
                className="uppercase tracking-[0.14em]"
                style={{
                  color: "var(--vault-gold)",
                  fontSize: "10px",
                }}
              >
                Next slate
              </span>
              <span
                style={{ color: "var(--vault-text)", fontWeight: 600 }}
              >
                {nextSlate.dayLabel}
              </span>
              <span style={{ color: "var(--vault-text-faint)" }}>·</span>
              <span>
                {nextSlate.gameCount} game
                {nextSlate.gameCount === 1 ? "" : "s"}
              </span>
            </span>
          </div>
        )}
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
