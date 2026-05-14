type Reason =
  | "not_configured"
  | "no_props_returned"
  | "provider_failed"
  | "dry_run";

interface Props {
  gameCount: number;
  reason?: Reason;
  /** Internal only — retained on the type for caller compatibility but
   *  never rendered to public users. */
  failureReason?: string | null;
}

/**
 * PropsUnavailable — explains why prop cards are not shown.
 *
 * Four sub-states distinguish the cause without surfacing internal
 * names, error strings, or operator details:
 *   not_configured     — sportsbook lines not yet loaded for the slate
 *   no_props_returned  — slate visible but no NBA player props are listed
 *   provider_failed    — sportsbook lines didn't load on this refresh
 *   dry_run            — line fetching paused for this cycle
 *
 * No reason produces fake odds, fake lines, or invented projections.
 */
export default function PropsUnavailable({
  gameCount,
  reason = "not_configured",
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
      headline: "No player props listed for this slate",
      body: (
        <>
          Sportsbook lines for {games} on this slate don&apos;t include NBA
          player props yet. This is common for early playoff dates and games
          with TBD opponents — sportsbooks usually list player props closer
          to tipoff. Check back closer to game time.
        </>
      ),
    };
  }

  if (reason === "provider_failed") {
    return {
      borderColor: "var(--vault-warn)",
      accentLabel: "props",
      headline: "Sportsbook lines not loaded yet",
      body: (
        <>
          The schedule for {games} is loaded, but sportsbook lines for this
          slate aren&apos;t ready yet. The next scheduled refresh will retry
          automatically.
        </>
      ),
    };
  }

  if (reason === "dry_run") {
    return {
      borderColor: "var(--vault-warn)",
      accentLabel: "props",
      headline: "Lines paused for this refresh cycle",
      body: (
        <>
          {games} on the schedule. Sportsbook line fetching is paused for
          this cycle to conserve free-tier credits. Lines will appear here
          on the next live refresh.
        </>
      ),
    };
  }

  // Default — not_configured
  return {
    borderColor: "var(--vault-warn)",
    accentLabel: "props",
    headline: "Sportsbook lines not loaded yet",
    body: (
      <>
        {games} on the schedule. Model leans will appear here once
        sportsbook lines load on the next refresh.
      </>
    ),
  };
}
