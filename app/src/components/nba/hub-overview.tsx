/**
 * /nba — THE HUB OVERVIEW and TODAY'S GAMES (NBA UI parity 2026-10-22 · founder mandate 2026-10-24: NBA publicly
 * usable end-to-end).
 *
 * The overview answers, before anything else on the page: what day this is, how many games, whether today's Official
 * Forecast is published (and when it froze), and where to go — today's games, the forecasts, Top Boards, the Game
 * Simulations, results — plus the dated boards (the hub's date navigation: plain links, no client component).
 * Every fact comes from lib/sport-hub/nba-hub.ts nbaTodaySlate (schedule capture, finals record, the current forecast
 * snapshot, the built Game Simulation ids); this component computes nothing.
 *
 * TODAY'S GAMES: one card for EVERY game on today's schedule (hubLaneAnchor `/nba/#nba-exp-<id>` — the homepage, the
 * boards and /today link here, so every one of today's games has one). A card says what is true at build time and links
 * straight to the game's Official Forecast and its Game Simulation, each only when it exists: no link before the
 * forecast is published, none to a Game Simulation page that was not built.
 *
 * GAME PAGES (Batch 1 fix #2, 2026-10-29): a card and a "Forecast vs. Actual" row link to the game's page
 * (/nba/simulation/<id>/ — today's Game Simulation page or a past slate's settled page) ONLY when `gamePages` (the
 * exported ids: settled-simulation-data nbaExportedGamePageIds) holds it — "Game page →", named "Game page: AWAY vs HOME",
 * a 44px target. No ids passed → no link.
 */
import React from "react";
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import { nbaExclusionText, type NbaTodayGame, type NbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { hubStatusDisplay, type HubGameRow } from "@/lib/sport-hub/contract";
import { MatchupCard, forecastRowId } from "@/components/nba/experimental-lane";
import { PUBLIC_TERMS } from "@/lib/public-registry";
import { HubSlipButton, type HubSlipLegs } from "@/components/products/hub-slip";
import { NBA_GAME_PAGE_TEXT, nbaGamePageHrefIfExported, nbaGamePageLabel } from "@/components/nba/game-page-link.mjs";

const etTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const LINK = "gtp-hit-44 nbx-pill no-underline";

/** In-page section ids, in the page's order (the overview's links and the section strip read the same ids). */
export const NBA_HUB_SECTIONS = Object.freeze({
  games: "nba-games",
  forecast: "nba-forecast",
  boards: "nba-boards",
  players: "nba-players",
  simulations: "nba-simulations",
  results: "nba-results",
  howItWorks: "nba-model-status",
});

export function NbaSlateOverview({ slate, boardDates = [] }: { slate: NbaTodaySlate; boardDates?: readonly string[] }) {
  const n = slate.games.length;
  const first = slate.games[0];
  const S = NBA_HUB_SECTIONS;
  // the dated boards before today, newest last; today's board is the Top Boards link itself
  const earlier = boardDates.filter((d) => d < slate.date).slice(-4);
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
            <strong>{PUBLIC_TERMS.OFFICIAL_FORECAST} published</strong>{slate.frozenAt ? `, frozen ${etTime(slate.frozenAt)}` : ""}: the
            favoured side in each game and every player&rsquo;s {PUBLIC_TERMS.PLAYER_STATISTICS}. Team scores, score ranges and prices are not
            published.
          </>
        ) : slate.forecast === "PENDING" ? (
          /* Overnight W7 2026-10-28: ONE line for the slate, with the one time the records hold — the first tip-off it
             publishes before — instead of the same "not published yet" on every card. No typical publish hour is
             claimed: none is a sourced constant (the forecast window builds each game up to 8 hours before its tip). */
          <>
            <strong>Today&rsquo;s {PUBLIC_TERMS.OFFICIAL_FORECAST} is not published yet.</strong> It publishes before the first tip-off
            {first ? ` (${first.tipLabel})` : ""}: the favoured side and {PUBLIC_TERMS.PLAYER_STATISTICS} for every game.
          </>
        ) : slate.forecast === "NO_GAMES" ? (
          <>Schedule and official finals today. The {PUBLIC_TERMS.OFFICIAL_FORECAST} publishes on game days, frozen before tip-off.</>
        ) : (
          <><strong>Schedule only — no public forecast.</strong> Games, start times and official finals.</>
        )}
      </p>
      <nav aria-label="NBA destinations" className="nbx-links">
        {n > 0 ? <a href={`#${S.games}`} className={LINK}>Today&rsquo;s games ↓</a> : null}
        {slate.forecast === "PUBLISHED" ? <a href={`#${S.forecast}`} className={LINK}>{PUBLIC_TERMS.OFFICIAL_FORECAST}s ↓</a> : null}
        <Link href="/nba/projections/" className={LINK}>Top Boards →</Link>
        <a href={`#${S.results}`} className={LINK}>Results · {PUBLIC_TERMS.MODEL_PERFORMANCE} ↓</a>
      </nav>
      {earlier.length ? (
        <nav aria-label="NBA boards by date" className="nbx-dates">
          <span>Earlier slates:</span>
          {earlier.map((d) => <Link key={d} href={`/nba/projections/${d}/`} prefetch={false}>{shortDate(d)}</Link>)}
        </nav>
      ) : null}
    </section>
  );
}

/** What a card says about the game's Official Forecast, true at build time. Null while the slate's forecast is pending:
 *  the overview says that once, with the first tip-off (overnight W7 2026-10-28: no repeated "not published yet" cards). */
function forecastLine(g: NbaTodayGame, pending: boolean): string | null {
  if (g.favoured) return `${PUBLIC_TERMS.OFFICIAL_FORECAST}: ${g.favoured.name ?? g.favoured.abbr} favoured`;
  if (g.excludedReason) return `${PUBLIC_TERMS.UNAVAILABLE}: ${nbaExclusionText(g.excludedReason)}`;
  if (g.status === "final") return `Final recorded · no ${PUBLIC_TERMS.OFFICIAL_FORECAST} was published for this game.`;
  return pending ? null : `No ${PUBLIC_TERMS.OFFICIAL_FORECAST} for this game.`;
}

/**
 * Today's games: a card per game. The Official Forecast link opens the game's full forecast (favoured side and every
 * player's statistics) on its Game Simulation page when that page is built, else this page's forecast row.
 */
export function NbaTodayGames({ slate, slip, gamePages, lineSummaries }: {
  slate: NbaTodaySlate; slip?: HubSlipLegs; gamePages?: ReadonlySet<string>;
  /** Founder P0 2026-10-29: a compact "model vs sportsbook line" summary per game id (nba-prop-lines.tsx
      nbaPropLineSummaries — undefined while the display switch is off, and a game without a compared line has no entry).
      Absent → each card is exactly the card without it (withLineSummary adds no child slot). */
  lineSummaries?: ReadonlyMap<string, React.ReactNode>;
}) {
  if (!slate.games.length) return null;
  const pending = slate.forecast === "PENDING";
  return (
    <div className="nbx-grid">
      {slate.games.map((g) => withLineSummary(lineSummaries?.get(g.id),
        <MatchupCard key={g.id} favoured={g.favoured?.abbr ?? null} game={{ id: g.id, tipUtc: g.tipUtc, status: g.status, away: { ...g.away, logo: g.away.logoTeam }, home: { ...g.home, logo: g.home.logoTeam } }}>
          {(() => {
            const line = forecastLine(g, pending);
            return g.finalNote || line ? (
              <div className="nbx-read">
                {g.finalNote ? <strong>Final · {g.finalNote}</strong> : null}
                {line ? <p>{line}</p> : null}
              </div>
            ) : null;
          })()}
          {g.favoured || g.theaterHref || gamePages?.has(g.id) || slip?.has(g.id) ? (
            <p className="nbx-acts">
              {gamePages?.has(g.id) ? <Link href={nbaGamePageHrefIfExported(g.id, gamePages)!} prefetch={false} aria-label={nbaGamePageLabel(g.away.abbr, g.home.abbr)} data-nba-game-page={g.id}>{NBA_GAME_PAGE_TEXT}</Link> : null}
              {g.favoured ? <Link href={g.theaterHref ? `${g.theaterHref}#official-predictions` : `#${forecastRowId(g.id)}`} prefetch={false}>{PUBLIC_TERMS.OFFICIAL_FORECAST} →</Link> : null}
              {g.theaterHref ? <Link href={g.theaterHref} prefetch={false} data-nba-theater-link={g.id}>{PUBLIC_TERMS.GAME_SIMULATION} →</Link> : null}
              {/* Vehicle N: only a Level A leg (hub-slip → levelASlipLegFor) — a game without one gets no button */}
              <HubSlipButton leg={slip?.get(g.id)} />
            </p>
          ) : null}
        </MatchupCard>,
      ))}
    </div>
  );
}

/** The card with the summary inserted after its forecast read — or the card itself, untouched, when there is none. */
function withLineSummary(summary: React.ReactNode, card: React.ReactElement<{ children?: React.ReactNode }>) {
  if (summary == null) return card;
  const kids = card.props.children;
  const [read, ...rest] = Array.isArray(kids) ? kids : [kids];
  return React.cloneElement(card, undefined, read, <div className="nbx-read" data-nba-line-summary="">{summary}</div>, ...rest);
}

/**
 * The window's other games, one line each (WEIGHT: ~70 rows on an in-season /nba, HTML + flight — the shared .gtp-cr
 * row classes and the CompactRow crests). Upcoming rows say when the forecast publishes (the adapter's note); played rows print the
 * official final and, beside it, the side that was frozen for that game — only from `forecasts` (that date's committed
 * snapshot), never inferred.
 */
export function NbaGameList({ rows, heading, collapsed = false, forecasts, gamePages }: { rows: HubGameRow[]; heading: string; collapsed?: boolean; forecasts?: ReadonlyMap<string, string>; gamePages?: ReadonlySet<string> }) {
  if (!rows.length) return null;
  const list = (
    <ul className="m-0 p-0 list-none">
      {rows.map((r) => {
        const side = forecasts?.get(String(r.id));
        const page = nbaGamePageHrefIfExported(r.id, gamePages);
        return (
          <li key={r.id} className="gtp-cr">
            <span className="gtp-cr-t">{r.startLabel}</span>
            {/* each side's crest, as the shared CompactRow draws it (PR 1226 markup, decorative, loading=lazy) */}
            <span className="gtp-cr-m">
              {(r.participants ?? []).slice(0, 1).map((p) => p.logoTeam && p.logoSport ? <TeamLogo key={p.name} team={p.logoTeam} sport={p.logoSport} size="sm" ariaLabel="" /> : null)}
              {r.matchup}
              {(r.participants ?? []).slice(1, 2).map((p) => p.logoTeam && p.logoSport ? <TeamLogo key={p.name} team={p.logoTeam} sport={p.logoSport} size="sm" ariaLabel="" /> : null)}
            </span>
            <span className="gtp-cr-s">{hubStatusDisplay(r.status)}</span>
            <span className="gtp-cr-a">
              {r.reportNote}
              {forecasts ? (side ? ` · ${PUBLIC_TERMS.OFFICIAL_FORECAST}: ${side} favoured` : r.started ? ` · no ${PUBLIC_TERMS.OFFICIAL_FORECAST} published` : "") : ""}
            </span>
            {page ? (
              <Link href={page} prefetch={false} className="gtp-hit-44 underline" aria-label={nbaGamePageLabel(r.participants?.[0]?.name, r.participants?.[1]?.name)}>{NBA_GAME_PAGE_TEXT}</Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return collapsed ? (
    <details className="nbx-details">
      <summary>{heading}</summary>
      {list}
    </details>
  ) : (
    <div>
      <h3 className="m-0 mb-1 text-[14px] font-semibold" style={{ color: "var(--vault-text)" }}>{heading}</h3>
      {list}
    </div>
  );
}
