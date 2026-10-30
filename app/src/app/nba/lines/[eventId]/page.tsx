/**
 * /nba/lines/[eventId] — one NBA game's FULL "model vs. sportsbook line" table (page weight 2026-10-30).
 *
 * A game's per-player table (100–150 rows; each row's HTML is repeated in the RSC flight payload) does not fit the game
 * page's 250 KB nba/simulation/* budget, so it lives here, on its own static page. The game page's Official Forecast
 * panel, the settled game page, /nba/projections (+ dated), the /nba hub cards and /today's NBA rows show a compact
 * summary linking to it.
 *
 * GENERATED ONLY for the games nbaLinesPageIds lists (components/nba/nba-prop-lines.tsx: the NBA line display switch on,
 * and the newest committed lane holding the game has an authorized, decryptable artifact with at least one COMPARED
 * line). Every link to this route is drawn from the same list (nbaPropLinesHref / nbaLinesPageHrefFor), so none dangles.
 * With no such game — every CI build: no display key — the param list is one inert placeholder (a static export may not
 * have an empty list) whose page is a 404, and scripts/prune-internal-routes.mjs deletes it with the route's chunks: the
 * build ships no /nba/lines/ at all.
 *
 * Kept out of search (robots noindex, follow): a per-game data table of quoted sportsbook lines that is superseded every
 * slate, not a durable page; it is never in the sitemap (a dynamic family; sitemap-durable-pages.test.mjs).
 * Same component, gate, source, comparison, direction gate and rounding as before (NbaPropLines); nothing is computed here.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { currentEtDate } from "@/lib/freshness";
import NbaPropLines, { laneHoldingEvent, nbaLinesPageIds, NBA_LINES_PLACEHOLDER } from "@/components/nba/nba-prop-lines";
import { nbaLineSummaryGameLinks } from "@/components/nba/prop-line-game-links";
import { nbaGamePageHrefIfExported } from "@/components/nba/game-page-link.mjs";

export const dynamicParams = false;

export function generateStaticParams() {
  const ids = nbaLinesPageIds();
  return ids.length ? ids.map((eventId) => ({ eventId })) : [{ eventId: NBA_LINES_PLACEHOLDER }];
}

type Team = { abbr?: string | null; name?: string | null };
type Game = { providerEventId: string; away?: Team; home?: Team };

function gameOf(eventId: string) {
  if (eventId === NBA_LINES_PLACEHOLDER) return null;
  const lane = laneHoldingEvent(eventId)();
  const game = lane?.games.find((g) => String(g.providerEventId) === eventId) as Game | undefined;
  return lane && lane.date && game ? { lane, date: lane.date, game } : null;
}
const abbr = (t?: Team) => t?.abbr ?? t?.name ?? "";

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  const found = gameOf(params.eventId);
  const matchup = found ? `${abbr(found.game.away) || "Away"} @ ${abbr(found.game.home) || "Home"}` : "NBA game";
  return withRouteMetadata(`/nba/lines/${params.eventId}/`, {
    title: `${matchup}${found ? ` · ${found.date}` : ""} · Model vs. sportsbook line · NBA player props · GameTime Picks`,
    description: `Every NBA player-prop projection for ${matchup}${found ? ` on ${found.date}` : ""} beside the verified sportsbook line, with the direction and difference where the comparison is shown. A comparison, not a recommendation; not betting advice.`,
    robots: { index: false, follow: true },
  });
}

export default async function NbaGameLinesPage({ params }: { params: { eventId: string } }) {
  const found = gameOf(params.eventId);
  if (!found) notFound();
  const now = new Date();
  const { lane, date, game } = found;
  // back to the game page when it is built (the /nba hub's rule), else to that slate's projections page (always built)
  const gamePage = nbaGamePageHrefIfExported(params.eventId, (await nbaLineSummaryGameLinks(currentEtDate(now))).pages);
  const matchup = `${game.away?.name ?? (abbr(game.away) || "Away")} at ${game.home?.name ?? (abbr(game.home) || "Home")}`;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
      <article className="flex flex-col gap-4" data-nba-lines-page={params.eventId}>
        <nav aria-label="This game" className="nbx-gamenav">
          {gamePage
            ? <Link href={gamePage} prefetch={false} className="gtp-backlink">← Game page · {abbr(game.away)} @ {abbr(game.home)}</Link>
            : <Link href={`/nba/projections/${date}/`} prefetch={false} className="gtp-backlink">← NBA projections · {date}</Link>}
        </nav>
        <header className="flex flex-col gap-1">
          <p className="nbx-kind">NBA · {date} · player props</p>
          <h1 className="m-0 font-display text-[24px] font-extrabold" style={{ color: "var(--vault-text)" }}>{matchup}: model vs. sportsbook line</h1>
        </header>
        <NbaPropLines lane={lane} eventId={params.eventId} asOf={now.toISOString()} id="nba-game-prop-lines" />
      </article>
    </div>
  );
}
