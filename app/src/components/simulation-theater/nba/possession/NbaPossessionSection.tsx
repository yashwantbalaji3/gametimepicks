/**
 * NBA Simulation Theater · POSSESSION PLAYBACK · server section. Links the shared theater stylesheets and the possession
 * one, and mounts the client island (server-rendered at tip-off, so the page has its panels, scoreboard and box score
 * with no JS). A load that failed its checks renders a refusal: banner, reason, no score and no player line.
 */
import "../../theater.css";
import "../nba-theater.css";
import "./nba-possession.css";
import type { CSSProperties } from "react";
import NbaPossessionTheater from "./NbaPossessionTheater";
import { NBA_THEATER_VARS } from "../nba-theater-css";
import { PossessionBanner, PossessionUnavailable } from "./possession-parts";
import type { PbLoad } from "./possession-types";

export default function NbaPossessionSection({ load, devHooks = false, switchHref = null, switchLabel = null }: { load: PbLoad; devHooks?: boolean; switchHref?: string | null; switchLabel?: string | null }) {
  if (!load.ok || !load.payload || !load.palettes) {
    return (
      <div className="st-root nba-root nbp-root" style={NBA_THEATER_VARS as CSSProperties} data-nbp-theater="" data-nbp-refused={load.error?.code ?? "UNAVAILABLE"}>
        <PossessionBanner />
        <PossessionUnavailable title="Possession playback unavailable" reason={`${load.error?.code ?? "UNAVAILABLE"}: ${load.error?.reason ?? "no data"}`} />
      </div>
    );
  }
  return <NbaPossessionTheater payload={load.payload} palettes={load.palettes} devHooks={devHooks} switchHref={switchHref} switchLabel={switchLabel} />;
}
