/**
 * /soccer/<league> — ONE page for every soccer competition that may publish (Soccer V2 · C-3).
 *
 * The competitions come from the league registry (lib/sports/soccer/leagues.mjs soccerLeaguePages): a
 * registered /soccer/<key> route AND a publishing stage. Today that is Ligue 1 only — the same page it had
 * at its own static route, now reached through the registry so the next accepted league needs no new route.
 */
import type { Metadata } from "next";

import LeagueForecastPage from "@/components/soccer/league-forecast-page";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { soccerLeaguePages } from "@/lib/sports/soccer/leagues.mjs";

export function generateStaticParams() {
  return soccerLeaguePages().map((l) => ({ league: l.key }));
}
export const dynamicParams = false;

export function generateMetadata({ params }: { params: { league: string } }): Metadata {
  const l = soccerLeaguePages().find((x) => x.key === params.league);
  const name = l?.name ?? "Soccer";
  return withRouteMetadata(`/soccer/${params.league}/`, {
    title: `${name} match forecasts · GameTime Picks`,
    description:
      `Model-only ${name} forecasts: win/draw/win, expected goals, over 2.5, both teams to score and the likeliest scorelines for the next eight days — with how the model did on a season it had never seen.`,
  });
}

export default function SoccerLeaguePage({ params }: { params: { league: string } }) {
  return <LeagueForecastPage leagueKey={params.league} />;
}
