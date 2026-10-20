/**
 * NBA Simulation Theater · server section. Links the shared theater stylesheet and the NBA one, applies the FIXTURE GATE,
 * and mounts the client island (server-rendered at t = 0, so the page has its court, scoreboard and outcomes with no JS).
 *
 * FIXTURE GATE (nba-gate.ts): a manifest marked `fixture: true` renders ONLY when the caller passes the exact
 * FIXTURE_BANNER text, and then always under that banner. Anything else renders a refusal and no court, score or player
 * line (nba-theater.test.mjs renders both cases; the island re-checks).
 */
import "../theater.css";
import "./nba-theater.css";
import type { CSSProperties } from "react";
import NbaTheaterIsland from "./NbaTheaterIsland";
import { NBA_THEATER_VARS } from "./nba-theater-css";
import { NbaUnavailable, PrivateCandidateBanner } from "./nba-parts";
import { fixtureGate } from "./nba-gate";
import type { NbaLoad } from "./nba-types";

export default function NbaTheaterSection({ load, fixtureBanner, devHooks = false }: { load: NbaLoad; fixtureBanner?: string | null; devHooks?: boolean }) {
  const gate = fixtureGate(load, fixtureBanner);
  if (!gate.ok || !load.manifest || !load.palettes) {
    return (
      <div className="st-root nba-root" style={NBA_THEATER_VARS as CSSProperties}>
        <PrivateCandidateBanner />
        <NbaUnavailable title={load.manifest?.fixture ? "Refused: test fixture without its banner" : "NBA theater unavailable"} reason={gate.reason ?? "unavailable"} />
      </div>
    );
  }
  return <NbaTheaterIsland manifest={load.manifest} palettes={load.palettes} fixtureBanner={fixtureBanner ?? null} devHooks={devHooks} />;
}
