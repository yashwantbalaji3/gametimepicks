"use client";

/**
 * A soccer league page's fixture list and data-freshness banner, evaluated at VIEW time (P0 10-28 · U7).
 *
 * The page is a static export. The server renders both with the build clock (`serverNowMs`), so the HTML is already
 * filtered; in the browser the clock moves to the viewer's own (never earlier than the build's) and keeps moving, so a
 * page opened long after its data was generated still never lists a kicked-off match as upcoming, and says when its
 * data is stale. The rules are pure and tested: lib/sports/soccer/fixture-timing.mjs.
 */
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { KICKED_OFF_PENDING, STALE_AFTER_HOURS, dataStaleness, partitionFixtures, viewClock } from "@/lib/sports/soccer/fixture-timing.mjs";

export interface BoardRow { eventId: string; kickoffUtc: string; homeClub: string; awayClub: string }
type Final = { home: number; away: number };

const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
const ET_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ET_STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The build clock first (matches the static HTML), then the viewer's — never earlier than the build's — every minute. */
function useViewClock(serverNowMs: number): number {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const tick = () => setNow(viewClock(serverNowMs, Date.now()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [serverNowMs]);
  return now;
}

export function LeagueDataFreshness({ leagueName, generatedAt, serverNowMs }: { leagueName: string; generatedAt: string; serverNowMs: number }) {
  const now = useViewClock(serverNowMs);
  if (!dataStaleness(generatedAt, now).stale) return null;
  const t = Date.parse(generatedAt);
  const when = Number.isFinite(t) ? `${ET_STAMP.format(new Date(t))} ET` : "at an unknown time";
  return (
    <p role="status" data-stale-banner="" className="mt-3 rounded-[10px] px-3 py-2"
      style={{ margin: "12px 0 0", maxWidth: "75ch", fontSize: 13, color: "var(--vault-text)", background: "var(--vault-warn-dim)", border: "1px solid var(--vault-warn)" }}>
      <strong>This page&rsquo;s {leagueName} data is out of date.</strong> It was last updated {when}, more than {STALE_AFTER_HOURS} hours ago.
      Matches that have kicked off are listed as kicked off, never as upcoming; new fixtures, forecasts and results appear after the next successful update.
    </p>
  );
}

export function LeagueFixtureBoard({ leagueName, serverNowMs, rows, finals, rowNodes }: {
  leagueName: string;
  serverNowMs: number;
  /** every fixture row in the league file, in kickoff order */
  rows: BoardRow[];
  /** recorded finals by eventId (the league's graded record) */
  finals: Record<string, Final>;
  /** the server-rendered forecast row (an <li>) of each fixture that was still upcoming at build time */
  rowNodes: Record<string, ReactNode>;
}) {
  const now = useViewClock(serverNowMs);
  const { upcoming: open, started } = partitionFixtures(rows, now, finals);
  /* A row is listed as upcoming only with its forecast node; one without (it had kicked off at build) stays started. */
  const upcoming = open.filter((r) => rowNodes[r.eventId] != null);
  for (const r of open) if (rowNodes[r.eventId] == null) started.push({ row: r, state: "KICKED_OFF", final: null });
  const days = new Map<string, { label: string; rows: BoardRow[] }>();
  for (const r of upcoming) {
    const d = new Date(r.kickoffUtc);
    const k = ET_KEY.format(d);
    if (!days.has(k)) days.set(k, { label: ET_DAY.format(d), rows: [] });
    days.get(k)!.rows.push(r);
  }
  return (
    <>
      {days.size === 0 ? (
        <p role="status" style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>No {leagueName} fixtures in the next eight days. Forecasts appear here once the next round is scheduled.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {[...days].map(([key, d]) => (
            <section key={key} aria-labelledby={`day-${key}`} className="rounded-[12px]" style={{ border: "1px solid var(--vault-rule)", background: "var(--vault-panel)" }}>
              <h2 id={`day-${key}`} className="px-3 pt-3 pb-2" style={{ margin: 0, fontSize: 14, color: "var(--vault-text)" }}>{d.label}</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{d.rows.map((r) => <Fragment key={r.eventId}>{rowNodes[r.eventId]}</Fragment>)}</ul>
            </section>
          ))}
        </div>
      )}
      {started.length > 0 ? (
        <section aria-labelledby="kicked-off" className="mt-6" data-kicked-off="">
          <h2 id="kicked-off" style={{ margin: 0, fontSize: 14, color: "var(--vault-text)" }}>Already kicked off</h2>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--vault-text-mute)" }}>
            {started.map(({ row: r, state, final }) => (
              <li key={r.eventId}>
                {r.homeClub} v {r.awayClub} · kicked off {Number.isFinite(Date.parse(r.kickoffUtc)) ? `${ET_SHORT.format(new Date(r.kickoffUtc))} ET` : "(time unavailable)"} ·{" "}
                <strong style={{ color: "var(--vault-text)" }}>{state === "FINAL" && final ? `Full time ${final.home}–${final.away}` : KICKED_OFF_PENDING}</strong>
              </li>
            ))}
          </ul>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>Each match&rsquo;s forecast was frozen before kick-off and is graded once its result is recorded.</p>
        </section>
      ) : null}
    </>
  );
}
