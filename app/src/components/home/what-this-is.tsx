/**
 * WhatThisIs — Section 1b of the landing page. An honest, presentational three-way separation of what GameTime Picks
 * IS (live simulations + graded results), what it is BUILDING (a gated research model), and what it does NOT claim
 * (no "locks", no market-beating). This is the trust-first framing that answers a skeptical first-time visitor's
 * question — "what are you actually claiming?" — before they go anywhere else.
 *
 * Purely presentational: no data, no figures, no clock. Vault tokens only. Every word must stay claim-safe — no
 * edge / lock / beat-the-market / guaranteed / profitable language (guarded by public-language tests).
 */
import Link from "next/link";

interface Lane {
  key: string;
  kicker: string;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
  accent: string; // border/kicker color
}

const LANES: Lane[] = [
  {
    key: "live",
    kicker: "Live now · use it today",
    title: "Simulations & results",
    body:
      "Run a deterministic simulation for tonight's games and follow every result, graded from official box scores. Same output for every user.",
    href: "/simulate",
    hrefLabel: "Simulate tonight →",
    accent: "var(--vault-success)",
  },
  {
    key: "building",
    kicker: "Building · gated, not ready",
    title: "Research model",
    body:
      "We're building a predictive model on a leakage-safe dataset, evaluated against the market first. It stays internal until it earns its place — follow the progress.",
    href: "/research",
    hrefLabel: "See research progress →",
    accent: "var(--vault-gold-bright)",
  },
  {
    key: "not-claimed",
    kicker: "What we don't claim",
    title: "No locks. No hype.",
    body:
      "We don't sell “locks” or claim to out-predict the market. A model is only called predictive after it out-predicts the market out-of-sample — never before.",
    href: "/learn",
    hrefLabel: "How it works →",
    accent: "var(--vault-text-faint)",
  },
];

export default function WhatThisIs() {
  return (
    <section aria-label="What GameTime Picks is, is building, and does not claim" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {LANES.map((l) => (
          <div
            key={l.key}
            className="flex flex-col gap-2 rounded-[12px] px-4 py-3.5"
            style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)" }}
          >
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: l.accent, fontSize: 9 }}>
              {l.kicker}
            </span>
            <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>
              {l.title}
            </h3>
            <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.5 }}>
              {l.body}
            </p>
            {l.href && l.hrefLabel ? (
              <Link href={l.href} className="mt-auto pt-1 font-mono uppercase tracking-[0.06em]" style={{ color: l.accent, fontSize: 10, textDecoration: "none" }}>
                {l.hrefLabel}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
