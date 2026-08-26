/**
 * /market-guide — the one place that defines every term the site uses (model %, market %, edge, EV,
 * confidence, reliability, paper-only, no-play, pending, void, settlement, market-implied, simulation,
 * shadow calibration), grouped by category. Renders straight from the shared glossary lib, so the legend
 * component and this page never drift. Static, honest, paper-only framing.
 */
import Link from "next/link";

import PageHero from "@/components/page-hero";
import { glossaryByCategory } from "@/lib/glossary";

export const metadata = {
  title: "Market Guide · GameTime Picks",
  description:
    "Plain-English definitions for every term on the site — model %, market %, edge, EV, confidence, reliability, paper-only, no-play, pending, settlement, market-implied, and simulation.",
};

export default function MarketGuidePage() {
  const groups = glossaryByCategory();
  return (
    <div className="vault-page-shell px-3 sm:px-6 lg:px-8 py-5 sm:py-10 md:py-14 overflow-x-hidden">
      <PageHero
        eyebrow="Learn"
        title="Market Guide"
        sub="What every number on the site means — in plain English. Everything here is paper-only and educational; nothing is a bet."
      />

      <div className="max-w-3xl mt-6 space-y-8">
        {groups.map((g) => (
          <section key={g.category}>
            <h2
              className="font-mono uppercase tracking-[0.16em] mb-3"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              {g.label}
            </h2>
            <dl className="grid gap-3">
              {g.terms.map((t) => (
                <div
                  key={t.id}
                  className="rounded-[10px] p-4"
                  style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)" }}
                >
                  <dt className="text-[15px] font-semibold mb-1" style={{ color: "var(--vault-gold-bright)" }}>
                    {t.term}
                  </dt>
                  <dd>
                    <p className="text-[13.5px] leading-snug" style={{ color: "var(--vault-text)" }}>{t.short}</p>
                    {t.long && t.long !== t.short && (
                      <p className="text-[12.5px] leading-relaxed mt-1.5" style={{ color: "var(--vault-text-mute)" }}>{t.long}</p>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          GameTime Picks is an educational analytics project. It places no real bets, and the bankroll,
          products, and cards are all paper. See{" "}
          <Link href="/methodology" style={{ color: "var(--vault-text-mute)", textDecoration: "underline" }}>Methodology</Link>{" "}
          for the technical detail and{" "}
          <Link href="/results" style={{ color: "var(--vault-text-mute)", textDecoration: "underline" }}>Results</Link>{" "}
          for the transparent track record.
        </p>
      </div>
    </div>
  );
}
