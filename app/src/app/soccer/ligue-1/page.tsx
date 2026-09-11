import LeagueForecastPage from "@/components/soccer/league-forecast-page";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/soccer/ligue-1/", {
  title: "Ligue 1 match forecasts · GameTime Picks",
  description:
    "Model-only Ligue 1 forecasts: win/draw/win, expected goals, over 2.5, both teams to score and the likeliest scorelines for the next eight days — with how the model did on a season it had never seen.",
});

export default function Ligue1Page() {
  return <LeagueForecastPage leagueKey="ligue-1" />;
}
