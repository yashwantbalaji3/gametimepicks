/**
 * RESULTS V2 · DAY NAVIGATION (Session 3). Where am I, and where can I go — at the TOP of a day page.
 *
 * The page already computed its previous and next dates and never rendered them; its only date controls sat at the very
 * bottom, under the legacy research tables (~6,000px down on a phone). This is a breadcrumb back to Results, the
 * neighbouring days, and "Latest settled" — the newest day the Results V2 owner has graded (`resultsDayDates()[0]`),
 * not the newest page, which can be a frozen pre-kickoff board with nothing settled yet.
 *
 * Every neighbour is a date this route pre-renders (the page's own union), so no link is a dead end. Links go through
 * `surfaceHref` — there is ONE router.
 */
import Link from "next/link";

import { formatDateLong } from "@/lib/format";
import { surfaceHref } from "@/lib/nav/date-sport-route";

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const short = (ymd: string) => SHORT.format(new Date(`${ymd}T12:00:00Z`));
/* ONE router: no hand-built dated URL as a fallback. A date the router cannot resolve gets no link. */
const dayHref = (d: string) => surfaceHref("results", { date: d });

const LINK: React.CSSProperties = { color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3, minHeight: 44, display: "inline-flex", alignItems: "center" };

export default function DayNav({ date, prev, next, latestSettled }: { date: string; prev: string | null; next: string | null; latestSettled: string | null }) {
  return (
    <nav aria-label="Results days" data-day-nav className="mt-3 flex flex-col gap-1">
      <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
        <Link href={surfaceHref("results") ?? "/results/"} style={LINK}>Results</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{formatDateLong(date)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-0 text-[13.5px]">
        {prev && dayHref(prev) ? <Link href={dayHref(prev)!} style={LINK} rel="prev">← {short(prev)}</Link> : <span style={{ color: "var(--vault-text-faint)" }}>Earliest day</span>}
        {next && dayHref(next) ? <Link href={dayHref(next)!} style={LINK} rel="next">{short(next)} →</Link> : <span style={{ color: "var(--vault-text-faint)" }}>Newest day</span>}
        {latestSettled && latestSettled !== date && dayHref(latestSettled) ? <Link href={dayHref(latestSettled)!} style={LINK}>Latest settled · {short(latestSettled)}</Link> : null}
        {latestSettled === date ? <span style={{ color: "var(--vault-text-mute)" }}>This is the latest settled day</span> : null}
      </div>
    </nav>
  );
}
