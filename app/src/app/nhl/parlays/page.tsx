import Link from "next/link";
import NhlSectionTabs from "@/components/nhl/nhl-section-tabs";

export const metadata = {
  title: "NHL Parlays · GameTime Picks",
  description:
    "NHL parlay candidate slips — pending model board and persisted snapshot pipeline.",
};

export default function NhlParlaysPlaceholderPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NhlSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
        >
          NHL · Parlay Lab · pending model + snapshots
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          NHL candidate slips arrive once the model board does.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          NHL parlay candidates need two things first: a working NHL
          model board with real projections + edges, and a persisted
          candidate-snapshot pipeline so we can claim hit rates
          honestly. Both are pending.
        </p>
      </section>

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
          NHL model board with real projections (shots on goal, points,
          goalie saves), then a snapshot writer that persists each
          day&apos;s candidate slips to{" "}
          <span style={{ color: "var(--vault-text)" }}>
            app/public/data/parlays/nhl/&lt;date&gt;.json
          </span>{" "}
          before first puck drop.
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
          — will extend to NHL once both prerequisites land.
        </div>
      </section>

      <section
        className="mt-8 text-[12px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        <Link href="/nhl" style={{ color: "var(--vault-gold-bright)" }}>
          ← back to NHL overview
        </Link>
      </section>
    </div>
  );
}
