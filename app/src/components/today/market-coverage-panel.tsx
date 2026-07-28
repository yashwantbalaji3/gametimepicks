/**
 * TodayMarketCoverage — "what can this site actually tell me about today's slate?"
 *
 * The canonical layer already decided, per game and per market family, whether a model read and a
 * sportsbook line may be shown, and recorded a named reason whenever either was withheld. Until now
 * that decision only reached the game report; /today could not say whether a line existed, when the
 * book was captured, or why a market was missing. This renders that answer at the slate level.
 *
 * Presentational only — it renders the `MarketCoverage` the server page derived.
 *
 * HONESTY CONTRACT
 *   - Availability only. Nothing here ranks a market, scores a matchup, or suggests an action.
 *   - No MLB family is validated to out-predict the market, so "model and sportsbook" means BOTH
 *     NUMBERS EXIST — never that one is better. The component reads
 *     `anyFamilyValidatedAgainstMarket` rather than assuming, and states the limitation outright.
 *   - Withheld rows are explained by their named gate, not summarised as an unexplained shortfall.
 *   - A stale or historical snapshot is framed as history, never blanked and never passed off as
 *     the current market.
 */
import Link from "next/link";
import type { MarketCoverage, FamilyCoverage } from "@/lib/today/market-coverage";
import { MODE_LABEL } from "@/lib/today/market-coverage";

const BOOKMAKER_LABEL: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  pointsbetus: "PointsBet",
};

const bookLabel = (b: string | null) => (b ? (BOOKMAKER_LABEL[b] ?? b) : null);

function FamilyRow({ f }: { f: FamilyCoverage }) {
  const shown = f.counts.FULL_COMPARISON + f.counts.MODEL_ONLY + f.counts.SPORTSBOOK_ONLY;
  const pct = f.total > 0 ? Math.round((shown / f.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>
          {f.label}
        </span>
        <span className="font-mono whitespace-nowrap" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          {shown}/{f.total} game{f.total === 1 ? "" : "s"}
        </span>
      </div>
      {/* Coverage bar. Width is a share of the slate, not a quality score. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
        role="img"
        aria-label={`${f.label}: data available for ${shown} of ${f.total} games`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--vault-gold)" }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>
        {(["FULL_COMPARISON", "MODEL_ONLY", "SPORTSBOOK_ONLY", "UNAVAILABLE"] as const)
          .filter((mode) => f.counts[mode] > 0)
          .map((mode) => (
            <span key={mode}>
              {MODE_LABEL[mode]}: <span style={{ color: "var(--vault-text-mute)" }}>{f.counts[mode]}</span>
            </span>
          ))}
      </div>
    </div>
  );
}

export default function TodayMarketCoverage({ coverage }: { coverage: MarketCoverage }) {
  const { snapshot, families, gates, totalGames } = coverage;
  const book = bookLabel(snapshot.bookmaker);

  if (totalGames === 0) return null;

  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, rgba(255,255,255,0.02))" }}
      aria-labelledby="market-coverage-heading"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="market-coverage-heading"
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-gold)" }}
        >
          What we can show today
        </h2>
        <Link
          href="/markets/"
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 9, textDecoration: "none" }}
        >
          Market Center →
        </Link>
      </div>

      {coverage.isEmpty ? (
        <p style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
          No sportsbook lines or model reads are available for the {totalGames} game
          {totalGames === 1 ? "" : "s"} on this slate. Nothing is estimated to fill the gap.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {families.map((f) => (
              <FamilyRow key={f.family} f={f} />
            ))}
          </div>

          {/* Provenance. A snapshot may only claim currency via the canonical reading. */}
          <div
            className="mt-4 flex flex-col gap-1 border-t pt-3 font-mono"
            style={{ borderColor: "var(--vault-border)", fontSize: 9.5, color: "var(--vault-text-faint)" }}
          >
            {snapshot.captureLabel ? (
              <span>
                {snapshot.captureLabel}
                {book ? ` · ${book}` : ""}
              </span>
            ) : (
              <span>Sportsbook capture time unavailable — no freshness claim is made.</span>
            )}
            {!snapshot.isCurrent && snapshot.freshness ? (
              <span style={{ color: "var(--gtp-bank-heat)" }}>
                {snapshot.ageDays && snapshot.ageDays > 0
                  ? `This snapshot is ${snapshot.ageDays} day${snapshot.ageDays === 1 ? "" : "s"} old — shown as history, not as the current market.`
                  : "This snapshot is not current — shown as history, not as the current market."}
              </span>
            ) : null}
          </div>

          {gates.length > 0 ? (
            <details className="mt-3">
              <summary
                className="cursor-pointer font-mono uppercase tracking-[0.1em]"
                style={{ color: "var(--vault-text-mute)", fontSize: 9 }}
              >
                Why some markets are missing ({gates.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5 pl-0" style={{ listStyle: "none" }}>
                {gates.map((g) => (
                  <li key={g.gate} className="flex gap-2" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
                    <span className="font-mono shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                      {g.count}×
                    </span>
                    <span>{g.explanation}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* The limitation is stated on the surface, not buried in a methodology page. */}
          <p className="mt-3" style={{ fontSize: 10, color: "var(--vault-text-faint)", lineHeight: 1.5 }}>
            {coverage.anyFamilyValidatedAgainstMarket
              ? "Coverage describes which numbers are available to read side by side."
              : "This shows which numbers exist, not which one is right. No MLB market here has been shown to out-predict the sportsbook — treat both sides as reference points."}
          </p>
        </>
      )}
    </section>
  );
}
