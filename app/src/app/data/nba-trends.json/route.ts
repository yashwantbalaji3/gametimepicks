/**
 * /data/nba-trends.json — the /trends player drawer's data, emitted as a static file at build time (the
 * expired-games.json pattern: a file fetched on demand, never a prop that rides every page). The drawer fetches this
 * literal path only when a reader opens a player.
 *
 * GATED: the flag test is INLINE, so with GTP_NBA_TRENDS_PUBLIC unset the file is `{"disabled":true}` and the loader
 * is never bundled. ON, it carries each player's last 20 measured games (PTS/REB/AST/MIN, from the graders' box
 * scores) and tonight's MODEL PROJECTION medians — no sportsbook line, price or book.
 */
export const dynamic = "force-static";

export async function GET() {
  if (process.env.GTP_NBA_TRENDS_PUBLIC === "1") {
    const { loadCurrentLane, loadExperimentalSnapshot } = await import("@/components/nba/experimental-lane");
    const { currentEtDate } = await import("@/lib/freshness");
    const { loadNbaTrends, trendsDrawerPayload } = await import("@/lib/sports/nba/trends");
    const today = currentEtDate();
    return Response.json(trendsDrawerPayload(loadNbaTrends(loadCurrentLane(today) ?? loadExperimentalSnapshot(), today)));
  }
  return Response.json({ disabled: true });
}
