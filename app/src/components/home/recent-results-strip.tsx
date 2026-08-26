import Link from "next/link";

/**
 * RECENT RESULTS — the homepage's proof section (P208 · Release B).
 *
 * The charter's homepage order ends the pitch with evidence: independent records and the latest
 * settled receipts. This strip renders PRE-FORMATTED figures the server page read from the SAME
 * canonical owners /results renders (portfolio record, last settled date) — it computes nothing,
 * so the homepage can never disagree with the record page. Every figure arrives as a prop; a null
 * figure renders nothing rather than a stand-in.
 */
export default function RecentResultsStrip({
  recordLabel, pendingLabel, lastSettledDate,
}: {
  /** e.g. "19–14" — from mr-dub/portfolio.json (the one record owner). Null = omit the figure. */
  recordLabel: string | null;
  /** e.g. "3 pending · 33 settled" — same owner. */
  pendingLabel: string | null;
  /** ISO date of the most recent settled slate, from the optimizer settled index. */
  lastSettledDate: string | null;
}) {
  const settledLabel = lastSettledDate
    ? new Date(`${lastSettledDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  return (
    <section
      aria-labelledby="recent-results-h"
      className="rounded-[14px] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2"
      style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)" }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <h2 id="recent-results-h" className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          Recent results
        </h2>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
          Every card settles from official results only — wins and losses alike.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono" style={{ fontSize: 12.5 }}>
        {recordLabel ? (
          <span style={{ color: "var(--vault-text)" }}>
            Paper record <strong style={{ fontWeight: 700 }}>{recordLabel}</strong>
          </span>
        ) : null}
        {pendingLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{pendingLabel}</span> : null}
        {settledLabel ? <span style={{ color: "var(--vault-text-mute)" }}>Last settled {settledLabel}</span> : null}
      </div>
      <Link
        href="/results"
        className="vault-press ml-auto inline-flex items-center rounded-full px-4 no-underline"
        style={{ minHeight: 44, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12.5, fontWeight: 700 }}
      >
        Open Results →
      </Link>
    </section>
  );
}
