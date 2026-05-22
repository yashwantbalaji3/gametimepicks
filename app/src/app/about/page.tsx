/**
 * /about — friendly explainer for non-bettors.
 *
 * Six short sections covering what GameTimePicks is, how the model
 * works, how to read a projection, what confidence means, why results
 * matter, and responsible use. Long-form technical detail still lives
 * on /methodology, /responsible-use, and /results/model-audit — this
 * page is the casual entry point.
 */
import Link from "next/link";

import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "About · GameTime Picks",
  description:
    "What GameTimePicks does, how the projection model works, and how to read a projection. Plain-English explainer for non-bettors.",
};

export default function AboutPage() {
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <SectionHeader
        eyebrow="About"
        title="Sports projections made simple."
        sub="A short explainer for anyone visiting the site for the first time — no sports-betting background required."
      />

      <div className="space-y-6 max-w-3xl">
        <Section title="What is GameTimePicks?">
          GameTimePicks is an educational sports analytics project. We
          compare a statistical model's per-game player projections
          against the line the bookmaker is offering, then grade every
          projection after the game so the track record stays honest.
          It's a research lab — not betting advice.
        </Section>

        <Section title="How projections work">
          For each player on tonight's slate, we pull recent game logs
          (last 5 and last 10 games), the season average, and home /
          away context. The model blends those into a per-market
          projection — points, rebounds, assists for NBA, strikeouts
          and hits/total bases for MLB — and compares it to the
          bookmaker line. We never invent inputs; if a player log is
          missing, the projection is suppressed.
        </Section>

        <Section title="How to read a projection">
          <ul className="space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Line</strong> · the
              number the bookmaker is offering Over/Under.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Projection</strong>{" "}
              · the model's estimate for that player tonight.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Gap / edge</strong>{" "}
              · how much higher or lower the projection is vs. the line, in
              percentage points.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text)" }}>Side</strong> · Over
              if the projection is above the line, Under if it's below.
            </li>
          </ul>
        </Section>

        <Section title="What signal strength means">
          Each projection carries one of three labels. They reflect
          historical sample-size + edge confidence, not a guarantee.
          <ul className="mt-3 space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-gold-bright)" }}>
                Stronger signal
              </strong>{" "}
              · clean edge backed by stable recent logs.
            </li>
            <li>
              <strong style={{ color: "var(--vault-warn)" }}>Watch</strong> ·
              edge is real but smaller; treat it as a watch-list entry.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>
                High-variance
              </strong>{" "}
              · the model sees a big gap, but the sample is thin or the
              projection moves a lot game-to-game. We label it so readers
              know to be cautious.
            </li>
          </ul>
        </Section>

        <Section title="Why results matter">
          A track record is the only honest claim a projection site can
          make. We publish every settled projection on the{" "}
          <Link
            href="/results"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            Results
          </Link>{" "}
          page — wins, losses, and pushes — and grade after the final box
          score. Pushes are excluded from the hit-rate denominator;
          pending games never count as losses. The deep-dive technical
          breakdown lives at{" "}
          <Link
            href="/results/model-audit"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            /results/model-audit
          </Link>
          .
        </Section>

        <Section title="Responsible use">
          This is research and analytics, not betting advice. Don't risk
          money you can't afford to lose. If gambling is becoming a
          problem, the resources on the{" "}
          <Link
            href="/responsible-use"
            style={{ color: "var(--vault-gold-bright)", textDecoration: "none" }}
          >
            Responsible Use
          </Link>{" "}
          page can help.
        </Section>

        <Section title="What's coming next">
          <ul className="space-y-1 list-disc pl-5">
            <li>
              Parlay-slip persistence so candidate slips can be graded with
              a real hit rate after games settle.
            </li>
            <li>
              World Cup projection model — the schedule + groups are
              already on disk; the model unlocks before kickoff.
            </li>
            <li>
              Wider market coverage on NBA/MLB game lines (moneyline,
              spreads, totals already shipped for NBA playoff games).
            </li>
          </ul>
        </Section>

        <Section title="Model watchlist (May 22, 2026)">
          Honest read of where the model is performing and where it isn&apos;t,
          based on every settled projection on disk. We update this when the
          numbers shift.
          <ul className="mt-3 space-y-1 list-disc pl-5">
            <li>
              <strong style={{ color: "var(--vault-success)" }}>
                NBA rebounds
              </strong>{" "}
              — the strongest cohort on record. The model has stable
              signal on REB projections.
            </li>
            <li>
              <strong style={{ color: "var(--vault-warn)" }}>
                NBA points + assists
              </strong>{" "}
              — barely above coin flip on a large sample. We surface
              these projections but treat them as watch-list calls, not
              high-confidence reads.
            </li>
            <li>
              <strong style={{ color: "var(--vault-warn)" }}>
                MLB strikeouts
              </strong>{" "}
              — smallest sample of any market we cover and below coin
              flip so far. The variance profile of pitcher hooks +
              manager decisions makes this an honest weak spot.
            </li>
            <li>
              <strong style={{ color: "var(--vault-text-mute)" }}>
                Confidence calibration is being watched
              </strong>{" "}
              — on the current settled MLB sample the model&apos;s
              &quot;Stronger signal&quot; tier isn&apos;t separating
              cleanly from the rest. The next methodology pass will
              tighten that gate before we promote signal-strength as a
              filter on its own.
            </li>
          </ul>
          <p
            className="mt-3 text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Numbers are pulled from{" "}
            <Link
              href="/results"
              style={{
                color: "var(--vault-gold-bright)",
                textDecoration: "none",
              }}
            >
              Results
            </Link>
            . Sample sizes are still small in absolute terms — anything
            you read here is a record, not a forecast. No 80%-accuracy
            claim is made anywhere on the site, and won&apos;t be until
            we run a real out-of-sample backtest.
          </p>
        </Section>
      </div>

      {/* Footer links to the technical surfaces */}
      <section
        className="mt-10 rounded-[6px] px-4 py-4"
        style={{
          background: "rgba(7,11,26,0.45)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono uppercase tracking-[0.14em] mb-2"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Technical surfaces
        </div>
        <ul className="flex flex-wrap gap-3 text-[13px]">
          <li>
            <Link
              href="/methodology"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              How the model works (full methodology) →
            </Link>
          </li>
          <li>
            <Link
              href="/results/model-audit"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              Deep-dive track record →
            </Link>
          </li>
          <li>
            <Link
              href="/responsible-use"
              style={{ color: "var(--vault-text-mute)", textDecoration: "none" }}
            >
              Responsible use →
            </Link>
          </li>
        </ul>
      </section>

      <p
        className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-center"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Educational analytics · not betting advice
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[8px] px-5 py-5"
      style={{
        background: "rgba(7,11,26,0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <h2
        className="font-display tracking-tight mb-3"
        style={{
          color: "var(--vault-gold-bright)",
          fontSize: 20,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h2>
      <div
        className="text-[13.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {children}
      </div>
    </section>
  );
}
