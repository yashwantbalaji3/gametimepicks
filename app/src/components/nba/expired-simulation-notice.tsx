"use client";
/**
 * The 404 page's notice for an expired NBA Game Simulation link (see expired-simulation.mjs). Renders nothing on the
 * server and nothing for any other missing path, so every other 404 is unchanged.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { expiredSimulationFor } from "./expired-simulation.mjs";

type Notice = ReturnType<typeof expiredSimulationFor>;

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

/** [awayScore, homeScore, winnerSide, favouredSide] from the recorded final and the frozen Elo side (expired-games.mjs nbaExpiredFacts). */
type Facts = Record<string, [number, number, "home" | "away", "home" | "away" | null]>;

export default function ExpiredSimulationNotice({ map, facts = {} }: { map: Record<string, [string, string]>; facts?: Facts }) {
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => { setNotice(expiredSimulationFor(window.location.pathname, map)); }, [map]);
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
        const [awayScore, homeScore, winner, fav] = facts[notice.id];
        const [away, home] = notice.matchup.split(" @ ");
        return (
          <p className="m-0 text-[14px] leading-relaxed" style={{ color: "var(--vault-text)" }} data-expired-final="">
            <strong>Final: {away} {awayScore} – {homeScore} {home}.</strong>{" "}
            {fav ? <span style={{ color: "var(--vault-text-mute)" }}>The Official Forecast favoured {fav === "home" ? home : away} (Elo rating) — {fav === winner ? "right" : "wrong"}.</span> : null}
          </p>
        );
      })() : null}
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        Game Simulations are shown on game day only. The Official Forecast for every game stays available, frozen exactly as it was published before tip-off.
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
