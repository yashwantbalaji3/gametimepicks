import Link from "next/link";
import type { ReactNode } from "react";

import NeonCornerBracket from "@/components/neon-corner-bracket";

/**
 * Shared compact Power Board surface.
 *
 * The four sport Power Boards used to be ~120-240 lines each of
 * paragraph copy explaining why HR / goals / sixes / volatility leans
 * are not active yet. This shell collapses every Power Board into one
 * premium card so the page reads as a focused signal-watch list, not
 * a wall of explanation.
 *
 * Caller still owns:
 *   - the section-tabs strip (sport-specific wrapper)
 *   - the page-shell padding
 *   - any sport-specific schedule context above this card
 *
 * The shell renders:
 *   1. compact eyebrow + headline
 *   2. one-sentence description in approved language
 *   3. a single neon "watch" card with planned inputs as chips
 *   4. CTA back to the main projection board
 *   5. tight responsible-use anchor line (no paragraph)
 */
export interface PowerBoardShellProps {
  /** Color accent for the eyebrow + card rim. Defaults to "warn" gold. */
  accent?: "warn" | "danger" | "gold";
  /** Short uppercase eyebrow, e.g. "NHL · Goals + shot-volume watch". */
  eyebrow: string;
  /** One-line headline. Short. */
  headline: ReactNode;
  /** One short sentence using approved language. */
  description: ReactNode;
  /** Title that sits at the top of the watch card. */
  watchTitle: string;
  /** Tiny one-line subtitle inside the watch card. */
  watchSubtitle?: ReactNode;
  /** Chip labels for planned inputs. Each renders as a single chip. */
  inputsPlanned: string[];
  /** Optional one-line "why high-variance is separate" line. */
  whySeparate?: ReactNode;
  /** Optional CTA back to the sport's main projection board. */
  mainBoardHref: string;
  /** Label inside the CTA. */
  mainBoardLabel: string;
}

const ACCENT_COLOR: Record<NonNullable<PowerBoardShellProps["accent"]>, string> = {
  warn: "var(--vault-warn)",
  danger: "var(--vault-danger)",
  gold: "var(--vault-gold-bright)",
};

const ACCENT_GLOW: Record<NonNullable<PowerBoardShellProps["accent"]>, string> = {
  warn: "rgba(52, 211, 153, 0.50)",
  danger: "rgba(244, 63, 94, 0.45)",
  gold: "rgba(52, 211, 153, 0.55)",
};

export default function PowerBoardShell({
  accent = "warn",
  eyebrow,
  headline,
  description,
  watchTitle,
  watchSubtitle,
  inputsPlanned,
  whySeparate,
  mainBoardHref,
  mainBoardLabel,
}: PowerBoardShellProps) {
  const c = ACCENT_COLOR[accent];
  const glow = ACCENT_GLOW[accent];

  return (
    <>
      {/* Hero — compact, eyebrow + one-line headline + one sentence */}
      <section className="reveal vault-data-orbit neon-corner-bracket relative overflow-hidden -mx-4 sm:-mx-8 px-4 sm:px-8 pt-6 pb-5">
        <NeonCornerBracket />
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{ background: c, boxShadow: `0 0 8px ${glow}` }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: c, fontSize: 10 }}
          >
            {eyebrow}
          </span>
        </div>
        <h1
          className="mt-2 vault-display-h2"
          style={{ color: "var(--vault-text)" }}
        >
          {headline}
        </h1>
        <p
          className="mt-2 max-w-2xl text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {description}
        </p>
      </section>

      {/* Single watch card — replaces the old multi-block "warming up"
          paragraphs with one premium signal-watch card. */}
      <section className="mt-6 gtp-aurora-halo">
        <div
          className="gtp-status-board p-5 sm:p-6"
          style={{ borderRadius: 10 }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: c, boxShadow: `0 0 10px ${glow}` }}
            />
            <span
              className="font-mono uppercase tracking-[0.16em]"
              style={{ color: c, fontSize: 10 }}
            >
              high-variance watch · pending
            </span>
          </div>
          <h2
            className="mt-3 font-display font-semibold tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: 20,
              lineHeight: 1.15,
            }}
          >
            {watchTitle}
          </h2>
          {watchSubtitle && (
            <p
              className="mt-1 text-[12px] leading-relaxed"
              style={{ color: "var(--vault-text-mute)" }}
            >
              {watchSubtitle}
            </p>
          )}

          <div className="mt-5">
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              Inputs planned
            </div>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {inputsPlanned.map((it) => (
                <li
                  key={it}
                  className="gtp-source-chip"
                  style={{ color: "var(--vault-text-mute)" }}
                >
                  {it}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={mainBoardHref}
              className="vault-glow-hover inline-flex items-center gap-2 rounded-[3px] font-mono"
              style={{
                padding: "10px 14px",
                border: `1px solid ${c}`,
                background: "rgba(11, 18, 14, 0.55)",
                color: c,
                textDecoration: "none",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {mainBoardLabel} →
            </Link>
            <span
              className="font-mono"
              style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
            >
              No fabricated picks. No volatile leans until the inputs land.
            </span>
          </div>
        </div>
      </section>

      {/* Optional one-line "why" + responsible-use anchor — compact, no
          paragraph block. */}
      <section className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        {whySeparate && (
          <span
            className="text-[12px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {whySeparate}
          </span>
        )}
        <Link
          href="/responsible-use"
          className="font-mono"
          style={{
            color: "var(--vault-gold-bright)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            textDecoration: "none",
          }}
        >
          Responsible Use →
        </Link>
      </section>
    </>
  );
}
