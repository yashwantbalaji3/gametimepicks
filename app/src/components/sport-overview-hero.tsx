/**
 * SportOverviewHero — unified hero for `/nba`, `/mlb`, `/nhl`, `/ipl`.
 *
 * Replaces 4 divergent hero blocks. Slots:
 *
 *   - eyebrow text (small mono caption)
 *   - sport label (display headline)
 *   - StatusPill (slate state)
 *   - optional matchup line ("CLE @ NY · 8:00 ET")
 *   - 3 scoreboard stats (label + value + sub)
 *   - primary CTA + secondary CTA
 *   - optional honest framing line
 *
 * Pure layout component — no data fetching. Caller decides which state
 * the page is in (live / lines pending / settled-recap / upcoming).
 */
import Link from "next/link";

import StatusPill, { type StatusPillKind } from "./status-pill";

export interface ScoreboardStat {
  label: string;
  value: string;
  sub?: string;
}

export interface CtaSpec {
  href: string;
  label: string;
  /** When `true`, gets the primary gold-fill treatment. */
  primary?: boolean;
}

interface Props {
  /** Top eyebrow line, e.g. "NBA · model board". */
  eyebrow: string;
  /** Display headline, e.g. "NBA" / "MLB" / "NHL" / "IPL". */
  sport: string;
  /** Subheadline, e.g. "Player-prop projections" / "model board". */
  tagline?: string;
  /** Status pill kind (live / settled / linesPending / etc.). */
  statusKind: StatusPillKind;
  /** Optional override label for the pill. */
  statusLabel?: string;
  /** Optional caption appended inside the pill (e.g. "· 14 games"). */
  statusCaption?: string;
  /** Matchup or slate description, e.g. "Wed May 20 · 1 game on the slate". */
  matchupLine?: string;
  /** Up to 3 scoreboard stats. Skipped slots collapse cleanly. */
  stats?: ScoreboardStat[];
  /** Optional CTAs. First flagged `primary` gets gold treatment. */
  ctas?: CtaSpec[];
  /** Optional bottom-of-hero honest framing line. */
  framing?: string;
  /** Sport accent color (used for eyebrow dot + tagline). */
  accent?: "gold" | "nba" | "mlb" | "nhl" | "ipl";
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  gold: "var(--vault-gold-bright)",
  nba: "rgba(120, 175, 255, 1)",
  mlb: "rgba(140, 230, 175, 1)",
  nhl: "rgba(180, 215, 255, 1)",
  ipl: "rgba(255, 195, 130, 1)",
};

export default function SportOverviewHero({
  eyebrow,
  sport,
  tagline,
  statusKind,
  statusLabel,
  statusCaption,
  matchupLine,
  stats,
  ctas,
  framing,
  accent = "gold",
}: Props) {
  const accentColor = ACCENT[accent];
  return (
    <section
      aria-label={`${sport} hero`}
      className="relative overflow-hidden rounded-[10px] reveal"
      style={{
        background:
          "linear-gradient(155deg, rgba(7, 11, 26, 0.95) 0%, rgba(11, 16, 36, 0.92) 100%)",
        border: "1px solid var(--vault-border)",
        padding: "20px 20px 22px",
      }}
    >
      {/* Soft radial accent glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 92% -10%, ${accentColor}1a, transparent 55%)`,
          opacity: 0.85,
        }}
      />
      {/* Aurora line scan (already gated on prefers-reduced-motion) */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity: 0.45,
        }}
      />
      <div className="relative">
        {/* Eyebrow + status pill row */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: accentColor,
              boxShadow: `0 0 8px ${accentColor}`,
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: accentColor, fontSize: 10 }}
          >
            {eyebrow}
          </span>
          <StatusPill
            kind={statusKind}
            label={statusLabel}
            caption={statusCaption}
          />
        </div>

        {/* Sport headline */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(34px, 6vw, 56px)",
              lineHeight: 1.0,
              letterSpacing: "-0.01em",
            }}
          >
            {sport}
          </h1>
          {tagline && (
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{
                color: "var(--vault-text-mute)",
                fontSize: 11,
              }}
            >
              {tagline}
            </span>
          )}
        </div>

        {/* Matchup line */}
        {matchupLine && (
          <p
            className="mt-3 text-[13px]"
            style={{ color: "var(--vault-text)" }}
          >
            {matchupLine}
          </p>
        )}

        {/* Scoreboard stats */}
        {stats && stats.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            {stats.slice(0, 3).map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className="rounded-[6px] px-3 py-3 flex flex-col gap-0.5"
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
                  {s.label}
                </span>
                <span
                  className="font-display font-semibold gtp-scoreboard-number"
                  style={{
                    color: "var(--vault-text)",
                    fontSize: "clamp(18px, 4vw, 24px)",
                    lineHeight: 1.0,
                  }}
                >
                  {s.value}
                </span>
                {s.sub && (
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: "var(--vault-text-mute)" }}
                  >
                    {s.sub}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA row */}
        {ctas && ctas.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {ctas.map((c) =>
              c.primary ? (
                <Link
                  key={c.href}
                  href={c.href}
                  className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.14em] rounded-[4px] px-4 py-2.5 transition-all hover:brightness-110 vault-glow-hover"
                  style={{
                    background: "var(--vault-gold-bright)",
                    color: "#06091a",
                    fontSize: 11,
                    fontWeight: 600,
                    boxShadow: "0 0 22px rgba(240, 199, 94, 0.32)",
                  }}
                >
                  {c.label}
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <Link
                  key={c.href}
                  href={c.href}
                  className="inline-flex items-center gap-2 font-mono uppercase tracking-[0.14em] rounded-[4px] px-4 py-2.5 transition-colors"
                  style={{
                    background: "transparent",
                    color: "var(--vault-gold)",
                    border: "1px solid rgba(240, 199, 94, 0.30)",
                    fontSize: 11,
                  }}
                >
                  {c.label}
                  <span aria-hidden>→</span>
                </Link>
              ),
            )}
          </div>
        )}

        {/* Honesty framing line */}
        {framing && (
          <p
            className="mt-5 text-[11px] leading-relaxed"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {framing}
          </p>
        )}
      </div>
    </section>
  );
}
