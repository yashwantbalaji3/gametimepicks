/**
 * The way into a game's Simulation V2 page from its Game Time Forecast page. Renders nothing unless that game has a
 * showable receipt of record (0 incoherent runs, ≥ 10,000 runs, generated before kickoff), so the link can never
 * point at a page the build refused to generate. Worded as a separate, experimental engine, never as the forecast.
 */
import path from "node:path";
import Link from "next/link";

import { readShadowReceipts, simulationOfRecord } from "@/lib/sports/nfl/sim-v2/public-receipt.mjs";

export default function SimulationV2Link({ eventId }: { eventId: string }) {
  const rec = simulationOfRecord(readShadowReceipts(path.resolve(process.cwd(), "..")), eventId);
  if (!rec?.showable) return null;
  return (
    <div style={{ marginTop: 14, border: "1px solid var(--vault-border-strong)", borderRadius: 12, padding: "10px 14px" }}>
      <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
        Simulation V2 · experimental · separate from this forecast
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--vault-text)" }}>
        <Link href={`/nfl/simulation/${eventId}/`} style={{ display: "inline-block", minHeight: 32, paddingTop: 6 }}>
          See {rec.receipt.runCount.toLocaleString("en-US")} coherent simulated games of this matchup
        </Link>
      </p>
    </div>
  );
}
