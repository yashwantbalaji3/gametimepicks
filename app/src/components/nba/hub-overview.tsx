/**
 * /nba — THE HUB OVERVIEW and TODAY'S CARDS without a forecast (NBA UI parity, founder directive 2026-10-22).
 *
 * The overview answers, before anything else on the page: what day this is, how many games, whether today's official
 * forecast is in this build (and when it froze), and where to go — Top Boards, today's games, results, how it works.
 * Every fact comes from lib/sport-hub/nba-hub.ts nbaTodaySlate (schedule capture, finals record, the current lane
 * snapshot, the built Theater ids); this component computes nothing.
 *
 * The Official Forecast is the Elo-favoured side and the frozen v0.1 player medians (founder directive 2026-10-23
 * public readiness: registry vocabulary; the one Model Performance disclosure lives in the lane banner and the
 * "How it works" section). Team scores, chances, ranges and prices are withheld everywhere, so no sentence here names
 * a number of that kind.
 */
import Link from "next/link";
import type { NbaTodayGame, NbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { MatchupCard } from "@/components/nba/experimental-lane";
import { PUBLIC_TERMS } from "@/lib/public-registry";

const etTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

const LINK = "gtp-hit-44 nbx-pill no-underline";

export function NbaSlateOverview({ slate, gamesAnchor }: { slate: NbaTodaySlate; gamesAnchor: string }) {
  const n = slate.games.length;
  const first = slate.games[0];
  return (
    <section className="nbx-overview" aria-labelledby="nba-today-h">
      <h2 id="nba-today-h" className="nbx-eyebrow">Today · {slate.dateLabel}</h2>
      <p className="nbx-lead">
        {n > 0
          ? `${n} game${n === 1 ? "" : "s"} · first tip-off ${first.tipLabel}`
          : `No NBA games today${slate.next ? ` · next: ${slate.next.matchup}, ${slate.next.label}` : ""}`}
      </p>
      <p className="nbx-state" data-nba-forecast={slate.forecast}>
        {slate.forecast === "PUBLISHED" ? (
          <>
            <strong>Official Forecast published</strong>{slate.frozenAt ? `, frozen ${etTime(slate.frozenAt)}` : ""}: the side the Elo
            rating favours in each game, and player medians. Team scores, win chances, score ranges and prices are withheld.
          </>
        ) : slate.forecast === "PENDING" ? (
          <>
            <strong>Today&rsquo;s Official Forecast is not published yet.</strong> It is frozen before tip-off and appears here
            once published: the Elo-favoured side and player medians. Until then the games below show the schedule only.
          </>
        ) : slate.forecast === "NO_GAMES" ? (
          <>Schedule and official finals today. The Official Forecast publishes on game days, frozen before tip-off.</>
        ) : (
          <><strong>Schedule only — no public forecast.</strong> Games, start times and official finals.</>
        )}
      </p>
      <nav aria-label="NBA destinations" className="nbx-links">
        {n > 0 ? <a href={`#${gamesAnchor}`} className={LINK}>Today&rsquo;s games ↓</a> : null}
        <Link href="/nba/projections/" className={LINK}>Top Boards · player projections →</Link>
        <a href="#nba-results" className={LINK}>Results ↓</a>
        <a href="#nba-model-status" className={LINK}>How it works · Model Performance ↓</a>
      </nav>
    </section>
  );
}

/** Today's games that carry NO official forecast in this build (pending, or excluded by the lane), as matchup cards. */
export function NbaScheduleCards({ games, heading, id }: { games: NbaTodayGame[]; heading: string; id: string }) {
  if (!games.length) return null;
  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-3" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="m-0 font-display text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>{heading}</h2>
      <div className="nbx-grid">
        {games.map((g) => (
          <MatchupCard key={g.id} game={{ id: g.id, tipUtc: g.tipUtc, status: g.status, away: { ...g.away, logo: g.away.logoTeam }, home: { ...g.home, logo: g.home.logoTeam } }}>
            <div className="nbx-read">
              <p>{g.away.name ?? g.away.abbr} at {g.home.name ?? g.home.abbr}</p>
              <p>{g.excludedReason ? `${PUBLIC_TERMS.UNAVAILABLE}: ${g.excludedReason}` : g.status === "final" ? "Final recorded · no Official Forecast for this game is in this update." : "Official Forecast not published yet — it is frozen before tip-off."}</p>
            </div>
            {g.finalNote ? <p className="nbx-note">Game status: final · {g.finalNote}</p> : null}
          </MatchupCard>
        ))}
      </div>
    </section>
  );
}
