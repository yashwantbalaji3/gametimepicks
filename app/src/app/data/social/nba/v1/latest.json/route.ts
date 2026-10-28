/** /data/social/nba/v1/latest.json — the newest committed NBA slate (gtp-social-nba@1). `stale: true` when it is not today's. */
import { nbaSocialDates, nbaSocialDay } from "@/lib/social/nba-social-data";

export const dynamic = "force-static";

export function GET() {
  const d = nbaSocialDates().at(-1);
  return Response.json((d && nbaSocialDay(d)) ?? { schemaVersion: "gtp-social-nba@1", publication: { status: "NO_LANE" }, events: [] });
}
