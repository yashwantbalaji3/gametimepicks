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
 * SCOPE. MLB only, because the server allowlist is MLB only. There is no client path that can ask
 * for another sport: the hook is typed to "mlb" and the gateway would refuse anything else anyway.
 *
 * A /live failure degrades Live, never the product — this route is a leaf. Nothing on /, /today,
 * /mlb, results or any forecast page depends on it.
 */
import LiveHub from "@/components/live/live-hub";
import { buildHubRoster } from "@/lib/live/hub-data";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/live/", {
  /* Truthful and sport-honest: MLB is the only sport with public live tracking today, so the
     description does not advertise NFL/EPL/UFC Live while they are unavailable (§12). */
  title: "Live · MLB scores and frozen GameTime forecasts · GameTime Picks",
  description:
    "Live MLB scores and game state, shown beside the GameTime forecast made before first pitch — which stays frozen while the game is played. Educational, paper-only.",
  alternates: { canonical: "/live" },
});

const MONO = "var(--font-mono)";

export default function LivePage() {
  const roster = buildHubRoster();

  return (
    <main className="mx-auto px-4 py-8 sm:py-10" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px,5vw,36px)", color: "var(--vault-text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
        Live
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--vault-text-mute)", lineHeight: 1.6, maxWidth: 680, margin: "0 0 4px" }}>
        Today&apos;s MLB games, with what the live source reports right now beside the GameTime
        forecast made before first pitch. The forecast is frozen — it does not change while a game is
        played, and nothing here is recalculated during the game.
      </p>
      <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 18px" }}>
        Live beta · MLB · {roster.etDate}
      </p>

      <LiveHub roster={roster} />

      <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginTop: 28, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Paper-only · educational · not betting advice
      </p>
    </main>
  );
}
