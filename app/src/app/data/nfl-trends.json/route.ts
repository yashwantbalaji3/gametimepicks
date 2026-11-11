/**
 * /data/nfl-trends.json — the /nfl/trends player panel's data, emitted as a static file at build time (fetched on
 * demand, never a prop on every page). GATED inline like /data/nba-trends.json: with GTP_NFL_TRENDS_PUBLIC unset the file
 * is `{"disabled":true}` and the adapter is never bundled. ON, it carries each QB's last 10 measured games and this
 * week's MODEL PROJECTION — no line, no price, no odds (lines live only in page HTML).
 */
export const dynamic = "force-static";

export async function GET() {
  if (process.env.GTP_NFL_TRENDS_PUBLIC === "1") {
    const { loadNflTrends, nflTrendsPanelPayload } = await import("@/lib/sports/nfl/trends");
    return Response.json(nflTrendsPanelPayload(await loadNflTrends()));
  }
  return Response.json({ disabled: true });
}
