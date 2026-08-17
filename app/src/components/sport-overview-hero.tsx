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
  accent?: "gold" | "nba" | "mlb" | "nhl" | "ipl" | "wc" | "ufc" | "nfl";
  /** Optional sport-identity glyph rendered as an orb beside the headline. */
  icon?: string;
  /** Gradient for the icon orb (from sport-identity). */
  iconGradient?: string;
  /** Accessible name for the icon (from sport-identity ballLabel). */
  iconLabel?: string;
  /** Optional competition/league badge rendered beside the status pill. */
  badge?: React.ReactNode;
  /**
   * COMPACT: one identity row, one row of numbers, one row of actions.
   *
   * The full hero introduces a sport — big glyph, tagline, framing paragraph, three stat CARDS.
   * That is right for a hub a reader is meeting, and wrong for /mlb, where it spent most of the
   * first screen on a page the reader deliberately chose and pushed the board below the fold.
   *
   * This lives HERE rather than as an /mlb-specific hero on purpose: /mlb and /nfl sharing their
   * component owners is what makes their parity real instead of coincidental, and a fork would
   * re-open exactly the divergence that parity work closed. A variant keeps one owner.
   */
  compact?: boolean;
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  gold: "var(--vault-gold-bright)",
  nba: "rgba(120, 175, 255, 1)",
  mlb: "rgba(140, 230, 175, 1)",
  nhl: "rgba(180, 215, 255, 1)",
  ipl: "rgba(255, 195, 130, 1)",
  // Identity-system additions — the two hubs that previously fell back to gold.
  wc: "rgba(52, 211, 153, 1)",
  ufc: "rgba(248, 113, 113, 1)",
  nfl: "rgba(167, 139, 250, 1)",
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
  icon,
  iconGradient,
  iconLabel,
  badge,
  compact = false,
}: Props) {
  const accentColor = ACCENT[accent];
  // Translate accent color into rgba glow values that the cinematic
  // background reads via custom properties.
  const glowAlpha = (alpha: number) => {
    const m = accentColor.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
    );
    if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
    return `rgba(242, 54, 69, ${alpha})`;
  };
  const cssVars = {
    "--accent-glow": glowAlpha(0.18),
    "--accent-glow-secondary": glowAlpha(0.10),
  } as React.CSSProperties;

  if (compact) {
    return (
      <header
        className="rounded-[16px] px-4 py-3.5 flex flex-col gap-3"
        style={{
          border: "1px solid var(--sport-theme-rule)",
          background: "linear-gradient(135deg, var(--sport-theme-wash) 0%, rgba(11,18,14,0.5) 62%)",
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {icon ? <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span> : null}
          <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 21, fontWeight: 800, lineHeight: 1 }}>
            {sport}
          </span>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--sport-theme-ink)", fontSize: 9.5 }}>
            {eyebrow}
          </span>
          <StatusPill kind={statusKind} label={statusLabel} caption={statusCaption} />
          {badge}
          {matchupLine ? (
            <span className="ml-auto font-mono tabular-nums" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {matchupLine}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          {(stats ?? []).map((s) => (
            <span key={s.label} className="flex items-baseline gap-1.5">
              <span className="font-display tabular-nums" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800, lineHeight: 1 }}>{s.value}</span>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>{s.label}</span>
              {s.sub ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>· {s.sub}</span> : null}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(ctas ?? []).map((c) => (
            <Link key={c.href} href={c.href}
              className="gtp-team-row rounded-[8px] px-3 py-1.5 font-mono uppercase tracking-[0.12em] no-underline"
              style={{
                fontSize: 9.5,
                color: c.primary ? "#1A0E06" : "var(--vault-text-mute)",
                background: c.primary ? "var(--gtp-bank-lava-cta)" : "rgba(255,255,255,0.02)",
                border: c.primary ? "1px solid transparent" : "1px solid var(--vault-rule)",
                fontWeight: c.primary ? 700 : 500,
              }}>
              {c.label} →
            </Link>
          ))}
        </div>
      </header>
    );
  }

  return (
    <section
      aria-label={`${sport} hero`}
      className="relative overflow-hidden rounded-[14px] gtp-cinematic-bg-accent gtp-neon-rule"
      style={{
        padding: "26px 22px 28px",
        ...cssVars,
      }}
    >
      <div
        aria-hidden
        className="gtp-hero-halo"
        style={{
          background: `radial-gradient(circle at 92% 0%, ${glowAlpha(
            0.26,
          )}, transparent 45%)`,
        }}
      />
      <div className="relative">
        {/* Eyebrow + status pill row */}
        <div className="flex items-center gap-2 flex-wrap mb-2 gtp-cinematic-rise">
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.20em]"
            style={{ color: accentColor, fontSize: 10 }}
          >
            {eyebrow}
          </span>
          <StatusPill
            kind={statusKind}
            label={statusLabel}
            caption={statusCaption}
          />
          {badge}
        </div>

        {/* Sport headline */}
        <div className="flex items-center gap-3 flex-wrap gtp-cinematic-rise gtp-cinematic-rise-d1">
          {icon ? (
            <span
              className="gtp-sport-orb shrink-0"
              style={{
                width: 44,
                height: 44,
                fontSize: 24,
                ...(iconGradient ? ({ ["--orb-grad"]: iconGradient } as React.CSSProperties) : {}),
              }}
              role="img"
              aria-label={iconLabel ?? "sport"}
            >
              {icon}
            </span>
          ) : null}
          <h1
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(36px, 6.4vw, 62px)",
              lineHeight: 1.0,
              letterSpacing: "-0.022em",
            }}
          >
            {sport}
          </h1>
          {tagline && (
            <span
              className="font-mono uppercase tracking-[0.20em]"
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
            className="mt-3 text-[13px] gtp-cinematic-rise gtp-cinematic-rise-d2"
            style={{ color: "var(--vault-text)" }}
          >
            {matchupLine}
          </p>
        )}

        {/* Scoreboard stats */}
        {stats && stats.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-2.5 gtp-cinematic-rise gtp-cinematic-rise-d2">
            {stats.slice(0, 3).map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className="gtp-stat-tile px-3 py-3 flex flex-col gap-0.5"
              >
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{
                    color: "var(--vault-text-mute)",
                    fontSize: 10,
                  }}
                >
                  {s.label}
                </span>
                <span
                  className="font-display font-semibold gtp-stat-value"
                  style={{
                    color: "var(--vault-text)",
                    fontSize: "clamp(20px, 4.4vw, 26px)",
                    lineHeight: 1.0,
                  }}
                >
                  {s.value}
                </span>
                {s.sub && (
                  <span
                    className="text-[10px] leading-tight font-mono"
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
          <div className="mt-6 flex flex-wrap gap-2 gtp-cinematic-rise gtp-cinematic-rise-d3">
            {ctas.map((c) =>
              c.primary ? (
                <Link
                  key={c.href}
                  href={c.href}
                  className="gtp-btn-primary"
                >
                  {c.label}
                  <span aria-hidden>→</span>
                </Link>
              ) : (
                <Link key={c.href} href={c.href} className="gtp-btn-ghost">
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
            className="mt-6 text-[11px] leading-relaxed max-w-xl gtp-cinematic-rise gtp-cinematic-rise-d4"
            style={{ color: "var(--vault-text-mute)" }}
          >
            {framing}
          </p>
        )}
      </div>
    </section>
  );
}
