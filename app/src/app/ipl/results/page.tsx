import Link from "next/link";
import IplSectionTabs from "@/components/ipl/ipl-section-tabs";
import ResultsSportTabs from "@/components/results-sport-tabs";
import { getLifetimeSummary } from "@/lib/settlement-data";
import { getMlbLifetimeSummary } from "@/lib/data-mlb-results";

export const metadata = {
  title: "IPL Results · GameTime Picks",
  description:
    "IPL model audit · pending. No IPL projections have been graded yet because the model board is still warming up.",
};

export default function IplResultsPlaceholderPage() {
  const nbaLifetime = getLifetimeSummary();
  const mlbLifetime = getMlbLifetimeSummary();
  const nbaHasData = nbaLifetime.totalSettled > 0;
  const mlbHasData = mlbLifetime !== null && mlbLifetime.totalSettled > 0;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <div className="mb-4">
        <IplSectionTabs />
      </div>
      <div className="mb-6">
        <ResultsSportTabs
          activeSport="ipl"
          nbaHasData={nbaHasData}
          mlbHasData={mlbHasData}
          nhlHasData={false}
          iplHasData={false}
        />
      </div>

      <section className="reveal">
        <div
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-warn)", fontSize: 11 }}
        >
          IPL model audit · pending first settlement
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          Grades land here after the first IPL slate finals.
        </h1>
        <p
          className="mt-3 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          The IPL model board has to ship first — projections logged at
          generation time and then graded against the verified
          scorecard after each match completes. Today the only IPL
          surface live is the schedule. We will not surface any IPL
          hit rate before the audit is real.
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
          A stable per-batsman + per-bowler stats source (paid options
          are under research), IPL Odds API integration for batter
          runs + bowler wickets, and a settlement job that grades each
          logged lean against the scorecard. Once live, IPL feeds the
          cross-sport overall hit rate just like NBA and MLB do today.
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
          The{" "}
          <Link href="/results" style={{ color: "var(--vault-gold-bright)" }}>
            global Results hub
          </Link>{" "}
          shows the live NBA + MLB cross-sport audit. IPL is
          intentionally excluded from the overall hit rate today —
          including a sport without settled rows would silently inflate
          or deflate the number.
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
