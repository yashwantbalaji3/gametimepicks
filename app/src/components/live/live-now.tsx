/**
 * Server half of LIVE NOW: resolves, at build time, the canonical page each live game may link to (only pages that
 * exist in this export — never a guessed URL), then hands the client strip its sports and links. The strip itself
 * decides, at view time, which games are live.
 */
import path from "node:path";

import LiveNowStrip from "@/components/live/live-now-strip";
import { buildHubRoster } from "@/lib/live/hub-data";
import { loadForecastViews } from "@/lib/sports/nfl/forecast-view-load.mjs";

type Sport = "nfl" | "mlb";

export function liveNowHrefs(sports: Sport[]): Record<string, string> {
  const hrefs: Record<string, string> = {};
  if (sports.includes("nfl")) {
    for (const v of loadForecastViews(path.join(process.cwd(), "public")) as Array<{ providerEventId: string; simulation: unknown }>) {
      hrefs[`nfl:${v.providerEventId}`] = `/nfl/game/${v.providerEventId}/${v.simulation ? "#players" : ""}`;
    }
  }
  if (sports.includes("mlb")) {
    for (const g of buildHubRoster().games) hrefs[`mlb:${g.gamePk}`] = g.href;
  }
  return hrefs;
}

export default function LiveNow({ sports }: { sports: Sport[] }) {
  return <LiveNowStrip sports={sports} hrefs={liveNowHrefs(sports)} />;
}
