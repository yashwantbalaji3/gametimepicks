/**
 * FlagshipCards — Section 2 of `/`. Four prop-driven product cards (Simulate, Today's Picks,
 * Bank Builder, Results), each with a live status line sourced upstream in the server page. Purely
 * presentational: it renders the strings/numbers it is handed and NEVER reads data or hardcodes a
 * dollar value / record / step. Mobile-first grid, vault tokens only, ≥44px tap targets.
 */
import Link from "next/link";

export interface FlagshipCard {
  href: string;
  label: string;
  blurb: string;
  /** Short status line (pre-formatted upstream), e.g. "15 model leans" or "official settlement only". */
  status: string;
  /** Optional second, quieter status detail. */
  statusSub?: string | null;
  cta: string;
  /** Accent token for the card's top border. */
  accent: string;
}

function Card({ c }: { c: FlagshipCard }) {
  return (
    <Link
      href={c.href}
      className="vault-glow-hover vault-press flex flex-col gap-2 rounded-[14px] px-4 py-4"
      style={{
        background: "rgba(26,16,11,0.55)",
        border: "1px solid var(--vault-border)",
        borderTop: `2px solid ${c.accent}`,
        textDecoration: "none",
        minHeight: 44,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          {c.label}
        </span>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {c.cta} →
        </span>
      </div>
      <p className="text-[12.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
        {c.blurb}
      </p>
      <div className="mt-auto flex flex-col gap-0.5 pt-1">
        <span className="font-mono tracking-[0.02em]" style={{ color: "var(--vault-gold-bright)", fontSize: 12, fontWeight: 700 }}>
          {c.status}
        </span>
        {c.statusSub ? (
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            {c.statusSub}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function FlagshipCards({ cards }: { cards: FlagshipCard[] }) {
  return (
    <section aria-label="Flagship products" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>
          Four ways in
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          Simulate · Today&rsquo;s Picks · Bank Builder · Results — paper-only
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <Card key={c.href} c={c} />
        ))}
      </div>
    </section>
  );
}
