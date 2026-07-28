/**
 * PreSportsbookStrip — the homepage answer to "what should I know before I open a sportsbook?"
 *
 * The homepage was a navigation surface: it told a visitor what products exist, not what is known
 * about today. This is the smallest honest step toward an intelligence dashboard — a compact,
 * factual read of what data exists for today's slate and when the book was captured, with a path
 * into the full picture.
 *
 * Presentational only; renders the same `MarketCoverage` object /today uses, so the two surfaces
 * cannot drift. One derivation, two renderings.
 *
 * HONESTY CONTRACT — identical to the /today panel:
 *   - Counts and capture provenance only. No pick, no ranking, no suggested action.
 *   - "Both sides available" means both NUMBERS EXIST. No MLB market has been shown to out-predict
 *     the sportsbook, and this must never imply otherwise.
 *   - A non-current snapshot is labelled as history rather than presented as the live market.
 */
import Link from "next/link";
import type { MarketCoverage } from "@/lib/today/market-coverage";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono font-semibold" style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.1 }}>
        {value}
      </span>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
        {label}
      </span>
    </div>
  );
}

export default function PreSportsbookStrip({
  coverage,
  dateLabel,
}: {
  coverage: MarketCoverage;
  dateLabel: string;
}) {
  if (coverage.totalGames === 0) return null;

  const moneyline = coverage.families.find((f) => f.family === "moneyline");
  const bothSides = moneyline?.bothSides ?? 0;

  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, rgba(255,255,255,0.02))" }}
      aria-labelledby="pre-sportsbook-heading"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="pre-sportsbook-heading"
          className="font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-gold)" }}
        >
          Before you open a sportsbook
        </h2>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          {dateLabel}
        </span>
      </div>

      {coverage.isEmpty ? (
        <p style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
          No sportsbook lines or model reads are available for today&apos;s {coverage.totalGames} game
          {coverage.totalGames === 1 ? "" : "s"} yet. Nothing is estimated to fill the gap.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <Stat value={String(coverage.totalGames)} label="Games today" />
            <Stat value={String(bothSides)} label="Model + book" />
            <Stat
              value={String(coverage.gamesWithIntelligence)}
              label="With market data"
            />
          </div>

          <p className="mt-3" style={{ fontSize: 11, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
            {coverage.snapshot.captureLabel ?? "Sportsbook capture time unavailable — no freshness claim is made."}
            {!coverage.snapshot.isCurrent && coverage.snapshot.freshness ? (
              <span style={{ color: "var(--gtp-bank-heat)" }}>
                {" "}
                Shown as history, not as the current market.
              </span>
            ) : null}
          </p>

          <p className="mt-2" style={{ fontSize: 10, color: "var(--vault-text-faint)", lineHeight: 1.5 }}>
            {coverage.anyFamilyValidatedAgainstMarket
              ? "These are the numbers available to read side by side."
              : "These are the numbers that exist — not a claim about which is right. No MLB market here has been shown to out-predict the sportsbook."}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/today/"
              className="font-mono uppercase tracking-[0.1em]"
              style={{ color: "var(--vault-gold-bright)", fontSize: 9, textDecoration: "none" }}
            >
              Today&apos;s full picture →
            </Link>
            <Link
              href="/markets/"
              className="font-mono uppercase tracking-[0.1em]"
              style={{ color: "var(--vault-gold-bright)", fontSize: 9, textDecoration: "none" }}
            >
              Market Center →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
