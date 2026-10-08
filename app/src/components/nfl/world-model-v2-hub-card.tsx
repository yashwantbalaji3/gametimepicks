/**
 * The NFL hub's way into World Model V2 (founder launch decision 2026-10-08: make it easy to find from the hub). One
 * card, existing styling, no hub redesign. Renders nothing unless at least one game that has not kicked off at build
 * time has a showable artifact, so the hub never advertises an empty board. Worded as experimental and separate from
 * the forecast of record, never as the forecast.
 */
import path from "node:path";
import Link from "next/link";

import { readWorldModelArtifacts } from "@/lib/sports/nfl/world-model-v2/read.mjs";

export default function WorldModelV2HubCard() {
  const now = Date.now();
  const upcoming = readWorldModelArtifacts(path.join(process.cwd(), "public")).filter((a: any) => Date.parse(a.identity.kickoffUtc) > now);
  if (!upcoming.length) return null;
  const first: any = upcoming[0];
  return (
    <section aria-labelledby="nfl-world-model" id="nfl-world-model" className="scroll-mt-24" style={{ border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-warn)", borderRadius: 12, padding: "12px 14px" }}>
      <p className="font-mono" style={{ margin: 0, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
        New · World Model V2 · experimental · not the forecast of record
      </p>
      <h2 id="nfl-world-model" style={{ margin: "4px 0 0", fontSize: 18, color: "var(--vault-text)" }}>
        {first.run.runs.toLocaleString("en-US")} simulated games of every matchup, where the score and every player line add up
      </h2>
      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--vault-text-mute)" }}>
        Win chances counted from the simulated games, scoring plays, team volume and player ranges for {upcoming.length} upcoming {upcoming.length === 1 ? "game" : "games"}. Not yet evaluated on games played after the model was frozen; the Game Time Forecast stays the forecast of record.
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 13.5, display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
        <Link href="/nfl/world-model/" style={{ display: "inline-block", minHeight: 32, paddingTop: 6 }}>World Model V2 Top boards</Link>
        <Link href={`/nfl/world-model/${first.identity.providerEventId}/`} style={{ display: "inline-block", minHeight: 32, paddingTop: 6 }}>Next game: {first.identity.matchup}</Link>
      </p>
    </section>
  );
}
