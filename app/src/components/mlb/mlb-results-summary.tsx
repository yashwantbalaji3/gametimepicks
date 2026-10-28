import type { MlbComparisonReport, MlbLifetimeSummary } from "@/lib/types-mlb-results";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";

/**
 * MlbResultsSummary — the hero of /results/mlb (and its legacy alias /mlb/results).
 *
 * Overnight 10-28 (W5): the H1 used to BE the latest slate's hit rate — "51.2%" from one game's 41 leans
 * (2026-10-26, MIL @ TB) — with nothing above it saying it was one day. The page is now named by what it audits,
 * the every-settled-slate figure leads (market, window and n stated), and the latest slate follows, labelled as
 * one slate. The figures themselves are unchanged and come from the same two artifacts.
 */
interface Props {
  report: MlbComparisonReport;
  /** Every settled slate (lifetime_summary.json). Defaults to the shared reader so callers need not change. */
  lifetime?: MlbLifetimeSummary | null;
}

function formatPercent(p: number | null): string {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

export default function MlbResultsSummary({ report, lifetime = getMlbLifetimeSummary() }: Props) {
  const hit = formatPercent(report.hitRate);
  const partial = report.partial;
  const n = (x: number) => x.toLocaleString("en-US");

  return (
    <section
      className="reveal vault-data-orbit relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4 rounded-[8px]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-cocoa) 55%, transparent) 0%, color-mix(in srgb, var(--vault-scrim-base) 62%, transparent) 100%)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          MLB model audit · graded against final box scores
        </span>
      </div>
      <h1
        className="font-display font-semibold tracking-tight m-0"
        style={{ color: "var(--vault-text)", fontSize: "clamp(26px, 4.4vw, 38px)", lineHeight: 1.1 }}
      >
        MLB player-prop leans: how the model did
      </h1>

      {lifetime && lifetime.decisive > 0 ? (
        <div className="mt-4 flex flex-col gap-1" data-mlb-scope="all-settled">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            Every settled slate{lifetime.oldestDate && lifetime.newestDate ? ` · ${lifetime.oldestDate} → ${lifetime.newestDate}` : ""}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span
              className="font-display font-semibold tracking-tightest leading-[0.95]"
              style={{ color: "var(--vault-gold-bright)", fontSize: "clamp(40px, 8vw, 72px)" }}
            >
              {formatPercent(lifetime.hitRate)}
            </span>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(16px, 2.4vw, 20px)" }}>
              hit rate · {n(lifetime.wins)}–{n(lifetime.losses)} on {n(lifetime.decisive)} decided leans over {n(lifetime.totalDates)} slates
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-1" data-mlb-scope="latest-slate">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
          Latest slate only · {report.date}
        </span>
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(16px, 2.4vw, 20px)" }}>
          {hit} hit rate · {report.wins}–{report.losses}
          {report.pushes > 0 ? `–${report.pushes}P` : ""} on {report.decisive} decided leans
        </span>
      </div>
      <p
        className="mt-4 text-[14px] leading-relaxed max-w-2xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Every model lean on a strikeout, hit, total-base or hits + runs + RBIs line is logged when the board is
        generated and graded against the verified MLB box score after the game is final.{" "}
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
            border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
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
            border: "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)",
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
