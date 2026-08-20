/**
 * FEATURE TRIAD — the three things this product actually does, on the front door.
 *
 * The hero says what GameTimePicks IS; nothing said what it DOES, so a first-time reader had to
 * infer the feature set from a stack of section headings further down the page. Three blocks, one
 * sentence each, each linking to the surface it describes.
 *
 * CLAIMS ARE DELIBERATELY FLAT. Every modelled MLB market is demoted to market-context, so nothing
 * here promises an advantage over a price. "See where the model and the market disagree" describes
 * a disagreement view truthfully; a phrase implying an advantage would be a claim the calibration
 * record contradicts.
 *
 * The first draft of THIS comment tripped the banned-copy guard by using a forbidden phrase to
 * explain why the phrase is forbidden. The guards scan meaning-free — a comment is shipped source —
 * and that is the correct behaviour, not an over-catch.
 */
import type { ReactElement } from "react";
import Link from "next/link";

import { NoiseTexture } from "@/components/motifs/shared-motifs";

type Feature = {
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
  readonly accent: string;
};

const FEATURES: readonly Feature[] = [
  {
    kind: "Simulate",
    title: "Run the game, not a guess",
    body:
      "Deterministic Monte-Carlo simulations from pregame inputs only. The same game returns the same numbers for every visitor, every time.",
    href: "/simulate",
    cta: "Open the simulator",
    accent: "var(--sport-mlb)",
  },
  {
    kind: "Compare",
    title: "See where the model and the market disagree",
    body:
      "De-vigged implied probabilities beside the model's own, per market. Disagreement is shown as a fact to read, never as a recommendation.",
    href: "/markets",
    cta: "Open market intelligence",
    accent: "var(--vault-accent)",
  },
  {
    kind: "Verify",
    title: "Every result, including the bad ones",
    body:
      "A paper-only record settled from official box scores, with withheld slates disclosed rather than dropped. Nothing here is settled by hand.",
    href: "/results",
    cta: "Open the record",
    accent: "var(--sport-nfl)",
  },
];

export default function FeatureTriad(): ReactElement {
  return (
    <section aria-labelledby="what-it-does" className="relative">
      <h2
        id="what-it-does"
        className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-3"
        style={{ color: "var(--vault-text-mute)" }}
      >
        What this does
      </h2>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {FEATURES.map((f) => (
          <article
            key={f.kind}
            className="relative overflow-hidden rounded-[12px] p-4 flex flex-col gap-2"
            style={{ border: "1px solid var(--vault-border)", background: "var(--vault-panel)" }}
          >
            {/* Texture only — no datum, no motion, nothing implying a computation. */}
            <NoiseTexture opacity={0.03} />
            <div className="relative flex flex-col gap-2">
              <span
                className="font-mono uppercase tracking-[0.12em] text-[11px] font-bold"
                style={{ color: f.accent }}
              >
                {f.kind}
              </span>
              <h3 className="font-display tracking-tight text-[17px] font-bold" style={{ color: "var(--vault-text)", lineHeight: 1.2 }}>
                {f.title}
              </h3>
              <p className="text-[13.5px]" style={{ color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
                {f.body}
              </p>
              <Link
                href={f.href}
                className="text-[12px] font-mono uppercase tracking-[0.1em] underline underline-offset-4 mt-1"
                style={{ color: "var(--vault-text)" }}
              >
                {f.cta} →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
