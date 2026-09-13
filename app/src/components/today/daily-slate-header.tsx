/**
 * TodayDailySlateHeader — Section 1 of the Daily Model Hub. A compact, operational header (NOT a giant
 * Home-style hero): "Today's Picks" + the presented slate date + active-sport chips + MLB games/leans
 * counts (when any) + a paper-only note, with a primary "Simulate Today's Games" CTA and a secondary
 * "View Results" link. Presentational only — every figure arrives pre-formatted as a prop; this component
 * never reads fs/data and never hardcodes a count, date, dollar value, or record.
 */
import Link from "next/link";
import FreshnessBadge from "@/components/ui/freshness-badge";

export interface TodayDailySlateHeaderProps {
  /** Human slate date, e.g. "Wednesday, July 9". */
  dateLabel: string;
  /**
   * Honest relative qualifier when the slate is NOT today's live action, e.g. "Latest slate".
   * Null/undefined ⇒ the slate is today's (no qualifier). Keeps the header from implying an
   * older slate is "today" on a no-games day.
   */
  slateRelative?: string | null;
  /** Machine slate date (YYYY-MM-DD) for the freshness badge. */
  slateDate: string;
  /** Wall-clock ET date for the freshness badge's SSR seed. */
  serverToday: string;
  /** Active-sport labels for the slate, e.g. ["MLB", "World Cup"] (empty ⇒ no live sport). */
  activeSports: string[];
  /** MLB scheduled-games count for the slate (0 when no board). */
  mlbGames: number;
  /** MLB model-leans count for the slate (0 when no board). */
  mlbLeans: number;
}

export default function TodayDailySlateHeader({
  dateLabel,
  slateRelative,
  slateDate,
  serverToday,
  activeSports,
  mlbGames,
  mlbLeans,
}: TodayDailySlateHeaderProps) {
  return (
    <section
      aria-label="Today's slate"
      className="flex flex-col gap-3 rounded-[16px] px-5 py-5 sm:px-6"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", borderTop: "2px solid var(--gtp-bank-heat)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          Daily model hub
        </span>
        <FreshnessBadge slateDate={slateDate} serverToday={serverToday} noun="slate" />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,34px)", fontWeight: 800, lineHeight: 1.05 }}>
          Today&rsquo;s Picks
        </h1>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
          {slateRelative ? `${slateRelative} · ` : ""}{dateLabel} · paper-only, educational
        </span>
      </div>

      {/* Active-sport chips + MLB counts (only when a board exists) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {activeSports.length > 0 ? (
          activeSports.map((s) => (
            <span
              key={s}
              className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.06em]"
              style={{ fontSize: 10, color: "var(--vault-text)", background: "var(--vault-wash-soft)", border: "1px solid var(--vault-border)" }}
            >
              {/* P250-GD: the chips describe TODAY; the counts beside them describe the slate on
                  display. On a past-slate morning those are different days — a bare "NFL" chip next
                  to "15 MLB games · Tuesday" read as one contradictory sentence, so the chip names
                  its own time base whenever the slate is not today's.

                  P292: that time base used to read "· live now", which is a stronger claim than the
                  data supports. These chips come from the product-day owner, where
                  `state: kickDay === today ? "LIVE" : "EVENT_UPCOMING"` — LIVE means the event's DAY
                  is today, not that anything has kicked off. At 3:31am ET on a Sunday the page told
                  readers "Premier League · live now" and "NFL · live now" with first kickoffs 5.5 and
                  9.5 hours away. "today" disambiguates the time base just as well and is true all
                  day. */}
              {s}{slateRelative ? " · today" : ""}
            </span>
          ))
        ) : (
          <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 10, color: "var(--vault-text-faint)", background: "var(--vault-wash-soft)", border: "1px solid var(--vault-border)" }}>
            {/* On a PAST slate the truthful chip is that the slate has closed — "no live sport"
                beside "15 MLB games" read as a contradiction, when it only meant nothing is live
                RIGHT NOW on yesterday's slate (P240 · F). */}
            {slateRelative ? "Slate closed — nothing live now" : "No live sport on this slate"}
          </span>
        )}
        {mlbGames > 0 ? (
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {mlbGames} MLB {mlbGames === 1 ? "game" : "games"} · {mlbLeans} model {mlbLeans === 1 ? "lean" : "leans"}
          </span>
        ) : null}
      </div>

      {/* Primary + secondary CTA — simulate-first, then results */}
      <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
        <Link
          href="/simulate"
          className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
          style={{ minHeight: 44, fontSize: 12, fontWeight: 700, textDecoration: "none", background: "var(--vault-gold-bright)", color: "var(--vault-on-accent-deep)" }}
        >
          Simulate Today&rsquo;s Games →
        </Link>
        <Link
          href="/results"
          className="vault-press inline-flex items-center justify-center rounded-full px-5 font-mono uppercase tracking-[0.1em]"
          style={{ minHeight: 44, fontSize: 12, fontWeight: 700, textDecoration: "none", border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)" }}
        >
          View Results →
        </Link>
      </div>
    </section>
  );
}
