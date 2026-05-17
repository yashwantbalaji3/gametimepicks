import Link from "next/link";
import { getLifetimeSummary } from "@/lib/settlement-data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";
import NeonCornerBracket from "@/components/neon-corner-bracket";
import ResultsSportTabs from "@/components/results-sport-tabs";
import ParlayResultsDisclosure from "@/components/parlay-results-disclosure";

export const metadata = {
  title: "Parlay Audit · GameTime Picks",
  description:
    "Parlay candidate-slip audit · pending candidate-slip persistence. Educational analytics only.",
};

/**
 * /results/parlays — placeholder under the cross-sport Results hub for
 * candidate-slip audit. We explicitly refuse to claim any parlay hit
 * rate until exact slips are persisted before first game and graded
 * after settlement. The alternative is inventing slips after the fact.
 */
export default function ResultsParlaysPlaceholderPage() {
  const nbaLifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const nbaHasData = nbaLifetime.totalSettled > 0;
  const mlbHasData = mlbLifetime !== null && mlbLifetime.totalSettled > 0;

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8 sm:py-12">
      <section className="reveal vault-data-orbit neon-corner-bracket gtp-line-scan relative overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-4">
        <NeonCornerBracket />
        <div className="flex items-center gap-2 mb-3">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-warn)",
              boxShadow: "0 0 8px rgba(212, 175, 55, 0.5)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Parlay audit · pending candidate-slip snapshots
          </span>
        </div>
        <h1
          className="vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          Parlay hit rate stays empty until slips persist.
        </h1>
        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "var(--vault-text-mute)" }}
        >
          We refuse to claim any parlay hit rate until exact candidate
          slips are saved before first game and graded after the slate
          settles. The alternative would be reconstructing slips after
          we already know the outcomes — we will not do that.
        </p>
      </section>

      <ResultsSportTabs
        activeSport="parlays"
        nbaHasData={nbaHasData}
        mlbHasData={mlbHasData}
      />

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.55)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            What needs to land first
          </div>
          A nightly snapshot writes each sport&apos;s candidate slips
          (Conservative · Balanced · wider-edge) to
          {" "}
          <span style={{ color: "var(--vault-text)" }}>
            app/public/data/parlays/&lt;sport&gt;/&lt;date&gt;.json
          </span>
          {" "}
          before the first game. After settlement, each leg is graded
          against the verified box score. Only then does the parlay
          audit appear here — broken down by sport, by mode, with every
          leg&apos;s actual stat.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            Multi-sport parlays · later
          </div>
          Multi-sport candidate slips come once both single-sport
          snapshots are flowing. Cross-sport mixes carry lower direct
          correlation but never zero (news cycles, sportsbook line
          shading still affect both). When the audit lands, every slip
          will list every leg honestly.
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/nba/parlays"
          className="vault-glow-hover rounded-[6px] px-4 py-4 text-[13px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
            textDecoration: "none",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-1"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            Open the live NBA Parlay Lab →
          </div>
          Today&apos;s NBA candidate slips. The same builder logic will
          be persisted when snapshots are wired.
        </Link>
        <Link
          href="/mlb/parlays"
          className="vault-glow-hover rounded-[6px] px-4 py-4 text-[13px] leading-relaxed"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
            textDecoration: "none",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-1"
            style={{ color: "var(--vault-success)", fontSize: 10 }}
          >
            MLB Parlays · status →
          </div>
          MLB candidate slips are pending the same snapshot work.
        </Link>
      </section>

      <ParlayResultsDisclosure />

      <footer
        className="mt-12 pt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{
          color: "var(--vault-text-faint)",
          borderTop: "1px solid var(--vault-rule)",
        }}
      >
        candidate slips not yet persisted · educational use only · not betting advice
      </footer>
    </div>
  );
}
