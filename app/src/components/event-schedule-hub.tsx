"use client";

/**
 * EventScheduleHub — the tabbed, schedule-ONLY surface for `/events`
 * (WNBA · UFC · FIFA World Cup).
 *
 * Honesty contract (mirrors `lib/event-schedules.ts`):
 *   - Schedule only. We render dates, matchups, venues — never odds,
 *     projections, picks, or win/loss claims.
 *   - Every league shows its source banner (name, snapshot date, covered
 *     range, honest note + a link to the public feed) so the data is
 *     always attributed and clearly labelled as a point-in-time snapshot.
 *   - A "disabled" source renders an explicit "not connected yet" state
 *     instead of an empty calendar pretending to be complete.
 *
 * "use client" only for the tab-selection state. All inputs are plain
 * serializable props passed down from the server page.
 */
import { useState } from "react";
import Link from "next/link";

import {
  formatEventTimeLabel,
  groupEventsByDate,
  isSourceConnected,
  summarizeSource,
  type LeagueKey,
  type LeagueSchedule,
} from "@/lib/event-schedules";

export interface EventScheduleHubProps {
  leagues: LeagueSchedule[];
}

export default function EventScheduleHub({ leagues }: EventScheduleHubProps) {
  const [activeKey, setActiveKey] = useState<LeagueKey>(
    leagues[0]?.key ?? "wnba",
  );
  const active =
    leagues.find((l) => l.key === activeKey) ?? leagues[0] ?? null;

  if (!active) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Tab bar -------------------------------------------------- */}
      <div
        role="tablist"
        aria-label="Leagues"
        className="flex flex-wrap gap-1.5"
      >
        {leagues.map((league) => {
          const isActive = league.key === active.key;
          return (
            <button
              key={league.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActiveKey(league.key)}
              className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full transition-all"
              style={{
                fontSize: 12,
                color: isActive
                  ? "var(--vault-gold-bright)"
                  : "var(--vault-text-mute)",
                border: `1px solid ${
                  isActive ? "var(--vault-gold-bright)" : "var(--vault-rule)"
                }`,
                background: isActive
                  ? "rgba(242, 54, 69, 0.08)"
                  : "transparent",
              }}
            >
              {league.label}
            </button>
          );
        })}
      </div>

      {/* ---- Active league panel ------------------------------------- */}
      <section
        role="tabpanel"
        aria-label={`${active.label} schedule`}
        className="rounded-[10px] overflow-hidden"
        style={{
          background: "var(--gtp-card)",
          border: "1px solid var(--gtp-card-border)",
        }}
      >
        <SourceBanner league={active} />
        <div className="px-3.5 py-4">
          <LeagueBody league={active} />
        </div>
      </section>
    </div>
  );
}

/* ===================================================================== */
/* Sub-components                                                         */
/* ===================================================================== */

function SourceBanner({ league }: { league: LeagueSchedule }) {
  const { source } = league;
  return (
    <header
      className="px-3.5 py-3 flex flex-col gap-1.5"
      style={{
        background: "var(--gtp-card-sunken)",
        borderBottom: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}
        >
          {league.longLabel}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
        >
          · schedule only · {summarizeSource(source)}
        </span>
      </div>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {source.note}{" "}
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="underline"
          style={{ color: "var(--vault-text-mute)" }}
        >
          View source feed →
        </a>
      </p>
    </header>
  );
}

function LeagueBody({ league }: { league: LeagueSchedule }) {
  if (!isSourceConnected(league)) {
    return <DisabledState league={league} />;
  }

  const groups = groupEventsByDate(league.events);
  if (groups.length === 0) {
    return <EmptyState league={league} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.dateKey} className="flex flex-col gap-2">
          <h3
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-text-mute)", fontSize: 11 }}
          >
            {group.label}
          </h3>
          <ul className="flex flex-col gap-2 list-none">
            {group.events.map((event) => (
              <li
                key={event.id}
                className="rounded-[8px] px-3 py-2.5 flex flex-col gap-1.5"
                style={{
                  background: "var(--gtp-card-sunken)",
                  border: "1px solid var(--vault-rule)",
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className="font-mono shrink-0"
                    style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}
                  >
                    {formatEventTimeLabel(event.startUtc)}
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--vault-text)", fontSize: 14 }}
                  >
                    {event.name}
                  </span>
                </div>
                {(event.venue || event.detail) && (
                  <span
                    className="font-mono"
                    style={{ color: "var(--vault-text-faint)", fontSize: 11 }}
                  >
                    {[event.detail, event.venue]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {event.competitors && event.competitors.length > 0 && (
                  <ul
                    className="mt-0.5 flex flex-col gap-0.5 list-none"
                    style={{ color: "var(--vault-text-mute)" }}
                  >
                    {event.competitors.map((bout, i) => (
                      <li
                        key={`${event.id}-${i}`}
                        className="text-[12px] leading-snug"
                        style={
                          i === 0
                            ? { color: "var(--vault-text)", fontWeight: 600 }
                            : undefined
                        }
                      >
                        {bout}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {league.moreHref && (
        <Link
          href={league.moreHref}
          className="font-mono uppercase tracking-[0.12em] self-start px-3 py-1.5 rounded-full"
          style={{
            color: "var(--vault-gold-bright)",
            border: "1px solid var(--vault-gold-bright)",
            fontSize: 11,
          }}
        >
          {league.moreLabel ?? "See full schedule"} →
        </Link>
      )}
    </div>
  );
}

function EmptyState({ league }: { league: LeagueSchedule }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-2 py-8"
      style={{ minHeight: 120 }}
    >
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 420 }}
      >
        No {league.label} events in this snapshot window
        {" "}
        ({league.source.rangeStart} → {league.source.rangeEnd}). Check back
        as the schedule fills in.
      </p>
      {league.moreHref && (
        <Link
          href={league.moreHref}
          className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full"
          style={{
            color: "var(--vault-gold-bright)",
            border: "1px solid var(--vault-gold-bright)",
            fontSize: 11,
          }}
        >
          {league.moreLabel ?? "See full schedule"} →
        </Link>
      )}
    </div>
  );
}

function DisabledState({ league }: { league: LeagueSchedule }) {
  return (
    <div
      className="flex flex-col items-center text-center gap-2 py-8"
      style={{ minHeight: 120 }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}
      >
        Source not connected yet
      </span>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 420 }}
      >
        The {league.longLabel} schedule feed isn&apos;t wired up for this
        build. When it is, dates and matchups will appear here — schedule
        only, with the source attributed above.
      </p>
    </div>
  );
}
