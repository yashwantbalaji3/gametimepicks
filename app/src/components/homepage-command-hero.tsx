/**
 * HomepageCommandHero — new above-the-fold for `/`.
 *
 * Replaces the previous paragraph-driven hero with a sportsbook-style
 * command panel:
 *
 *   - left column: 1-line tagline + status pill + 1 primary CTA + 1
 *     secondary CTA
 *   - right column: 3 scoreboard tiles (audit hit rate, NBA, MLB)
 *     pulled from already-on-disk settled data
 *
 * Pure layout. Caller passes all numbers; no fetches happen inside.
 */
import Link from "next/link";

import StatusPill, { type StatusPillKind } from "./status-pill";

export interface HeroTile {
  label: string;
  value: string;
  sub?: string;
}

interface Props {
  /** Status pill shown next to the tagline. */
  statusKind: StatusPillKind;
  statusLabel?: string;
  statusCaption?: string;
  /** One-line headline, used as the H1. */
  headline: string;
  /** Optional secondary line under the H1. */
  subline?: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Up to 3 scoreboard tiles in the right column. */
  tiles?: HeroTile[];
}

export default function HomepageCommandHero({
  statusKind,
  statusLabel,
  statusCaption,
  headline,
  subline,
  primaryCta,
  secondaryCta,
  tiles,
}: Props) {
  return (
    <section
      aria-label="GameTime Picks command center"
      className="relative overflow-hidden rounded-[12px] reveal"
      style={{
        background:
          "linear-gradient(155deg, rgba(7, 11, 26, 0.96) 0%, rgba(12, 18, 40, 0.94) 100%)",
        border: "1px solid var(--vault-border)",
        padding: "22px 22px 24px",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 88% -10%, rgba(240, 199, 94, 0.12), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(240, 199, 94, 0.55), transparent)",
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-10 items-start">
        {/* Left — headline + CTAs */}
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 8px rgba(240, 199, 94, 0.65)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              GameTime Picks · command center
            </span>
            <StatusPill
              kind={statusKind}
              label={statusLabel}
              caption={statusCaption}
            />
          </div>

          <h1
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(28px, 5vw, 44px)",
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              maxWidth: 620,
            }}
          >
            {headline}
          </h1>
          {subline && (
            <p
              className="mt-3 text-[13px] leading-relaxed max-w-xl"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {subline}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.14em] rounded-[4px] px-4 py-2.5 transition-all hover:brightness-110 vault-glow-hover"
              style={{
                background: "var(--vault-gold-bright)",
                color: "#06091a",
                fontSize: 11,
                fontWeight: 600,
                boxShadow: "0 0 22px rgba(240, 199, 94, 0.32)",
              }}
            >
              {primaryCta.label}
              <span aria-hidden>→</span>
            </Link>
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.14em] rounded-[4px] px-4 py-2.5 transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--vault-gold)",
                  border: "1px solid rgba(240, 199, 94, 0.30)",
                  fontSize: 11,
                }}
              >
                {secondaryCta.label}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          <p
            className="mt-5 text-[11px] leading-relaxed max-w-xl"
            style={{ color: "var(--vault-text-mute)" }}
          >
            Every projection compared to the sportsbook line. Every
            settled lean graded honestly. Pushes excluded, pending
            excluded. Educational only — not betting advice.
          </p>
        </div>

        {/* Right — scoreboard tiles */}
        {tiles && tiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
            {tiles.slice(0, 3).map((t, i) => (
              <article
                key={`${t.label}-${i}`}
                className="rounded-[6px] px-4 py-3 flex flex-col gap-0.5"
                style={{
                  background: "rgba(7, 11, 26, 0.55)",
                  border: "1px solid var(--vault-border)",
                }}
              >
                <span
                  className="font-mono uppercase tracking-[0.14em]"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 9,
                  }}
                >
                  {t.label}
                </span>
                <span
                  className="font-display font-semibold gtp-scoreboard-number"
                  style={{
                    color: "var(--vault-text)",
                    fontSize: 26,
                    lineHeight: 1,
                  }}
                >
                  {t.value}
                </span>
                {t.sub && (
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: "var(--vault-text-mute)" }}
                  >
                    {t.sub}
                  </span>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
