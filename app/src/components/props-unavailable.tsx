interface Props {
  gameCount: number;
}

/**
 * PropsUnavailable — explains that schedule is real but odds/props
 * cannot be fetched because the Odds API key isn't configured.
 *
 * Phase 7B-1 ships in this state until the operator sets ODDS_API_KEY
 * (Phase 7B-2 wires the integration). This banner replaces the prop
 * cards instead of fabricating fake lines.
 */
export default function PropsUnavailable({ gameCount }: Props) {
  return (
    <div
      className="surface px-5 py-5 mt-6 border-l-2"
      style={{ borderLeftColor: "var(--amber)" }}
    >
      <div className="flex items-start gap-3">
        <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--amber)] mt-1 shrink-0">
          props
        </div>
        <div className="flex-1">
          <div className="font-display text-[18px] font-semibold tracking-tight text-[var(--text)]">
            Props unavailable — odds provider not configured
          </div>
          <div className="mt-2 text-[13px] text-[var(--text-mute)] leading-relaxed max-w-[600px]">
            {gameCount} game{gameCount === 1 ? "" : "s"} on the schedule, but
            no sportsbook lines are loaded yet. To see model leans, configure a
            free{" "}
            <a
              href="https://the-odds-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--lime)] hover:underline"
            >
              Odds API key ↗
            </a>
            {" "}and re-run the pipeline. Phase 7B-1 deliberately ships
            without odds — see the methodology page for why.
          </div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
            no fabricated lines · no invented odds · no fake leans
          </div>
        </div>
      </div>
    </div>
  );
}
