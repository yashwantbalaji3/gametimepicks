/**
 * SportsbookStatusBoard — homepage / board hero side panel that composes
 * already-available slate data into an LED-style status board.
 *
 * No fabrication: all numbers come from props the caller already has in
 * scope. If there is no live slate (off-day / refresh-pending), the
 * caller passes `mode="idle"` and the board renders an honest waiting
 * state instead.
 *
 * Two visual variants:
 *   - "primary"  — full panel, used on the homepage hero
 *   - "compact"  — flat strip, used on the board page status rail
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { getPlayoffContext } from "./playoff-context";

export interface StatusBoardGame {
  gameId: string;
  awayTeamAbbr: string;
  homeTeamAbbr: string;
  tipoff: string;
}

export interface StatusBoardStat {
  label: string;
  value: string;
  accent?: "gold" | "warn" | "success" | "mute" | "default";
}

interface Props {
  /** Top eyebrow text (e.g. "MAY 15 SLATE · LIVE"). */
  eyebrow: string;
  /** Headline (e.g. "Friday, May 15 · 2 NBA games"). */
  headline: string;
  /** Optional sub-line under the headline. */
  sub?: string;
  /** Game rows. May be empty (use mode="idle"). */
  games?: StatusBoardGame[];
  /** Right-side stat cells. Always rendered if provided. */
  stats?: StatusBoardStat[];
  /** Footer note (e.g. "Guardrails active · educational only"). */
  footnote?: ReactNode;
  /** Primary CTA. */
  ctaHref?: string;
  ctaLabel?: string;
  /** When true, renders the dot in the eyebrow as steady gold instead of pulsing. */
  steady?: boolean;
  /** Display mode. */
  mode?: "primary" | "compact";
}

const ACCENT: Record<NonNullable<StatusBoardStat["accent"]>, string> = {
  gold: "var(--vault-gold-bright)",
  warn: "var(--vault-warn)",
  success: "var(--vault-success)",
  mute: "var(--vault-text-mute)",
  default: "var(--vault-text)",
};

export default function SportsbookStatusBoard({
  eyebrow,
  headline,
  sub,
  games,
  stats,
  footnote,
  ctaHref,
  ctaLabel,
  steady,
  mode = "primary",
}: Props) {
  const isCompact = mode === "compact";
  // Casino UI: primary variant gets an aurora halo wrapper that breathes
  // gold → cyan → magenta around the panel. Compact stays calm so it
  // never competes with the live board grid below.
  const panel = (
    <aside
      className={`gtp-status-board ${isCompact ? "p-4" : "p-5 sm:p-6"}`}
      aria-label="Slate status board"
    >
      {/* Eyebrow */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-block w-2 h-2 rounded-full ${steady ? "" : "gtp-neon-pulse"}`}
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 10px rgba(52, 211, 153, 0.7)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.16em]"
            style={{
              color: "var(--vault-gold-bright)",
              fontSize: 10,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <span
          className="font-mono"
          style={{
            color: "var(--vault-text-faint)",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          model lab
        </span>
      </div>

      {/* Headline */}
      <h3
        className={`mt-3 font-display font-semibold tracking-tight ${
          isCompact ? "text-[16px]" : "text-[20px] sm:text-[22px]"
        }`}
        style={{ color: "var(--vault-text)", lineHeight: 1.15 }}
      >
        {headline}
      </h3>
      {sub && (
        <p
          className="mt-1 text-[12px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {sub}
        </p>
      )}

      {/* Body grid: games column + stat cells column on desktop; stacked
          on mobile / compact. */}
      <div
        className={`mt-4 grid gap-3 ${
          isCompact
            ? "grid-cols-1 sm:grid-cols-4"
            : "grid-cols-1 lg:grid-cols-[1fr_minmax(160px,200px)]"
        }`}
      >
        {/* Games column */}
        {games && games.length > 0 && (
          <div className="space-y-2">
            {games.map((g) => {
              const ctx = getPlayoffContext(
                g.gameId,
                g.awayTeamAbbr,
                g.homeTeamAbbr,
              );
              return (
                <div key={g.gameId} className="gtp-led-row flex-col items-start gap-1">
                  {ctx.isPlayoffs && (
                    <span className="gtp-round-eyebrow">
                      <span className="gtp-round-eyebrow-dot" aria-hidden />
                      {ctx.roundLabel} · {ctx.gameLabel}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span
                      style={{ color: "var(--vault-text)", fontSize: 13 }}
                    >
                      <span style={{ color: "var(--vault-text-mute)" }}>
                        {g.awayTeamAbbr}
                      </span>
                      <span
                        className="mx-2"
                        style={{ color: "var(--vault-text-faint)" }}
                      >
                        @
                      </span>
                      <span style={{ color: "var(--vault-text)" }}>
                        {g.homeTeamAbbr}
                      </span>
                    </span>
                    <span
                      style={{
                        color: "var(--vault-gold-bright)",
                        fontSize: 11,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {g.tipoff}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats cells column */}
        {stats && stats.length > 0 && (
          <div
            className={`${
              isCompact
                ? "grid grid-cols-2 sm:grid-cols-1 gap-2 sm:contents"
                : "grid grid-cols-2 lg:grid-cols-1 gap-2"
            }`}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="gtp-led-row"
                style={{ paddingTop: 12, paddingBottom: 12 }}
              >
                <span
                  style={{
                    color: "var(--vault-text-faint)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    color: ACCENT[s.accent ?? "default"],
                    fontSize: 17,
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer row */}
      {(footnote || ctaHref) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {footnote && (
            <div
              className="font-mono"
              style={{
                color: "var(--vault-text-faint)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              {footnote}
            </div>
          )}
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-1.5 transition-colors"
              style={{
                color: "var(--vault-gold-bright)",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
            >
              {ctaLabel}
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      )}
    </aside>
  );
  return isCompact ? panel : <div className="gtp-aurora-halo">{panel}</div>;
}
