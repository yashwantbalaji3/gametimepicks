/**
 * HomePathCards — compact "Where do you want to start?" launcher.
 *
 * A row of plain-language entry cards that map the app to the five clear
 * user paths (Straight Bets · Suggested Parlays · Build Your Own · Bank
 * Builder · Results). Pure navigation: server component, just <Link>s, so
 * any status passed in is computed server-side from the SAME honest
 * loaders the rest of the app uses — never fabricated. Uses the gold/vault
 * brand and the Parlay Lab hash deep-links shipped in PR #223.
 */
import Link from "next/link";

export type PathCard = {
  href: string;
  glyph: string;
  title: string;
  blurb: string;
  cta: string;
  /** Optional small honest status (e.g. live slip count, latest settled
   *  date). Omitted/`null` renders nothing — never invent a value. */
  status?: string | null;
};

export default function HomePathCards({ cards }: { cards: PathCard[] }) {
  return (
    <section aria-label="Where do you want to start?" className="flex flex-col gap-2.5">
      <h2
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
      >
        Where do you want to start?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-1.5 rounded-[8px] p-3.5 vault-glow-hover transition-colors"
            style={{
              background: "var(--gtp-card)",
              border: "1px solid var(--vault-border)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span aria-hidden style={{ fontSize: 16, color: "var(--vault-gold-bright)" }}>
                {c.glyph}
              </span>
              {c.status && (
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
                >
                  {c.status}
                </span>
              )}
            </div>
            <span
              className="font-display"
              style={{ color: "var(--vault-text)", fontSize: 14.5, fontWeight: 600, lineHeight: 1.15 }}
            >
              {c.title}
            </span>
            <span
              className="text-[11.5px] leading-snug flex-1"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {c.blurb}
            </span>
            <span
              className="font-mono uppercase tracking-[0.12em] pt-0.5"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              {c.cta}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
