/** /data/social/nba/v1/index.json — the day files this build ships (gtp-social-nba@1). */
import { nbaSocialIndex } from "@/lib/social/nba-social-data";

export const dynamic = "force-static";

export function GET() {
  return Response.json(nbaSocialIndex());
}
