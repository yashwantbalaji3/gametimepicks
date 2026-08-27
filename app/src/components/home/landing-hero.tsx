/**
 * LandingHero — the homepage's first viewport (P213 · Release A). A LAUNCHPAD, not a manifesto:
 * one short headline, the three primary jobs, and one derived live-status row. The badge stack and
 * explanatory paragraph the founder's 2026-08-26 screenshot flagged are GONE from the hero — the
 * beta/deterministic/educational framing lives on /about and /methodology, and the one global
 * educational note is the site-wide strip; repeating them here bought no comprehension and cost
 * the whole first viewport.
 *
 * Purely presentational — every figure arrives as a pre-formatted prop from the page's existing
 * canonical owners. It carries NO money and NO win–loss figure by design (see /results).
 */
import Link from "next/link";

export interface LandingHeroProps {
  /** Count of sim-ready games today (from featuredSimulations). */
  readyCount: number;
  /** Sports with activity on today's slate (the Simulation Hub's primary partition). */
  activeSports: number;
  /** Events across those active sports today (product-day owner sums). */
  eventsToday: number;
  /** Ranked model picks today (null ⇒ omitted, never zero-padded). */
  qualifiedPicks: number | null;
  /** Active signature-product cards right now (0 is an honest state, not a gap). */
  activeProducts: number;
  /** Latest settled slate date (YYYY-MM-DD) — the proof link's anchor. */
  lastSettledDate: string | null;
}

const fmtDay = (d: string) => {
  try {
    return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return d;
  }
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span style={{ color: "var(--vault-text-mute)" }}>
      <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{value}</span> {label}
    </span>
  );
}

export default function LandingHero({ readyCount, activeSports, eventsToday, qualifiedPicks, activeProducts, lastSettledDate }: LandingHeroProps) {
  return (
    <section aria-label="Today's launchpad" className="flex flex-col gap-4">
      <h1
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5.4vw,38px)", fontWeight: 800, lineHeight: 1.05 }}
      >
        Today&rsquo;s games, picks and results.
      </h1>

      {/* The three primary jobs. Labels and destinations are guard-pinned (P208 J1). */}
      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/simulate"
          className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
          style={{
            background: "var(--vault-gold-bright)",
            color: "var(--vault-on-accent-deep)",
            fontSize: 12,
            fontWeight: 700,
            minHeight: 44,
            textDecoration: "none",
          }}
        >
          Simulate Today&rsquo;s Games →
        </Link>
        <Link
          href="/markets"
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
        <Link
          href="/build"
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
          Open Parlay Center
        </Link>
      </div>

      {/* ONE derived live-status row — current owners only, no hand-kept counts. 0 renders as its
          honest words; a missing figure is omitted, never zero-padded. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono" style={{ fontSize: 11.5 }}>
        <Stat value={String(activeSports)} label={activeSports === 1 ? "sport active" : "sports active"} />
        <Stat value={String(eventsToday)} label="events today" />
        {readyCount > 0 ? <Stat value={String(readyCount)} label="simulation-ready" /> : null}
        {qualifiedPicks != null && qualifiedPicks > 0 ? <Stat value={String(qualifiedPicks)} label="top model picks" /> : null}
        <span style={{ color: "var(--vault-text-mute)" }}>
          {activeProducts > 0 ? (
            <>
              <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{activeProducts}</span> active product {activeProducts === 1 ? "card" : "cards"}
            </>
          ) : (
            "no qualified product card today"
          )}
        </span>
        <Link href="/results" className="vault-press" style={{ color: "var(--vault-success)", fontWeight: 700, textDecoration: "none" }}>
          {lastSettledDate ? `Settled through ${fmtDay(lastSettledDate)} →` : "See every settled result →"}
        </Link>
      </div>
    </section>
  );
}
