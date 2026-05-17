import Link from "next/link";
import NbaSectionTabs from "@/components/nba/nba-section-tabs";

export const metadata = {
  title: "NBA Power Board · GameTime Picks",
  description:
    "High-variance NBA player watch — separate from the main projection board because usage spikes, role changes, and lineup volatility deserve their own surface.",
};

/**
 * /nba/power — placeholder/coming-soon surface so NBA has the same
 * five-tab structure as MLB. The page is deliberately honest: no fake
 * picks, no fabricated power ratings. When the volatility model is
 * wired, this is where it lands.
 */
export default function NbaPowerBoardPage() {
  const inputsPlanned = [
    "usage spikes (last-3 vs season)",
    "minutes volatility",
    "injury / news flags",
    "matchup pace",
    "playoff elimination context",
    "rotation changes (rest, foul trouble watch)",
    "recent-form anomaly signal",
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-6">
        <NbaSectionTabs />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          NBA · Power Board · player volatility watch
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          High-variance NBA, kept separate on purpose.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          Usage spikes, role changes, and rotation volatility move NBA
          props more than any single projection model can capture
          honestly. The Power Board will be the place where those
          higher-variance signals show up — rated on a power-profile
          scale rather than the standard High / Medium / Low confidence
          tiers used on the main{" "}
          <Link
            href="/nba/board"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            projection board
          </Link>
          .
        </p>
      </section>

      {/* Pending state — explained honestly. No fake picks. */}
      <section className="mt-8 gtp-aurora-halo">
        <div
          className="gtp-status-board p-5 sm:p-6"
          style={{ borderRadius: 8 }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: "var(--vault-warn)",
                boxShadow: "0 0 10px rgba(212, 175, 55, 0.5)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-warn)", fontSize: 10 }}
            >
              warming up · pending
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 20, lineHeight: 1.15 }}
          >
            NBA Power Board — not active yet
          </h2>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            We refuse to surface volatility picks before the model
            actually ingests these signals. When the inputs below are
            wired, this surface will go live with a power-profile rating
            for each watched player — never a confident lean.
          </p>

          <div className="mt-5">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Power Board inputs · planned
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {inputsPlanned.map((it) => (
                <li
                  key={it}
                  className="gtp-source-chip"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  {it}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Educational framing */}
      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">
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
            style={{ color: "var(--vault-warn)", fontSize: 10 }}
          >
            Why high-variance markets are separate
          </div>
          A single blowout, a rotation change, or a star sitting late
          for rest can swing the result far past any projection. We
          refuse to use confident-sounding language on these markets.
          When the Power Board goes live, ratings will read as power
          profile and watch tier — never as model lean.
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
          The main{" "}
          <Link href="/nba/board" style={{ color: "var(--vault-gold-bright)" }}>
            NBA board
          </Link>{" "}
          covers points, rebounds and assists with full projection
          transparency. The R5 anomaly guardrail already caps
          confidence on the highest-variance edges. See{" "}
          <Link
            href="/responsible-use"
            style={{ color: "var(--vault-gold-bright)" }}
          >
            Responsible Use
          </Link>{" "}
          for the same framing as MLB.
        </div>
      </section>
    </div>
  );
}
