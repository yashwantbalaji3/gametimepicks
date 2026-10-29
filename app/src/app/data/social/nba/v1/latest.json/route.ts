/** /data/social/nba/v1/latest.json — the newest committed NBA slate (gtp-social-nba@1). `stale: true` when it is not today's;
 *  `today.status` says whether today's slate is published, not yet published, or has no games (lib/social/nba-social.mjs). */
import { nbaSocialLatest } from "@/lib/social/nba-social-data";

export const dynamic = "force-static";

export function GET() {
  return Response.json(nbaSocialLatest());
}
