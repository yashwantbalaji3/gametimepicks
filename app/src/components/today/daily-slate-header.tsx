/**
 * TodayDailySlateHeader — the top of /today. A compact header (NOT a giant Home-style hero): "Today", the reader's day,
 * one sentence saying what the page is, the sports with events today, and a primary "Simulate Today's Games" CTA with a
 * secondary "View Results" link. Presentational only — every figure arrives pre-formatted as a prop; this component
 * never reads fs/data and never hardcodes a count, date, dollar value, or record.
 *
 * W4 (2026-10-28): the "Daily model hub" eyebrow, the slate freshness badge and the MLB "N games · N model leans" line
 * left the header. They described the presented MLB slate — on a morning, yesterday's — above a page that now leads with
 * today's games across every sport; the MLB fold below names its own slate and freshness.
 */
import Link from "next/link";

export interface TodayDailySlateHeaderProps {
  /** Human date, e.g. "Wednesday, July 9". */
  dateLabel: string;
  /**
   * Honest relative qualifier when the date shown is NOT today's live action, e.g. "Latest slate".
   * Null/undefined ⇒ the date is today's (no qualifier). Keeps the header from implying an
   * older slate is "today" on a no-games day.
   */
  slateRelative?: string | null;
  /** Labels of the sports with events today, e.g. ["NFL", "NBA"] (empty ⇒ none). */
  activeSports: string[];
  /**
   * The games listed on this page for today, counted per sport from the SAME rows the list below renders
   * (UX 2026-11-13). The header may say "No games today" only when this is empty too: on 2026-11-13 it said so above a
   * list of nine games, because a sport's forecast lane had not published yet and only `activeSports` was consulted.
   */
  gamesToday?: readonly { label: string; count: number }[];
}

export default function TodayDailySlateHeader({
  dateLabel,
  slateRelative,
  activeSports,
  gamesToday = [],
}: TodayDailySlateHeaderProps) {
  // One chip per sport: its game count when the page lists its games, the bare label when the sport is active without
  // listed rows. Order: the page's own game order first.
  const listed = new Set(gamesToday.map((g) => g.label));
  const chips = [
    ...gamesToday.map((g) => ({ key: g.label, text: `${g.label} · ${g.count} game${g.count === 1 ? "" : "s"}` })),
    ...activeSports.filter((s) => !listed.has(s)).map((s) => ({ key: s, text: s })),
  ];
  return (
    <section
      aria-label="Today's slate"
      className="flex flex-col gap-2.5 rounded-[16px] px-4 py-3.5 sm:gap-3 sm:px-6 sm:py-5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}
    >
      {/* Compact on a phone (UX 2026-11-13): title and day share a line and the purpose sentence is short, so the first
          game is inside the first screen rather than below a full-height hero. */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,5vw,34px)", fontWeight: 800, lineHeight: 1.05 }}>
          Today
        </h1>
        <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
          {slateRelative ? `${slateRelative} · ` : ""}{dateLabel}
        </span>
        <span className="basis-full" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          Official forecasts for today&rsquo;s games · paper-only, educational
        </span>
      </div>

      {/* The sports with events today (the product-day owner's LIVE days + NBA's published lane). */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.length > 0 ? (
          chips.map(({ key, text: s }) => (
            <span
              key={key}
              className="rounded-full px-2.5 py-1"
              style={{ fontSize: 12, color: "var(--vault-text)", background: "var(--vault-wash-soft)", border: "1px solid var(--vault-border)" }}
            >
              {/* P292: these chips come from the product-day owner, where LIVE means the event's DAY is today, not that
                  anything has kicked off — so a chip never says "live now". On a past slate it names its time base. */}
              {s}{slateRelative ? " · today" : ""}
            </span>
          ))
        ) : (
          <span className="rounded-full px-2.5 py-1" style={{ fontSize: 12, color: "var(--vault-text-faint)", background: "var(--vault-wash-soft)", border: "1px solid var(--vault-border)" }}>
            {/* On a PAST slate the truthful chip is that the slate has closed (P240 · F). */}
            {slateRelative ? "Slate closed — nothing live now" : "No games today"}
          </span>
        )}
      </div>

      {/* Primary + secondary CTA — simulate-first, then results */}
      <div className="flex items-stretch gap-2 pt-0.5 sm:flex-wrap sm:items-center sm:gap-2.5">
        <Link
          href="/simulate"
          className="vault-press inline-flex flex-1 items-center justify-center rounded-full px-3 text-center font-semibold tracking-[-0.005em] sm:flex-none sm:px-5"
          style={{ minHeight: 44, fontSize: 13.5, fontWeight: 700, textDecoration: "none", background: "var(--vault-gold-bright)", color: "var(--vault-on-accent-deep)" }}
        >
          Simulate Today&rsquo;s Games
        </Link>
        <Link
          href="/results"
          className="vault-press inline-flex flex-1 items-center justify-center rounded-full px-3 text-center font-semibold tracking-[-0.005em] sm:flex-none sm:px-5"
          style={{ minHeight: 44, fontSize: 13.5, fontWeight: 700, textDecoration: "none", border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}
        >
          View Results
        </Link>
      </div>
    </section>
  );
}
