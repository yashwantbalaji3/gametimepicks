/**
 * /live — the public Live hub (v1.1.1 · Deliverable A). PUBLIC.
 *
 * Answers one question: what is happening right now on GameTimePicks?
 *
 * SHAPE. The page is statically exported like every other route; the roster (canonical URLs,
 * matchups, first pitches, frozen forecast bands, settlement rows) is read at build time, and the
 * only moving part — score, inning, state, freshness — arrives at read time from ONE batch call to
 * the Live gateway. Nothing on this page fetches per card.
 *
 * ⚠ THIS PAGE MAKES NO CLAIM ABOUT THE PRESENT AT BUILD TIME. It lists the day's games and their
 * schedule facts; whether any of them has started is answered by the envelope on the READER's
 * clock. A static page that asserts "live" is the Phase 6 defect, and the roster carries no such
 * field to assert with.
 *
 * SCOPE. NFL and MLB. Each sport has its OWN roster builder and its own hub, and each asks the
 * gateway for its own sport — so one sport's outage or empty slate cannot blank the other. UFC and
 * EPL have no hub roster yet and deliberately get no tab: a tab onto nothing is a claim we cannot
 * keep.
 *
 * A /live failure degrades Live, never the product — this route is a leaf. Nothing on /, /today,
 * /mlb, results or any forecast page depends on it.
 */
import LiveSportTabs from "@/components/live/live-sport-tabs";
import { buildHubRoster } from "@/lib/live/hub-data";
import { buildNflHubRoster } from "@/lib/live/nfl-hub-data";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/live/", {
  /* Truthful and sport-honest: NFL and MLB are the sports with a public live roster, so the
     description names those two and does not advertise EPL/UFC Live while they are unavailable. */
  title: "Live · NFL and MLB scores beside frozen GameTime forecasts · GameTime Picks",
  description:
    "Live NFL and MLB scores and game state, shown beside the GameTime forecasts made before kickoff — which stay frozen while the game is played. Educational, paper-only.",
  alternates: { canonical: "/live" },
});

const MONO = "var(--font-mono)";

export default function LivePage() {
  const mlb = buildHubRoster();
  const nfl = buildNflHubRoster();

  return (
    <div className="mx-auto px-4 py-8 sm:py-10" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px,5vw,36px)", color: "var(--vault-text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
        Live
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.6, maxWidth: 680, margin: "0 0 4px" }}>
        Follow GameTimePicks forecasts as the games happen. Every forecast below was made before
        kickoff and is frozen — it does not change while a game is played, and nothing here is
        recalculated during the game.
      </p>
      <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 18px" }}>
        Live beta · {nfl.etDate}
      </p>

      <LiveSportTabs nfl={nfl} mlb={mlb} />

      <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginTop: 28, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Paper-only · educational · not betting advice
      </p>
    </div>
  );
}
