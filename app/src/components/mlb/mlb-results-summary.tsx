import type { MlbComparisonReport } from "@/lib/types-mlb-results";

/**
 * MlbResultsSummary — hero hit-rate panel mirroring the NBA Results
 * `Model audit · graded against final box scores` strip. Renders the
 * big hit rate, W/L/P, decisive count, and the partial-audit context.
 */
interface Props {
  report: MlbComparisonReport;
}

function formatPercent(p: number | null): string {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

export default function MlbResultsSummary({ report }: Props) {
  const hit = formatPercent(report.hitRate);
  const partial = report.partial;

  return (
    <section
      className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4 rounded-[8px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(14, 21, 48, 0.55) 0%, rgba(26, 16, 11, 0.62) 100%)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px rgba(242, 54, 69, 0.6)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          MLB model audit · graded against final box scores
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <h1
          className="font-display font-semibold tracking-tightest leading-[0.95]"
          style={{
            color: "var(--vault-gold-bright)",
            fontSize: "clamp(48px, 10vw, 96px)",
            textShadow:
              "0 0 24px rgba(242, 54, 69, 0.45), 0 0 8px rgba(242, 54, 69, 0.55)",
          }}
        >
          {hit}
        </h1>
        <span
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(18px, 2.6vw, 22px)",
          }}
        >
          hit rate · {report.wins}–{report.losses}
          {report.pushes > 0 ? `–${report.pushes}P` : ""} on{" "}
          <span style={{ color: "var(--vault-gold-bright)" }}>
            {report.decisive}
          </span>{" "}
          decisive picks
        </span>
      </div>
      <p
        className="mt-4 text-[14px] leading-relaxed max-w-2xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Every model lean is logged when the board is generated and graded
        against the verified MLB box score after the game is final.{" "}
        <span style={{ color: "var(--vault-text)" }}>
          {report.finalGamesSettled} of {report.scheduledGames}
        </span>{" "}
        games settled for{" "}
        <span style={{ color: "var(--vault-text)" }}>{report.date}</span>.
        Hit rate excludes pushes and No Plays. Educational analytics —
        not betting advice.
      </p>

      {partial && (
        <aside
          className="mt-5 px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(242, 54, 69, 0.30)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0 mt-0.5"
            style={{ color: "var(--vault-warn)" }}
          >
            partial audit
          </span>
          <p
            className="font-mono text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {report.pendingGames} game{report.pendingGames === 1 ? " is" : "s are"}{" "}
            still pending. Hit rate above reflects only the {report.finalGamesSettled}{" "}
            final game{report.finalGamesSettled === 1 ? "" : "s"}. Pending
            games are never silently counted as losses.
          </p>
        </aside>
      )}

      {report.smallSample && (
        <aside
          className="mt-3 px-4 py-3 rounded-[3px] flex items-start gap-3"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid rgba(242, 54, 69, 0.30)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-wider shrink-0 mt-0.5"
            style={{ color: "var(--vault-warn)" }}
          >
            small sample
          </span>
          <p
            className="font-mono text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {report.decisive} decisive picks is below the ~25-pick floor where
            hit rates start to be statistically meaningful. Treat these
            numbers as descriptive, not predictive.
          </p>
        </aside>
      )}
    </section>
  );
}
