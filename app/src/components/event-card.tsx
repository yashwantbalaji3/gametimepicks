/**
 * EventCard — the shared "one game" tile.
 *
 * Program 177 · Release A. `/mlb` had a slate tile and `/nfl` had two hand-rolled `<article>`
 * blocks that drifted apart from it and from each other (different padding, different logo
 * placement, different kickoff treatment). This is the single owner: one card shape, one team
 * row, one kickoff line, one optional CTA.
 *
 * Deliberately layout-only and sport-agnostic — it fetches nothing and decides nothing. The
 * caller formats the kickoff (each hub owns its own clock rules), supplies the state badge, and
 * drops whatever stat block belongs on that surface into `children`. That keeps the honest-state
 * logic where it belongs and stops the card from becoming a second place where a sport's rules
 * are half-implemented.
 *
 * The CTA is an explicit bottom link rather than a whole-card anchor: `children` carries tables
 * and definition lists on some surfaces, and wrapping those in an anchor produces interactive
 * content inside a link, which is both invalid and hostile to screen readers.
 */
import Link from "next/link";

import TeamLogo from "./team-logo";

export interface EventCardTeam {
  abbr: string;
  /** Full name, used for the logo's accessible label. */
  name?: string;
  /** Optional number rendered beside the team (projected or final score). */
  score?: number | null;
}

interface Props {
  sport: "nfl" | "mlb" | "nba" | "nhl";
  away: EventCardTeam;
  home: EventCardTeam;
  /** Already-formatted kickoff string — the caller owns the clock. */
  kickoffLabel: string;
  /** Small uppercase caption above the team row, e.g. "preseason · week 1". */
  eyebrow?: string;
  /** State chip rendered at the right of the eyebrow row, e.g. STARTED. */
  badge?: React.ReactNode;
  /** Secondary line under the kickoff, e.g. the venue. */
  meta?: string;
  /** What the score numbers are, when scores are shown, e.g. "projected". */
  scoreCaption?: string;
  href?: string;
  hrefLabel?: string;
  children?: React.ReactNode;
  /** Small explanatory line at the bottom of the card. */
  footnote?: string;
}

export default function EventCard({
  sport,
  away,
  home,
  kickoffLabel,
  eyebrow,
  badge,
  meta,
  scoreCaption,
  href,
  hrefLabel = "Open →",
  children,
  footnote,
}: Props) {
  const showScores = typeof away.score === "number" || typeof home.score === "number";
  const side = (t: EventCardTeam) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <TeamLogo team={t.abbr} sport={sport} size="sm" ariaLabel={`${t.name ?? t.abbr} logo`} />
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.abbr}</span>
      {typeof t.score === "number" ? (
        <span className="font-mono" style={{ fontSize: 15, fontWeight: 700 }}>{t.score}</span>
      ) : null}
    </span>
  );

  return (
    <article
      className="vault-glow-hover"
      style={{
        border: "1px solid var(--vault-border)",
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {eyebrow || badge ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          {eyebrow ? (
            <span style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
              {eyebrow}
            </span>
          ) : <span />}
          {badge}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {side(away)}
        <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>at</span>
        {side(home)}
        {showScores && scoreCaption ? (
          <span style={{ fontSize: 11, color: "var(--vault-text-mute)", marginLeft: "auto" }}>{scoreCaption}</span>
        ) : null}
      </div>

      <div>
        <p style={{ margin: 0, fontSize: 12.5 }}>{kickoffLabel}</p>
        {meta ? <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{meta}</p> : null}
      </div>

      {children}

      {footnote ? (
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: "var(--vault-text-faint)" }}>{footnote}</p>
      ) : null}

      {href ? (
        <p style={{ margin: 0, fontSize: 12 }}>
          <Link href={href} style={{ color: "var(--vault-gold)", fontWeight: 600 }}>
            {hrefLabel}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
