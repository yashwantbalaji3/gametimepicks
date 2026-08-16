/**
 * LandingHero — Section 1 of the `/` landing page. A simulation-first front door: a plain headline, a
 * short paper-only/educational + deterministic explainer, and two CTAs (Simulate → /simulate, Today →
 * /today). Purely presentational — it receives every figure as a pre-formatted prop and NEVER reads
 * data, recomputes, or hardcodes a dollar value / record. Mobile-first (~390px, ≥44px tap targets),
 * vault design tokens only, no custom animation beyond the reduced-motion-aware utilities.
 *
 * It carries NO money and NO win–loss figure by design. A paper bankroll beside a paper record on the
 * front door reads as a return, and the measured comparison directly above this hero says the market
 * is the better estimate. Those figures belong on /results, next to the cards that produced them.
 */
import Link from "next/link";

export interface LandingHeroProps {
  /** Count of sim-ready games today (from featuredSimulations.readyCount). */
  readyCount: number;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.14em]"
      style={{
        color: "var(--vault-success)",
        background: "var(--vault-success-dim)",
        border: "1px solid rgba(110,231,168,0.35)",
        fontSize: 9.5,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

export default function LandingHero({ readyCount }: LandingHeroProps) {
  return (
    <section aria-label="What GameTime Picks is" className="flex flex-col gap-5">
      <div
        className="relative overflow-hidden rounded-[16px] px-5 py-6 sm:px-8 sm:py-9 flex flex-col gap-4"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 140% at 0% 0%, rgba(52, 211, 153, 0.10) 0%, transparent 55%)," +
            "linear-gradient(135deg, rgba(13, 21, 17,0.96) 0%, var(--vault-bg) 72%)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Public Beta · simulation-powered analytics</Chip>
          <Chip>Paper-only · Free · Educational</Chip>
          <Chip>Deterministic · same output for every user</Chip>
        </div>

        <h1
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: "clamp(26px,6.2vw,44px)", fontWeight: 800, lineHeight: 1.04, maxWidth: 720 }}
        >
          Simulate today&rsquo;s games. Review model picks. Track every result.
        </h1>

        <p className="text-[14px]" style={{ color: "var(--vault-text-mute)", maxWidth: 640, lineHeight: 1.5 }}>
          GameTime Picks is a simulation-first, paper-only sports model. Run deterministic game
          simulations, review today&rsquo;s model slate, and follow results with transparent receipts.
        </p>

        {/* CTAs — primary opens the simulation lobby, secondary opens today's picks. */}
        <div className="flex flex-wrap gap-2.5 pt-0.5">
          <Link
            href="/simulate"
            className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
            style={{
              background: "var(--vault-gold-bright)",
              color: "#1A0E06",
              fontSize: 12,
              fontWeight: 700,
              minHeight: 44,
              textDecoration: "none",
            }}
          >
            Simulate Today&rsquo;s Games →
          </Link>
          <Link
            href="/today"
            className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
            style={{
              border: "1px solid var(--vault-border-strong)",
              color: "var(--vault-text)",
              fontSize: 12,
              fontWeight: 700,
              minHeight: 44,
              textDecoration: "none",
            }}
          >
            See Today&rsquo;s Picks
          </Link>
        </div>

        {/* One factual availability line. No money, no win–loss figure — see the file header. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 font-mono" style={{ fontSize: 11.5 }}>
          {readyCount > 0 ? (
            <span style={{ color: "var(--vault-text-mute)" }}>
              <span style={{ color: "var(--vault-gold-bright)", fontWeight: 700 }}>{readyCount}</span> games simulation-ready today
            </span>
          ) : null}
          <span style={{ color: "var(--vault-text-faint)" }}>graded from official results only</span>
        </div>
      </div>
    </section>
  );
}
