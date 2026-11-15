/**
 * NFL GAME-DAY TICKER (founder directive 2026-11-15, P7) — a horizontal, scroll-snapping strip of the NFL games around
 * this build, at the top of Home. Each card: matchup with team marks, kickoff (ET) or "Started", the official model's
 * favourite and win chance, and a link to the game page. It does not auto-scroll: the strip is swipeable/scrollable
 * and keyboard reachable, which needs no motion and no reduced-motion fallback. Renders nothing when no NFL game is near.
 */
import React from "react";
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import TickerKickoff from "@/components/home/ticker-kickoff";

export type TickerItem = { eventId: string; away: string; home: string; kickoffUtc: string; startedAtBuild: boolean; favorite: { abbr: string; pct: string } | null; note: string | null; href: string };

const CSS = `
.gt-tk{margin:0 0 14px}
.gt-tk-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--vault-text-faint)}
.gt-tk-h a{text-transform:none;letter-spacing:0;color:var(--vault-text-mute)}
.gt-tk ul{list-style:none;margin:0;padding:2px 2px 8px;display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.gt-tk{position:relative;max-width:100%}
.gt-tk li{flex:0 0 auto;scroll-snap-align:start;position:relative} /* positioned: keeps the sr-only spans inside the scroller (else they widen the page) */
.gt-tk-c{display:grid;gap:4px;min-width:150px;min-height:44px;padding:8px 10px;border:1px solid var(--vault-border);border-radius:10px;background:var(--vault-surface, transparent);color:var(--vault-text);text-decoration:none}
.gt-tk-c:hover,.gt-tk-c:focus-visible{border-color:var(--vault-gold-bright)}
.gt-tk-m{display:flex;align-items:center;gap:5px;font-weight:600;font-size:13px}
.gt-tk-k{font-size:11.5px;color:var(--vault-text-mute)}
.gt-tk-p{font-size:12px;color:var(--vault-text)}
.gt-tk-p b{font-variant-numeric:tabular-nums}
.gt-tk-n{font-size:12px;color:var(--vault-warn)}
`;

export default function NflGameDayTicker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  return (
    <nav className="gt-tk" aria-label="NFL games">
      <style>{CSS}</style>
      <div className="gt-tk-h"><span>NFL · {items.length} game{items.length === 1 ? "" : "s"}</span><Link href="/nfl/">All NFL forecasts →</Link></div>
      <ul>
        {items.map((g) => (
          <li key={g.eventId}>
            <Link className="gt-tk-c" href={g.href} data-ticker-event={g.eventId}>
              <span className="gt-tk-m">
                <TeamLogo team={g.away} sport="nfl" size="sm" ariaLabel="" />{g.away}
                <span aria-hidden="true" style={{ color: "var(--vault-text-faint)" }}>@</span><span className="sr-only">at</span>
                <TeamLogo team={g.home} sport="nfl" size="sm" ariaLabel="" />{g.home}
              </span>
              <TickerKickoff kickoffUtc={g.kickoffUtc} startedAtBuild={g.startedAtBuild} />
              {g.favorite
                ? <span className="gt-tk-p">Model: {g.favorite.abbr} <b>{g.favorite.pct}</b><span className="sr-only"> win chance</span></span>
                : <span className="gt-tk-n">{g.note === "QB change" ? "QB change · see game" : g.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
