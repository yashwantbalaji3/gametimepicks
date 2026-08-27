/**
 * Slate liveness — the ONE honest answer to "is what we're showing actually
 * live *today*, or is it the most-recent completed slate?"
 *
 * Keyed off the REAL ET clock (`freshness.currentEtDate`), NEVER the slate's own
 * date. This is the fix for the mid-July lull bug: on a 0-game day (MLB All-Star
 * break, World Cup between rounds) the public site must NOT present the last full
 * slate (e.g. July-11) as "today's" action. It must say, plainly:
 *
 *     No games today · here's the most recent slate · here's what's next.
 *
 * PURE + side-effect-free. It fabricates nothing: no games, no odds, no picks.
 * The "next focus" facts are supplied by the CALLER from a committed public
 * tournament-calendar constant (see `wc-tournament-calendar.ts`) — dates are a
 * matter of public record; matchups are explicitly TBD until the prior round is
 * settled. This module only *frames* what already exists.
 *
 * Companion to `freshness.ts` (real-ET-clock slate classification) and
 * `date-status.ts` (relative date labels). It composes them; it does not
 * duplicate their date math.
 */
import { daysOldVs } from "./freshness";

/** A known upcoming focus, sourced from a committed tournament calendar. */
export interface NextFocus {
  /** e.g. "World Cup semifinals". */
  label: string;
  /** Earliest ET date of the next round, YYYY-MM-DD. */
  date: string;
  /** Latest ET date if the round spans multiple days (optional). */
  through?: string;
  /** Honest caveat, e.g. "matchups set after the quarterfinals". */
  note?: string;
}

export interface SlateLivenessInput {
  /** REAL ET date (YYYY-MM-DD). Caller passes `currentEtDate()` — never the slate date. */
  today: string;
  /** Newest committed slate date across sports, or null if none exists. */
  latestSlate: string | null;
  /** True only when the latest slate falls on `today` AND has ≥1 game. */
  hasGamesToday: boolean;
  /** Optional next scheduled focus (from the committed calendar). */
  nextFocus?: NextFocus | null;
  /**
   * When today's slate must exist by, from the publication-SLO contract — derived from the earliest
   * eligible event's start, never a fixed hour. Absent = no lateness may be claimed.
   */
  publishDeadlineUtc?: string | null;
  /**
   * The VISITOR'S clock, in epoch ms. Deliberately the reader's own instant rather than the SLO
   * artifact's `checkedAt`: a detector that stopped running must not be able to make a late slate
   * look on time. Absent = no lateness may be claimed.
   */
  nowMs?: number | null;
  /**
   * Optional per-league honest notes shown under the headline, e.g.
   * "MLB — All-Star break, games resume ~Jul 17". Caller supplies sourced facts;
   * this module never invents a league state.
   */
  leagueNotes?: string[];
}

export type SlateLivenessStatus =
  | "live-today" // latest slate is today and has games
  | "latest-available" // a slate EXISTS for today and is empty — proven no-games day
  | "slate-pending" // no slate artifact for today yet, and it is not late — the normal morning
  | "slate-overdue" // no slate artifact and its publication deadline has passed — an incident
  | "no-data"; // no slate exists at all

export interface SlateLiveness {
  today: string;
  latestSlate: string | null;
  status: SlateLivenessStatus;
  /** Convenience mirror of `status === "live-today"`. */
  isLiveToday: boolean;
  /** ET days the latest slate is behind today (0 when live or no data). */
  daysBehind: number;
  /** Short headline, e.g. "No games today · Sun, Jul 12". */
  headline: string;
  /** Detail line, e.g. "Most recent slate: Sat, Jul 11 (1 day ago)." */
  detail: string;
  nextFocus: NextFocus | null;
  leagueNotes: string[];
}

/** "Sun, Jul 12" style label, formatted in ET so it matches the day boundary. */
export function prettyEtLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // noon UTC = same calendar date in ET, no DST slip
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dt);
}

/** "1 day ago" / "3 days ago" / "today". Never negative-phrased. */
export function daysAgoLabel(n: number): string {
  if (n <= 0) return "today";
  return `${n} day${n === 1 ? "" : "s"} ago`;
}

/** Range label for a focus, e.g. "Jul 14 & 15" or "Jul 14". */
export function focusDateLabel(f: NextFocus): string {
  const start = prettyEtLabel(f.date).replace(/^\w+, /, ""); // drop weekday → "Jul 14"
  if (!f.through || f.through === f.date) return start;
  const endDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.through)?.[3];
  if (!endDay) return start;
  return `${start} & ${Number(endDay)}`;
}

/**
 * Compute the honest liveness verdict. Pure — deterministic given its input.
 */
export function computeSlateLiveness(input: SlateLivenessInput): SlateLiveness {
  const { today, latestSlate, hasGamesToday, publishDeadlineUtc, nowMs } = input;
  const nextFocus = input.nextFocus ?? null;
  const leagueNotes = input.leagueNotes ?? [];

  if (!latestSlate) {
    return {
      today,
      latestSlate: null,
      status: "no-data",
      isLiveToday: false,
      daysBehind: 0,
      headline: "No slate available",
      detail: "No games are loaded yet. Check back when the next slate is published.",
      nextFocus,
      leagueNotes,
    };
  }

  // Live only when the latest slate IS today and actually has games.
  if (hasGamesToday && latestSlate === today) {
    return {
      today,
      latestSlate,
      status: "live-today",
      isLiveToday: true,
      daysBehind: 0,
      headline: `Today's slate · ${prettyEtLabel(today)}`,
      detail: "",
      nextFocus,
      leagueNotes,
    };
  }

  const daysBehind = Math.max(0, daysOldVs(latestSlate, today));

  /*
   * "NO GAMES TODAY" IS A CLAIM ABOUT THE WORLD. Only make it on evidence.
   *
   * A slate that exists FOR TODAY and carries zero games is real evidence of a no-games day (the
   * All-Star break this module was written for). A slate dated EARLIER than today is not evidence of
   * anything except that today's slate has not been published yet — and those two states were
   * collapsed into one line here.
   *
   * The cost of collapsing them is not cosmetic. On 2026-08-17 the morning publish had not run by
   * 09:40 ET, and /mlb told visitors "No games today · Mon, Aug 17" while the official schedule
   * carried ELEVEN games, the first at 1:40 PM ET. Every morning has that window.
   *
   * So absence of an artifact now says so, and says nothing more.
   */
  if (latestSlate < today) {
    /*
     * PENDING AND LATE ARE NOT THE SAME SENTENCE.
     *
     * "Today's slate isn't published yet" is the honest thing to say at 6 AM. It was also what this
     * banner said at 13:48 ET on 2026-08-27 — two and a half hours past the point where the day's
     * first game had already started and could never be covered — because there was nothing here
     * that knew what late meant. The fix is not different words for the same state; it is a second
     * state, with a deadline behind it.
     *
     * Both inputs are optional and this falls back to the old wording without them: a surface that
     * cannot establish a deadline may not accuse the pipeline of being late.
     */
    const deadlineMs = publishDeadlineUtc ? Date.parse(publishDeadlineUtc) : NaN;
    const overdue = Number.isFinite(deadlineMs) && typeof nowMs === "number" && nowMs >= deadlineMs;
    if (overdue) {
      return {
        today,
        latestSlate,
        status: "slate-overdue",
        isLiveToday: false,
        daysBehind,
        headline: `Today's slate is late · ${prettyEtLabel(today)}`,
        detail: `It was due before the first game and has not published. Most recent published slate: ${prettyEtLabel(latestSlate)} (${daysAgoLabel(daysBehind)}). This is a problem on our side, not a quiet day — games today may go uncovered.`,
        nextFocus,
        leagueNotes,
      };
    }
    return {
      today,
      latestSlate,
      status: "slate-pending",
      isLiveToday: false,
      daysBehind,
      headline: `Today's slate isn't published yet · ${prettyEtLabel(today)}`,
      detail: `Most recent published slate: ${prettyEtLabel(latestSlate)} (${daysAgoLabel(daysBehind)}). Any games on today appear here once the morning run publishes them.`,
      nextFocus,
      leagueNotes,
    };
  }

  return {
    today,
    latestSlate,
    status: "latest-available",
    isLiveToday: false,
    daysBehind,
    headline: `No games today · ${prettyEtLabel(today)}`,
    detail: `Most recent slate: ${prettyEtLabel(latestSlate)} (${daysAgoLabel(daysBehind)}).`,
    nextFocus,
    leagueNotes,
  };
}
