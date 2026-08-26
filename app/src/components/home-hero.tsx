/**
 * HomeHero — the 30-second front door for `/`. A presentational clarity layer that renders ABOVE the
 * existing Today command center: a plain-English hero (what GameTimePicks is), a compact proof strip
 * (record, peak, completed ladders, "graded from official box scores"), and a short "why trust this"
 * row. It receives every money figure as a pre-formatted prop — it NEVER reads data, recomputes, or
 * hardcodes a dollar value, so the canonical bankroll / profit / record stay the single source of truth.
 *
 * Visual style matches the vault system (CSS vars only). Motion is limited to existing reduced-motion-
 * aware utility classes (`vault-press`); the hero itself uses no custom animation and causes no layout
 * shift. Mobile-first: reads cleanly at ~390px with no horizontal scroll and ≥40px tap targets.
 */
import Link from "next/link";

export interface HomeHeroProps {
  /** Pre-formatted current paper bankroll, e.g. "$19,765.40". */
  bankrollLabel: string;
  /** Pre-formatted realized paper profit, e.g. "$19,665". */
  profitLabel: string;
  /** Pre-formatted Bank Builder record, e.g. "15–7". */
  recordLabel: string;
  /** Pre-formatted peak / high-water paper bankroll, e.g. "$20,465". */
  peakLabel: string | null;
  /** Count of officially-completed $100→$10K ladders, or null when unavailable. */
  completedLadders: number | null;
  /** Anchor id (on the page) that the primary CTA scrolls to. */
  picksAnchorId: string;
}

function ProofTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}
    >
      <span
        className="font-display tabular tracking-tight"
        style={{ color: "var(--vault-gold-bright)", fontSize: 18, fontWeight: 800, lineHeight: 1.05 }}
      >
        {value}
      </span>
      <span
        className="font-mono uppercase tracking-[0.08em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
    </div>
  );
}

export default function HomeHero({
  bankrollLabel,
  profitLabel,
  recordLabel,
  peakLabel,
  completedLadders,
  picksAnchorId,
}: HomeHeroProps) {
  return (
    <section aria-label="What GameTimePicks is" className="flex flex-col gap-5">
      {/* HERO — the 30-second takeaway. Plain English, no jargon. */}
      <div
        className="relative overflow-hidden rounded-[16px] px-5 py-6 sm:px-7 sm:py-8 flex flex-col gap-4"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--vault-accent) 10%, transparent) 0%, transparent 55%)," +
            "linear-gradient(135deg, color-mix(in srgb, var(--vault-scrim-pine) 96%, transparent) 0%, var(--vault-bg) 72%)",
        }}
      >
        <span
          className="inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.14em]"
          style={{
            color: "var(--vault-success)",
            background: "var(--vault-success-dim)",
            border: "1px solid color-mix(in srgb, var(--gtp-success-on-dark) 35%, transparent)",
            fontSize: 9.5,
            fontWeight: 700,
          }}
        >
          Paper-only · Free · Educational
        </span>

        <h1
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: "clamp(26px,6.4vw,42px)", fontWeight: 800, lineHeight: 1.04 }}
        >
          A sports model that shows its work.
        </h1>

        <p className="text-[14px]" style={{ color: "var(--vault-text-mute)", maxWidth: 620, lineHeight: 1.5 }}>
          Every pick, every result, and every dollar of one transparent paper run — out in the open, free to
          read, nothing hidden.
        </p>

        {/* The money line — $100 → current paper bankroll, with realized paper profit. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="font-display tabular tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: "clamp(22px,5.4vw,34px)", fontWeight: 800, lineHeight: 1 }}
          >
            $100{" "}
            <span aria-hidden style={{ color: "var(--vault-text-faint)", fontWeight: 600 }}>→</span>{" "}
            <span style={{ color: "var(--vault-gold-bright)" }}>{bankrollLabel}</span>
          </span>
          <span className="font-mono" style={{ color: "var(--vault-success)", fontSize: 13, fontWeight: 700 }}>
            +{profitLabel} paper profit
          </span>
        </div>

        {/* CTAs — primary scrolls to today's picks, secondary audits the public track record. */}
        <div className="flex flex-wrap gap-2.5 pt-0.5">
          <a
            href={`#${picksAnchorId}`}
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
            See today&apos;s picks
          </a>
          <Link
            href="/results"
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
            Audit track record
          </Link>
        </div>
      </div>

      {/* PROOF STRIP — compact, mobile-friendly metric tiles. Every figure is a canonical paper value. */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <ProofTile value={recordLabel} label="Bank Builder record (W–L)" />
          {peakLabel ? <ProofTile value={peakLabel} label="Peak paper bankroll" /> : null}
          {completedLadders && completedLadders > 0 ? (
            <ProofTile value={`${completedLadders}×`} label="$100→$10K ladders completed" />
          ) : null}
          <ProofTile value={bankrollLabel} label="Current paper bankroll" />
        </div>
        <p className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          Every result graded from official box scores — wins and losses both.
        </p>
      </div>

      {/* WHY TRUST THIS — four short, honest reasons. */}
      <div
        className="rounded-[12px] px-4 py-3"
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 40%, transparent)", border: "1px solid var(--vault-rule)" }}
      >
        <span
          className="font-mono uppercase tracking-[0.12em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}
        >
          Why trust this
        </span>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
          {[
            { k: "Paper-only", v: "no real money is ever placed" },
            { k: "Public ledger", v: "every leg of every card is shown" },
            { k: "Official results", v: "graded from box scores, no cherry-picking" },
            { k: "No hidden record", v: "losses stay on the page next to the wins" },
          ].map((r) => (
            <li key={r.k} className="flex items-baseline gap-2" style={{ fontSize: 12.5 }}>
              <span aria-hidden style={{ color: "var(--vault-success)", fontSize: 11 }}>✓</span>
              <span style={{ color: "var(--vault-text-mute)" }}>
                <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{r.k}</span> — {r.v}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
