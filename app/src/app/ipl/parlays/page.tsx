import Link from "next/link";
import IplSectionTabs from "@/components/ipl/ipl-section-tabs";

export const metadata = {
  title: "IPL Parlays · GameTime Picks",
  description:
    "IPL parlay candidate slips — pending model board and persisted snapshot pipeline.",
};

export default function IplParlaysPlaceholderPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <IplSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          IPL · Parlay Lab · pending model + snapshots
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          IPL candidate slips arrive once the model board does.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          IPL parlay candidates need two things first: a working IPL
          model board with real projections + edges, and a persisted
          candidate-snapshot pipeline so we can claim hit rates
          honestly. Both are pending.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-[6px] px-4 py-4 text-[12px] leading-relaxed"
          style={{
            background: "rgba(26, 16, 11, 0.55)",
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
          IPL model board with real projections (batter runs, bowler
          wickets, fours), then a snapshot writer that persists each
          day&apos;s candidate slips to{" "}
          <span style={{ color: "var(--vault-text)" }}>
            app/public/data/parlays/ipl/&lt;date&gt;.json
          </span>{" "}
          before the toss.
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
            href="/picks"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            NBA Parlay Lab
          </Link>{" "}
          covers candidate slips for the active NBA slate. The same
          builder logic will extend to IPL once both prerequisites
          land.
        </div>
      </section>

      <section
        className="mt-8 text-[12px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <Link href="/ipl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to IPL overview
        </Link>
      </section>
    </div>
  );
}
