import Link from "next/link";
import MlbSectionTabs from "@/components/mlb/mlb-section-tabs";

export const metadata = {
  title: "MLB Parlays · GameTime Picks",
  description:
    "MLB candidate parlay slips — pending persisted snapshots. Educational analytics only.",
};

/**
 * /mlb/parlays — placeholder so MLB has the same five-tab structure
 * as NBA (Overview · Model Board · Power Board · Parlays · Results).
 *
 * We intentionally do NOT surface MLB parlay candidates yet because we
 * have not implemented the candidate-slip persistence step. Until
 * exact slips are saved before first pitch and graded after the slate
 * settles, any parlay hit-rate or claim would be invented. See §7 of
 * SESSION_HANDOFF_2026-05-17 for the persistence plan.
 */
export default function MlbParlaysPlaceholderPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <MlbSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          MLB · Parlay Lab · pending snapshots
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          MLB parlays land once candidate slips persist.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          MLB candidate slips will live here once we save the exact
          daily candidates before first pitch and grade them after the
          slate completes. Until then we will not show any parlay
          hit-rate — the alternative is inventing one, which we refuse
          to do.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(26, 16, 11, 0.45)",
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
          A nightly snapshot writes the day&apos;s candidate slips
          (Conservative · Balanced · wider-edge) to
          {" "}
          <span style={{ color: "var(--vault-text)" }}>
            app/public/data/parlays/mlb/&lt;date&gt;.json
          </span>
          {" "}
          before the first game. After settlement, each leg is graded
          against the verified box score. Only then does an MLB parlay
          audit appear here.
        </div>
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(26, 16, 11, 0.45)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text-mute)",
          }}
        >
          <div
            className="font-mono uppercase tracking-[0.14em] mb-2"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            Where to look in the meantime
          </div>
          The current{" "}
          <Link
            href="/nba/parlays"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            NBA Parlay Lab
          </Link>{" "}
          covers candidate slips for the active NBA slate. The same
          builder logic — same-game and anomaly correlations surfaced
          — will extend to MLB once snapshots persist. See the{" "}
          <Link
            href="/mlb/results"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            MLB Results
          </Link>{" "}
          page for the model audit on settled MLB props.
        </div>
      </section>
    </div>
  );
}
