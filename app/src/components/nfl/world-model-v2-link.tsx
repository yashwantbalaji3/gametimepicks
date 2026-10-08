/**
 * The way into a game's World Model V2 page from its Game Time Forecast page. Renders nothing unless the game has a
 * showable artifact (generated before kickoff, ≥ 10,000 worlds, zero inconsistent worlds), so the link can never point
 * at a page the build refused to generate. Worded as a separate, experimental model, never as the forecast.
 */
import path from "node:path";
import Link from "next/link";

import { worldModelArtifactFor } from "@/lib/sports/nfl/world-model-v2/read.mjs";

export default function WorldModelV2Link({ eventId }: { eventId: string }) {
  const a: any = worldModelArtifactFor(path.join(process.cwd(), "public"), eventId);
  if (!a) return null;
  return (
    <div style={{ marginTop: 14, border: "1px solid var(--vault-border-strong)", borderRadius: 12, padding: "10px 14px" }}>
      <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
        World Model V2 · experimental · separate from this forecast
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--vault-text)" }}>
        <Link href={`/nfl/world-model/${eventId}/`} style={{ display: "inline-block", minHeight: 32, paddingTop: 6 }}>
          See {a.run.runs.toLocaleString("en-US")} simulated games where the score and every player line add up
        </Link>
      </p>
    </div>
  );
}
