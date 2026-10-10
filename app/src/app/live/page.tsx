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
 * gateway for its own sport — so one sport's outage or empty slate cannot blank the other. EPL has
 * no hub roster and deliberately gets no tab: a tab onto nothing is a claim we cannot keep.
 *
 * UFC (UFC-001) has a roster builder and a hub, and is HIDDEN BY DEFAULT: its roster is built only
 * when this build enables UFC live (`liveSportEnabled("ufc")`, closed unless NEXT_PUBLIC_LIVE_SPORTS
 * names it), so a default build ships neither the tab nor the roster data. The metadata below keeps
 * naming NFL and MLB only, because that is what a default build serves.
 *
 * A /live failure degrades Live, never the product — this route is a leaf. Nothing on /, /today,
 * /mlb, results or any forecast page depends on it.
 */
import Link from "next/link";

import LiveSportTabs from "@/components/live/live-sport-tabs";
import SportChooser, { etDayLabel } from "@/components/sports/sport-chooser";
import { buildHubRoster } from "@/lib/live/hub-data";
import { liveSportEnabled } from "@/lib/live/client";
import { buildNflHubRoster } from "@/lib/live/nfl-hub-data";
import { buildUfcHubRoster } from "@/lib/live/ufc-hub-data";
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
  /* Default closed: no UFC roster is even built — let alone shipped — unless this build enables it. */
  const ufc = liveSportEnabled("ufc") ? buildUfcHubRoster() : null;

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
        Live beta · {etDayLabel(nfl.etDate)}
      </p>

      {/*
        #797 PR C · A QUIET DAY IS NOT A DEAD END. With no NFL or MLB game carrying a published forecast
        for the build day, this page said "No games are scheduled today." — false on 2026-09-29, when four
        MLB postseason games were on the official schedule (they had no simulation yet, so no Live card),
        and it offered nowhere to go. It now says what Live covers, for which dated day, and hands the
        reader the four hubs (each with its dated count or next event) and the day's other surfaces.
      */}
      <LiveSportTabs
        nfl={nfl}
        mlb={mlb}
        ufc={ufc}
        quietDay={
          <div>
            <p style={{ fontSize: 14, color: "var(--vault-text)", lineHeight: 1.6, margin: 0, maxWidth: 680 }}>
              Nothing to follow on Live for {etDayLabel(nfl.etDate)}. Live follows NFL and MLB games that
              carry a published GameTime forecast; a game gets a card here once its forecast is published.
            </p>
            <SportChooser label="Sports and what is next" />
            <p style={{ fontSize: 13.5, margin: "16px 0 0", display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Link href="/today/" style={{ color: "var(--vault-gold)" }}>Today&apos;s games →</Link>
              <Link href="/simulate/" style={{ color: "var(--vault-gold)" }}>Simulations →</Link>
              <Link href="/results/" style={{ color: "var(--vault-gold)" }}>Results →</Link>
            </p>
          </div>
        }
      />

      <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", marginTop: 28, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Paper-only · educational · not betting advice
      </p>
    </div>
  );
}
