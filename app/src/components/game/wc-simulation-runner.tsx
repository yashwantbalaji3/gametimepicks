/**
 * WcSimulationRunner — the DIRECT market-implied report for an archived World Cup game (P242).
 *
 * This used to mirror the MLB simulator's gate (idle → revealing → done: a "Generate Simulation
 * Report" CTA, locked module pills, then a 10-second staged pitch animation before the dashboard).
 * The founder retired that ceremony everywhere public: the dashboard is precomputed and already
 * loaded, so it renders immediately under a small matchup hero. These are ARCHIVE pages — the
 * tournament is over — which makes a wait before the report doubly wrong.
 *
 * Deterministic and honest as before: the dashboard is MARKET-IMPLIED (de-vigged prices), there is
 * no run-count claim, and every user sees the same precomputed report.
 */
import FlagBadge from "@/components/flag-badge";

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeCode: string;
  awayCode: string;
  stageLabel?: string | null;
  kickoff?: string | null;
  /** The Game Center + WC report — rendered directly below the matchup hero. */
  postReveal: React.ReactNode;
}

export default function WcSimulationRunner({
  homeTeam,
  awayTeam,
  homeCode,
  awayCode,
  stageLabel,
  kickoff,
  postReveal,
}: Props) {
  const kickoffLabel = (() => {
    if (!kickoff) return null;
    try {
      return new Date(kickoff).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    } catch {
      return null;
    }
  })();

  return (
    <>
      <section aria-label="Match report" className="rounded-[14px] px-4 sm:px-6 py-5 flex flex-col items-center gap-4" style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}>
        <div className="flex items-center justify-center gap-4 sm:gap-8 py-2">
          <span className="flex flex-col items-center gap-1.5">
            <FlagBadge code={homeCode} size="xl" />
            <span className="text-[12px] text-center" style={{ color: "var(--vault-text)", maxWidth: 110 }}>{homeTeam}</span>
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>vs</span>
          <span className="flex flex-col items-center gap-1.5">
            <FlagBadge code={awayCode} size="xl" />
            <span className="text-[12px] text-center" style={{ color: "var(--vault-text)", maxWidth: 110 }}>{awayTeam}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {stageLabel ? (
            <span className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}>{stageLabel}</span>
          ) : null}
          {kickoffLabel ? (
            <span className="font-mono px-2.5 py-1 rounded-full" style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}>Kickoff {kickoffLabel}</span>
          ) : null}
        </div>
        <p className="text-[11px] text-center m-0" style={{ color: "var(--vault-text-faint)", maxWidth: 420 }}>
          A market-implied simulation report from the de-vigged 90-minute prices — paper-only, educational, not
          betting advice. Extra time and penalties do not count.
        </p>
      </section>
      <div className="mt-4">{postReveal}</div>
    </>
  );
}
