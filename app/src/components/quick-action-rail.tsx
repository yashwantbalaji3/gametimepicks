/**
 * QuickActionRail — 4-card action row used on the homepage and at the
 * bottom of each sport page. Each card is a single CTA the reader is
 * most likely to want next:
 *
 *   - Model Board
 *   - Latest Results
 *   - Model Audit deep-dive
 *   - Parlay Lab
 *
 * Pure layout. Caller passes the cards it wants — defaults to the four
 * above pointing at the canonical hub routes.
 */
import Link from "next/link";

export interface QuickActionCard {
  href: string;
  eyebrow: string; // small mono caption above the title
  title: string; // 2-3 word headline
  sub: string; // ≤ 10-word descriptor
  /** Optional small caption rendered bottom-right, e.g. "1102 picks". */
  caption?: string;
}

interface Props {
  cards?: QuickActionCard[];
  heading?: string;
}

const DEFAULT_CARDS: QuickActionCard[] = [
  {
    href: "/board",
    eyebrow: "Today",
    title: "Model board",
    sub: "Every projection, ranked by edge.",
  },
  {
    href: "/results",
    eyebrow: "Audit",
    title: "Latest results",
    sub: "Every settled lean, graded honestly.",
  },
  {
    href: "/results/model-audit",
    eyebrow: "Model",
    title: "Audit deep-dive",
    sub: "Every cut of the settled record.",
  },
  {
    href: "/parlay-lab",
    eyebrow: "Build",
    title: "Parlay Lab",
    sub: "Lower-correlation educational slips.",
  },
];

export default function QuickActionRail({
  cards = DEFAULT_CARDS,
  heading,
}: Props) {
  return (
    <section aria-label="Quick actions" className="mt-10 reveal">
      {heading && (
        <div className="mb-3 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            {heading}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-[8px] px-4 py-4 flex flex-col gap-2 transition-all hover:-translate-y-0.5 vault-glow-hover"
            style={{
              background:
                "linear-gradient(155deg, rgba(11, 16, 36, 0.92) 0%, rgba(7, 11, 26, 0.88) 100%)",
              border: "1px solid var(--vault-border)",
              minHeight: 120,
            }}
          >
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: "var(--vault-gold)", fontSize: 9 }}
            >
              {c.eyebrow}
            </span>
            <span
              className="font-display tracking-tight"
              style={{
                color: "var(--vault-text)",
                fontSize: 18,
                lineHeight: 1.15,
              }}
            >
              {c.title}
            </span>
            <span
              className="text-[12px] leading-snug"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {c.sub}
            </span>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              {c.caption ? (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{ color: "var(--vault-text-mute)", fontSize: 9 }}
                >
                  {c.caption}
                </span>
              ) : (
                <span />
              )}
              <span
                aria-hidden
                className="font-mono group-hover:translate-x-0.5 transition-transform"
                style={{ color: "var(--vault-gold)", fontSize: 12 }}
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
