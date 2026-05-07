type Reason =
  | "not_configured"
  | "no_props_returned"
  | "provider_failed"
  | "dry_run";

interface Props {
  gameCount: number;
  reason?: Reason;
  failureReason?: string | null;
}

/**
 * PropsUnavailable — explains why prop cards are not shown.
 *
 * Phase 7B-2 distinguishes three reasons:
 *   not_configured     — ODDS_API_KEY not set in environment
 *   no_props_returned  — fetch succeeded but the slate has zero player props
 *   provider_failed    — fetch attempt errored (network, auth, rate limit)
 *
 * Phase 7B-3 adds a fourth:
 *   dry_run            — ODDS_DRY_RUN=true; pipeline confirmed slate visible
 *                        to The Odds API (FREE /events call) but skipped
 *                        paid /odds calls to preserve credits.
 *
 * No reason produces fake odds, fake lines, or invented projections.
 */
export default function PropsUnavailable({
  gameCount,
  reason = "not_configured",
  failureReason,
}: Props) {
  const { borderColor, accentLabel, headline, body } = copyForReason(
    reason,
    gameCount,
  );

  return (
    <div
      className="surface px-5 py-5 mt-6 border-l-2"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-start gap-3">
        <div
          className="font-mono text-[9px] uppercase tracking-wider mt-1 shrink-0"
          style={{ color: borderColor }}
        >
          {accentLabel}
        </div>
        <div className="flex-1">
          <div className="font-display text-[18px] font-semibold tracking-tight text-[var(--text)]">
            {headline}
          </div>
          <div className="mt-2 text-[13px] text-[var(--text-mute)] leading-relaxed max-w-[640px]">
            {body}
          </div>
          {failureReason && reason === "provider_failed" && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              provider error: {failureReason}
            </div>
          )}
          {failureReason && reason === "dry_run" && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
              {failureReason}
            </div>
          )}
          <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            no fabricated lines · no invented odds · no fake leans
          </div>
        </div>
      </div>
    </div>
  );
}

function copyForReason(reason: Reason, gameCount: number) {
  const games = `${gameCount} game${gameCount === 1 ? "" : "s"}`;

  if (reason === "no_props_returned") {
    return {
      borderColor: "var(--text-faint)",
      accentLabel: "props",
      headline: "No player props returned for this slate",
      body: (
        <>
          The odds provider returned successfully, but no NBA player props were
          available for {games} on this slate. This is common for early
          playoff dates and games with TBD opponents — sportsbooks list lines
          closer to tipoff. Check back closer to game time.
        </>
      ),
    };
  }

  if (reason === "provider_failed") {
    return {
      borderColor: "var(--rose)",
      accentLabel: "props",
      headline: "Odds source temporarily unavailable",
      body: (
        <>
          The pipeline attempted to fetch player props but the odds source
          didn&apos;t respond. The schedule for {games} is still real and
          loaded; only the props are missing. The next scheduled refresh
          will retry automatically.
        </>
      ),
    };
  }

  if (reason === "dry_run") {
    return {
      borderColor: "var(--vault-warn)",
      accentLabel: "props",
      headline: "Odds fetching paused to preserve credits",
      body: (
        <>
          {games} on the schedule, and the odds source is reachable, but
          per-event odds fetches are paused for this run to conserve free-tier
          credits. Real props will appear when fetching is re-enabled on the
          next refresh cycle.
        </>
      ),
    };
  }

  // Default — not_configured
  return {
    borderColor: "var(--vault-warn)",
    accentLabel: "props",
    headline: "Props unavailable — odds provider not configured",
    body: (
      <>
        {games} on the schedule, but no sportsbook lines are loaded for
        these games yet. Once the odds source is reconnected, model leans
        will appear here automatically.
      </>
    ),
  };
}
