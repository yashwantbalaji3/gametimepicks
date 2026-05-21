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
      className="relative overflow-hidden rounded-[14px] gtp-cinematic-bg gtp-neon-rule"
      style={{
        padding: "28px 22px 30px",
      }}
    >
      <div aria-hidden className="gtp-hero-halo" />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-7 lg:gap-12 items-start">
        {/* Left — headline + CTAs */}
        <div className="gtp-cinematic-rise">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
              style={{
                background: "var(--vault-gold-bright)",
                boxShadow: "0 0 8px rgba(240, 199, 94, 0.65)",
              }}
            />
            <span
              className="font-mono uppercase tracking-[0.20em]"
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
            className="font-display tracking-tight gtp-cinematic-rise gtp-cinematic-rise-d1"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(40px, 7vw, 72px)",
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              maxWidth: 720,
              fontWeight: 600,
            }}
          >
            {headline}
          </h1>
          {subline && (
            <p
              className="mt-5 leading-relaxed max-w-xl gtp-cinematic-rise gtp-cinematic-rise-d2"
              style={{
                color: "var(--vault-text-mute)",
                fontSize: "clamp(15px, 1.6vw, 18px)",
              }}
            >
              {subline}
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-2.5 gtp-cinematic-rise gtp-cinematic-rise-d3">
            <Link href={primaryCta.href} className="gtp-btn-primary">
              {primaryCta.label}
              <span aria-hidden>→</span>
            </Link>
            {secondaryCta && (
              <Link href={secondaryCta.href} className="gtp-btn-ghost">
                {secondaryCta.label}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          <p
            className="mt-5 font-mono uppercase tracking-[0.14em] gtp-cinematic-rise gtp-cinematic-rise-d4"
            style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
          >
            Educational analytics · pushes &amp; pending excluded · not betting advice
          </p>
        </div>

        {/* Right — scoreboard tiles */}
        {tiles && tiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 gtp-cinematic-rise gtp-cinematic-rise-d2">
            {tiles.slice(0, 3).map((t, i) => (
              <article
                key={`${t.label}-${i}`}
                className="gtp-stat-tile px-4 py-3.5 flex flex-col gap-1"
              >
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 9,
                  }}
                >
                  {t.label}
                </span>
                <span
                  className={`font-display font-semibold gtp-stat-value ${
                    i === 0 ? "gtp-text-gradient-gold" : ""
                  }`}
                  style={{
                    color: i === 0 ? undefined : "var(--vault-text)",
                    fontSize: i === 0 ? 30 : 26,
                    lineHeight: 1,
                  }}
                >
                  {t.value}
                </span>
                {t.sub && (
                  <span
                    className="text-[10px] leading-tight font-mono"
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
