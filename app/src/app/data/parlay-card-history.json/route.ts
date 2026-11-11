/**
 * /data/parlay-card-history.json — the /build tier-performance drawer's data (Parlay Lab tracking, 2026-11-11), emitted as a
 * static file at build time and fetched on demand. GATED inline: with GTP_PARLAY_TRACKING_PUBLIC unset the file is
 * `{"disabled":true}` and no reader is bundled. ON: every frozen card exactly as recorded (legs, frozen forecast
 * version, eligibility at freeze) with its official outcome — no price, payout or odds.
 */
export const dynamic = "force-static";

export async function GET() {
  if (process.env.GTP_PARLAY_TRACKING_PUBLIC === "1") {
    const { levelARecordView } = await import("@/lib/results/nba-level-a-readers");
    const { cardHistory } = await import("@/lib/parlays/tier-tracking.mjs");
    const view = levelARecordView();
    return Response.json({ schema: "gtp.parlay-card-history@1", cards: Object.fromEntries(view.entries.map((e: { id: string }) => [e.id, cardHistory(e)])) });
  }
  return Response.json({ disabled: true });
}
