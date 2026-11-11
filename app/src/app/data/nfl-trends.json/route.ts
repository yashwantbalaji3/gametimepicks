/**
 * /data/nfl-trends.json — the /nfl/trends player panel's data, emitted as a static file at build time (fetched on
 * demand, never a prop on every page). GATED inline like /data/nba-trends.json: with GTP_NFL_TRENDS_PUBLIC unset the file
 * is `{"disabled":true}` and the adapter is never bundled. ON, it carries each QB's last 10 measured games and this
 * week's MODEL PROJECTION, plus his settled games (frozen projection · final · grade row, lib/sports/nfl/qb-results.ts) —
 * no line, no price, no odds (lines live only in page HTML).
 */
export const dynamic = "force-static";

export async function GET() {
  if (process.env.GTP_NFL_TRENDS_PUBLIC === "1") {
    const { loadNflTrends, nflTrendsPanelPayload } = await import("@/lib/sports/nfl/trends");
    // settled games (frozen projection · final · grade row) per QB — #1314's graded-against hook bound to the repo root
    const { loadQbResultsFor } = await import("@/lib/sports/nfl/qb-results");
    const { gradedAgainstFor } = await import("@/lib/sports/nfl/served-grade-io.mjs");
    const path = await import("node:path");
    const root = path.resolve(process.cwd(), "..");
    const payload = nflTrendsPanelPayload(await loadNflTrends());
    for (const [id, p] of Object.entries(payload.players)) p.results = await loadQbResultsFor(id, p.games.map((g) => g.eventId), (e) => gradedAgainstFor(root, e));
    return Response.json(payload);
  }
  return Response.json({ disabled: true });
}
