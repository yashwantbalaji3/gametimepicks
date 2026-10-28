import Link from "next/link";

import { SETTLED_LABELS, shortDay } from "@/lib/results/settled-through.mjs";

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
  recordLabel, scopeLabel, pendingLabel, settledThrough,
}: {
  /** e.g. "28–38" — from the one Results reader (lib/results/current-record.ts). Null = omit the figure. */
  recordLabel: string | null;
  /** P0 U2 · what the figure measures, e.g. "Current era" — printed beside it so it is never read as all-time. */
  scopeLabel?: string | null;
  /** e.g. "0 pending · 66 settled" — same owner, same scope. */
  pendingLabel: string | null;
  /** P0 U1 · the paper ledger's "results settled through" day (lib/results/settled-through.mjs) — the record beside
   *  it is that ledger's, so the date is too (it printed the site-wide newest date as "Last settled"). */
  settledThrough: string | null;
}) {
  const settledLabel = shortDay(settledThrough);
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
            Paper record{scopeLabel ? ` · Bank Builder ${scopeLabel.charAt(0).toLowerCase()}${scopeLabel.slice(1)}` : ""} <strong style={{ fontWeight: 700 }}>{recordLabel}</strong>
          </span>
        ) : null}
        {pendingLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{pendingLabel}</span> : null}
        {settledLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{SETTLED_LABELS.ledger} {settledLabel}</span> : null}
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
