import Link from "next/link";

import { currentEtDate } from "@/lib/freshness";
import { getAvailableSettlementDates } from "@/lib/settlement-data";
import { getMlbAvailableResultDates } from "@/lib/data-mlb-results";
import { surfaceHref } from "@/lib/nav/date-sport-route";

/** The exact date set `/results/date/[date]` is statically generated for (NBA
 *  settlement ∪ MLB result dates). A settled board date without a graded-results
 *  route (e.g. a slate with no settled leans) must NOT render a link that 404s. */
function resultsDateRouteExists(date: string): boolean {
  const nba = getAvailableSettlementDates();
  const mlb = getMlbAvailableResultDates().dates ?? [];
  return nba.includes(date) || mlb.includes(date);
}

/**
 * Banner that sits at the top of NBA + MLB board pages to make the
 * date's status unambiguous in one glance:
 *
 *   - "SETTLED · graded against final box scores"  →  historical date
 *     with a settled comparison report on disk. Always links to the
 *     date-level audit so the reader is one click away from the real
 *     audit numbers instead of staring at projection cards that are
 *     no longer actionable.
 *
 *   - "LIVE TONIGHT · today's slate"               →  ET-anchored
 *     match between page date and "today". Renders only when leans
 *     are present so an empty "today" board still shows the schedule-
 *     pending variant instead of a misleading "live tonight" pulse.
 *
 *   - "LINES PENDING · projections arriving soon"  →  future date or
 *     today-with-no-leans. Honest framing that schedule is real but
 *     odds + projections haven't been fetched yet.
 *
 *   - "UPCOMING SLATE"                             →  future date,
 *     no projections yet. Same shell as "LINES PENDING" with a
 *     different eyebrow phrase so future days don't feel "broken".
 *
 * Pure presentation. Every input comes from data already on disk;
 * the banner never fetches and never fabricates a status.
 */
interface Props {
  /** YYYY-MM-DD date shown on the board page. */
  date: string;
  /** Total games scheduled for the date (after schedule fetch). */
  gameCount: number;
  /** Lean count actually emitted (post-guardrails). 0 = schedule-only. */
  leanCount: number;
  /** True when this date has a settled comparison report on disk. */
  isSettled: boolean;
  /** Sport prefix for "view audit" link routing + copy. */
  sport: "NBA" | "MLB";
  /** Real wins / losses pulled from settled report (only when isSettled). */
  settled?: {
    wins: number;
    losses: number;
    decisive: number;
    hitRate: number | null;
  };
}

export default function BoardDateStatusBanner({
  date,
  gameCount,
  leanCount,
  isSettled,
  sport,
  settled,
}: Props) {
  const today = currentEtDate();
  const isToday = date === today;
  const isFuture = date > today;

  // Pick exactly one banner state. SETTLED wins over today/future so
  // a date that somehow has both a settled report AND falls on today
  // (e.g. settlement ran early) reads as "the record is the record".
  const state: "settled" | "live" | "pending" | "upcoming" = isSettled
    ? "settled"
    : isToday && leanCount > 0
      ? "live"
      : isFuture
        ? "upcoming"
        : "pending";

  const config = STATE_CONFIG[state];

  return (
    <section
      className="reveal mt-4"
      aria-label={`${sport} board status for ${date}`}
    >
      <div
        className={`relative overflow-hidden rounded-[10px] px-4 py-3.5 sm:px-5 sm:py-4 flex flex-wrap items-center gap-x-4 gap-y-2 ${
          state === "live" ? "gtp-status-live-glow" : ""
        }`}
        style={{
          background: config.bg,
          border: `1px solid ${config.border}`,
          boxShadow: config.shadow,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span
            aria-hidden
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              state === "settled" || state === "upcoming"
                ? ""
                : "gtp-neon-pulse"
            }`}
            style={{
              background: config.fg,
              boxShadow: `0 0 6px ${config.fg}`,
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: config.fg, fontSize: 10 }}
          >
            {config.eyebrow}
          </span>
        </div>
        <div
          className="flex-1 min-w-0 text-[12px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <span style={{ color: "var(--vault-text)" }}>
            {state === "settled" && settled
              ? `${settled.wins}–${settled.losses} on ${settled.decisive} decisive picks` +
                (settled.hitRate !== null
                  ? ` · ${(settled.hitRate * 100).toFixed(1)}%`
                  : "")
              : state === "live"
                ? `${gameCount} game${gameCount === 1 ? "" : "s"} · ${leanCount} model leans tonight`
                : state === "upcoming"
                  ? `${gameCount} game${gameCount === 1 ? "" : "s"} on slate · projections arriving soon`
                  : `${gameCount} game${gameCount === 1 ? "" : "s"} scheduled · lines pending`}
          </span>
          <span
            className="ml-2 font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
          >
            {date}
          </span>
        </div>
        {state === "settled" && resultsDateRouteExists(date) && (
          <Link
            href={surfaceHref("results", { date }) ?? "/results/"}
            className="font-mono shrink-0 transition-all hover:brightness-110"
            style={{
              color: "var(--vault-scrim-midnight)",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              textDecoration: "none",
              fontWeight: 600,
              background:
                "linear-gradient(180deg, var(--vault-gold-bright), var(--vault-crown-alt))",
              padding: "7px 11px",
              borderRadius: 4,
              boxShadow: "0 0 14px color-mix(in srgb, var(--vault-accent) 30%, transparent)",
            }}
          >
            View audit →
          </Link>
        )}
      </div>
    </section>
  );
}

const STATE_CONFIG = {
  // Settled now reads gold (authoritative) rather than green so it
  // matches the "view audit →" CTA on the same row.
  settled: {
    eyebrow: "Settled · graded against final box scores",
    fg: "var(--vault-gold-bright)",
    bg: "linear-gradient(155deg, color-mix(in srgb, var(--vault-accent) 12%, transparent), color-mix(in srgb, var(--vault-accent) 4%, transparent))",
    border: "color-mix(in srgb, var(--vault-accent) 40%, transparent)",
    shadow: "0 6px 22px color-mix(in srgb, var(--vault-ink-black) 30%, transparent), 0 0 0 1px color-mix(in srgb, var(--vault-accent) 10%, transparent)",
  },
  // Live = energetic green with surrounding pulse glow (gtp-status-live-glow).
  live: {
    eyebrow: "Live tonight · today's slate",
    fg: "var(--vault-success)",
    bg: "linear-gradient(155deg, color-mix(in srgb, var(--vault-success) 14%, transparent), color-mix(in srgb, var(--vault-success) 4%, transparent))",
    border: "color-mix(in srgb, var(--vault-success) 42%, transparent)",
    shadow: "0 6px 22px color-mix(in srgb, var(--vault-ink-black) 30%, transparent)",
  },
  // Upcoming = cool blue, calm.
  upcoming: {
    eyebrow: "Upcoming slate · projections arriving soon",
    fg: "var(--vault-info-bright)",
    bg: "linear-gradient(155deg, color-mix(in srgb, var(--vault-info) 10%, transparent), color-mix(in srgb, var(--vault-info) 3%, transparent))",
    border: "color-mix(in srgb, var(--vault-info) 30%, transparent)",
    shadow: "0 6px 22px color-mix(in srgb, var(--vault-ink-black) 30%, transparent)",
  },
  // Lines pending = warm amber, calm.
  pending: {
    eyebrow: "Lines pending · projections arriving soon",
    fg: "var(--vault-warn-amber)",
    bg: "linear-gradient(155deg, color-mix(in srgb, var(--vault-warn-alt) 10%, transparent), color-mix(in srgb, var(--vault-warn-alt) 3%, transparent))",
    border: "color-mix(in srgb, var(--vault-warn-alt) 32%, transparent)",
    shadow: "0 6px 22px color-mix(in srgb, var(--vault-ink-black) 30%, transparent)",
  },
} as const;
