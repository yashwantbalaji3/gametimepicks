"use client";
/**
 * The 404 page's notice for an expired NBA Game Simulation link (see expired-simulation.mjs). Renders nothing on the
 * server and nothing for any other missing path, so every other 404 is unchanged. Since the settled pages (overnight W7
 * 2026-10-28) a past slate's link inside the window opens its own page; this notice covers older links, a flag-OFF
 * build, and a current-slate game without a Game Simulation — with the settled page's own words.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { SIMULATION_ARCHIVED_NOTE, expiredSimulationFor, settledVerdictText } from "./expired-simulation.mjs";
import { loadExpiredGames } from "../expired/expired-games.mjs";

type Notice = ReturnType<typeof expiredSimulationFor>;

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

/** [awayScore, homeScore, recordState, favouredAbbr] — the official record's row (expired-games.mjs nbaExpiredFacts). */
type Facts = Record<string, [number, number, string, string | null]>;

export default function ExpiredSimulationNotice({ map }: { map: Record<string, [string, string]> }) {
  const [notice, setNotice] = useState<Notice>(null);
  const [facts, setFacts] = useState<Facts>({});
  useEffect(() => {
    const n = expiredSimulationFor(window.location.pathname, map);
    setNotice(n);
    // founder P1 2026-10-26: a known game also gets its recorded final, fetched only here (never a 404 prop — see EXPIRED_GAMES_URL)
    if (n?.kind !== "KNOWN") return;
    let live = true;
    loadExpiredGames().then((idx) => { if (live && idx?.nba) setFacts(idx.nba); });
    return () => { live = false; };
  }, [map]);
  if (!notice) return null;
  return (
    <section
      aria-labelledby="expired-simulation-h"
      data-expired-simulation={notice.kind}
      className="mt-6 max-w-2xl rounded-[12px] px-4 py-3.5 flex flex-col gap-2"
      style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }}
    >
      <h2 id="expired-simulation-h" className="m-0 font-display text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>
        {notice.kind === "KNOWN" ? `Game Simulation · ${notice.matchup} · ${dayLabel(notice.date)}` : "Game Simulation no longer available"}
      </h2>
      {notice.kind === "KNOWN" && facts[notice.id] ? (() => {
        // the same words as the settled page (expired-simulation.mjs settledVerdictText), from the record's own state
        const [awayScore, homeScore, state, fav] = facts[notice.id];
        const [away, home] = notice.matchup.split(" @ ");
        return (
          <p className="m-0 text-[14px] leading-relaxed" style={{ color: "var(--vault-text)" }} data-expired-final="">
            <strong>Final{state === "HELD" ? " (under review)" : ""}: {away} {awayScore} – {homeScore} {home}.</strong>{" "}
            <span style={{ color: "var(--vault-text-mute)" }}>{settledVerdictText(state, fav)}</span>
          </p>
        );
      })() : null}
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {SIMULATION_ARCHIVED_NOTE}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {notice.kind === "KNOWN" ? (
          <Link href={notice.boardHref} className="gtp-hit-44 inline-flex items-center rounded-full px-4 text-[13px] font-semibold no-underline" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
            Official Forecast · {dayLabel(notice.date)} →
          </Link>
        ) : (
          <Link href="/nba/projections/" className="gtp-hit-44 inline-flex items-center rounded-full px-4 text-[13px] font-semibold no-underline" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
            Official Forecasts →
          </Link>
        )}
        <Link href={notice.resultsHref} className="gtp-hit-44 inline-flex items-center rounded-full px-4 text-[13px] font-semibold no-underline" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>
          NBA results →
        </Link>
      </div>
    </section>
  );
}
