/**
 * ReturnHook — a compact, honest "why come back" strip for the landing page. Gives a first-time visitor a reason to
 * return WITHOUT inventing a schedule the workflow doesn't guarantee: it states the real daily loop (new simulations
 * each game day) and the real settlement discipline (graded from official box scores after finals), and points at the
 * recap. Purely presentational, claim-safe (no edge/lock/profit/guarantee language), no fabricated next-slate time.
 *
 * `latestSettledLabel` is an optional pre-formatted date the caller may pass when a settled slate exists; when null
 * the copy degrades honestly to the general loop. It never asserts a specific "next slate at HH:MM" unless a caller
 * passes an artifact-backed value (not wired by default).
 */
import Link from "next/link";

export interface ReturnHookProps {
  /** Pre-formatted latest settled slate date (e.g. "Jul 22"), or null when unknown. */
  latestSettledLabel?: string | null;
}

export default function ReturnHook({ latestSettledLabel = null }: ReturnHookProps) {
  return (
    <section aria-label="Why come back" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] px-4 py-3"
      style={{ border: "1px solid var(--vault-border)", background: "rgba(15,10,7,0.4)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>
        Come back
      </span>
      <span className="text-[12.5px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.4 }}>
        New simulations every game day. Every one is <strong style={{ color: "var(--vault-text)" }}>graded from the
        official box score</strong> after games finish{latestSettledLabel ? <> — latest settled <strong style={{ color: "var(--vault-text)" }}>{latestSettledLabel}</strong></> : null}.
      </span>
      <Link href="/results" className="font-mono uppercase tracking-[0.06em]" style={{ color: "var(--vault-success)", fontSize: 10, textDecoration: "none" }}>
        See the recap →
      </Link>
    </section>
  );
}
