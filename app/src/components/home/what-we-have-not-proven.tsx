/**
 * WhatWeHaveNotProven — the homepage band that leads with the limitation.
 *
 * Sprint 035. The strongest thing this product can say is not that its model works — the repository's
 * own grading ledger says it does not. It is that the product measured itself honestly enough to find
 * that out, and publishes the finding rather than burying it.
 *
 * No sportsbook-owned research arm can run this band; publishing "the market beats our model" is
 * against the house's interest. That is precisely why it is available to take.
 *
 * Every figure here is a COUNT from the committed settled ledger, passed in as a prop by the server
 * page. Nothing is computed in the browser and nothing is estimated. If a count is unavailable the
 * band renders the sentence without it rather than substituting a placeholder number.
 */
import Link from "next/link";

export interface WhatWeHaveNotProvenProps {
  /** Total graded predictions in the settled ledger. */
  gradedCount: number | null;
  /** Distinct slate dates those gradings span. */
  gradedDates: number | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function WhatWeHaveNotProven({ gradedCount, gradedDates }: WhatWeHaveNotProvenProps) {
  return (
    <section
      className="rounded-2xl p-4 sm:p-5"
      style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, var(--vault-wash-faint))" }}
      aria-labelledby="not-proven-heading"
    >
      <h2
        id="not-proven-heading"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-gold)" }}
      >
        What we have not proven
      </h2>

      <p style={{ color: "var(--vault-text)", fontSize: 14.5, lineHeight: 1.55, maxWidth: "62ch" }}>
        {gradedCount != null ? (
          <>
            Across <span style={{ fontWeight: 700 }}>{fmt(gradedCount)} graded predictions</span>
            {gradedDates != null ? <> over {fmt(gradedDates)} days</> : null}, our model has{" "}
            <span style={{ fontWeight: 700 }}>not</span> out-predicted the sportsbook.
          </>
        ) : (
          <>Our model has <span style={{ fontWeight: 700 }}>not</span> been shown to out-predict the sportsbook.</>
        )}{" "}
        On settled results the market price is the better estimate.
      </p>

      <p className="mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55, maxWidth: "62ch" }}>
        We publish every one of those gradings, including the ones that went against us. Where the model
        and the market disagree, we show the disagreement — and what happened next. We do not rank or
        promote anything by the size of that disagreement, because larger disagreements have historically
        settled <em>worse</em>.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/results/model-audit/"
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 9, textDecoration: "none" }}
        >
          See the full record →
        </Link>
        <Link
          href="/learn/"
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 9, textDecoration: "none" }}
        >
          How to read it →
        </Link>
      </div>
    </section>
  );
}
