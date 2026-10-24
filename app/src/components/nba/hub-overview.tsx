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
 */
import Link from "next/link";
import { nbaExclusionText, type NbaTodayGame, type NbaTodaySlate } from "@/lib/sport-hub/nba-hub";
import { hubStatusDisplay, type HubGameRow } from "@/lib/sport-hub/contract";
import { MatchupCard, forecastRowId } from "@/components/nba/experimental-lane";
import { PUBLIC_TERMS } from "@/lib/public-registry";

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
          <>
            <strong>Today&rsquo;s {PUBLIC_TERMS.OFFICIAL_FORECAST} is not published yet.</strong> It is frozen before tip-off and appears here
            once published: the favoured side and {PUBLIC_TERMS.PLAYER_STATISTICS}. Until then the games below show the schedule only.
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

/** What a card says about the game's Official Forecast, true at build time. */
function forecastLine(g: NbaTodayGame, pending: boolean): string {
  if (g.favoured) return `${PUBLIC_TERMS.OFFICIAL_FORECAST}: ${g.favoured.name ?? g.favoured.abbr} favoured`;
  if (g.excludedReason) return `${PUBLIC_TERMS.UNAVAILABLE}: ${nbaExclusionText(g.excludedReason)}`;
  if (g.status === "final") return `Final recorded · no ${PUBLIC_TERMS.OFFICIAL_FORECAST} was published for this game.`;
  return pending ? `${PUBLIC_TERMS.OFFICIAL_FORECAST} not published yet — it is frozen before tip-off.` : `No ${PUBLIC_TERMS.OFFICIAL_FORECAST} for this game.`;
}

/**
 * Today's games: a card per game. The Official Forecast link opens the game's full forecast (favoured side and every
 * player's statistics) on its Game Simulation page when that page is built, else this page's forecast row.
 */
export function NbaTodayGames({ slate }: { slate: NbaTodaySlate }) {
  if (!slate.games.length) return null;
  const pending = slate.forecast === "PENDING";
  return (
    <div className="nbx-grid">
      {slate.games.map((g) => (
        <MatchupCard key={g.id} favoured={g.favoured?.abbr ?? null} game={{ id: g.id, tipUtc: g.tipUtc, status: g.status, away: { ...g.away, logo: g.away.logoTeam }, home: { ...g.home, logo: g.home.logoTeam } }}>
          <div className="nbx-read">
            {g.finalNote ? <strong>Final · {g.finalNote}</strong> : null}
            <p>{forecastLine(g, pending)}</p>
          </div>
          {g.favoured || g.theaterHref ? (
            <p className="nbx-acts">
              {g.favoured ? <Link href={g.theaterHref ? `${g.theaterHref}#official-predictions` : `#${forecastRowId(g.id)}`} prefetch={false}>{PUBLIC_TERMS.OFFICIAL_FORECAST} →</Link> : null}
              {g.theaterHref ? <Link href={g.theaterHref} prefetch={false} data-nba-theater-link={g.id}>{PUBLIC_TERMS.GAME_SIMULATION} →</Link> : null}
            </p>
          ) : null}
        </MatchupCard>
      ))}
    </div>
  );
}

/**
 * The window's other games, one line each (WEIGHT: ~70 rows on an in-season /nba, HTML + flight — the shared .gtp-cr
 * row classes, no crests). Upcoming rows say when the forecast publishes (the adapter's note); played rows print the
 * official final and, beside it, the side that was frozen for that game — only from `forecasts` (that date's committed
 * snapshot), never inferred.
 */
export function NbaGameList({ rows, heading, collapsed = false, forecasts }: { rows: HubGameRow[]; heading: string; collapsed?: boolean; forecasts?: ReadonlyMap<string, string> }) {
  if (!rows.length) return null;
  const list = (
    <ul className="m-0 p-0 list-none">
      {rows.map((r) => {
        const side = forecasts?.get(String(r.id));
        return (
          <li key={r.id} className="gtp-cr">
            <span className="gtp-cr-t">{r.startLabel}</span>
            <span className="gtp-cr-m">{r.matchup}</span>
            <span className="gtp-cr-s">{hubStatusDisplay(r.status)}</span>
            <span className="gtp-cr-a">
              {r.reportNote}
              {forecasts ? (side ? ` · ${PUBLIC_TERMS.OFFICIAL_FORECAST}: ${side} favoured` : r.started ? ` · no ${PUBLIC_TERMS.OFFICIAL_FORECAST} published` : "") : ""}
            </span>
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
