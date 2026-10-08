/**
 * /nfl/world-model/[eventId] — NFL World Model V2, EXPERIMENTAL (founder P0 · 2026-10-08). PUBLIC.
 *
 * One page per game with a showable World Model V2 artifact (lib/sports/nfl/world-model-v2/read.mjs: generated before
 * kickoff, ≥ 10,000 worlds, zero inconsistent worlds). No artifact, no page — fail closed.
 *
 * SEPARATE FROM THE FORECAST OF RECORD. /nfl/game/[eventId] keeps the Game Time Forecast and its "expected statistical
 * summaries · not one simulated game" label; this page is the experimental world model and says so.
 * Statically generated from committed files at build time; nothing is computed in the browser.
 */
import type { Metadata } from "next";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";

import WorldModelV2Report from "@/components/nfl/world-model-v2-report";
import { readWorldModelArtifacts, worldModelArtifactFor } from "@/lib/sports/nfl/world-model-v2/read.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

const PUBLIC = path.join(process.cwd(), "public");

export function generateStaticParams() {
  return readWorldModelArtifacts(PUBLIC).map((a: any) => ({ eventId: a.identity.providerEventId }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  const a: any = worldModelArtifactFor(PUBLIC, params.eventId);
  if (!a) return withRouteMetadata(`/nfl/world-model/${params.eventId}/`, { title: "NFL World Model V2 · GameTime Picks" });
  return withRouteMetadata(`/nfl/world-model/${params.eventId}/`, {
    title: `${a.identity.matchup} — World Model V2 (experimental) · GameTime Picks`,
    description: `${a.run.runs.toLocaleString("en-US")} simulated games of ${a.identity.matchup} where score, scoring plays, team volume and player lines all belong to the same game. Experimental; the Game Time Forecast stays the forecast of record. Educational and paper-only.`,
  });
}

export default function NflWorldModelGamePage({ params }: { params: { eventId: string } }) {
  const a: any = worldModelArtifactFor(PUBLIC, params.eventId);
  if (!a) notFound();
  const gameHref = `/nfl/game/${params.eventId}/`;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <p className="font-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: 0 }}>
        <Link href="/nfl/">NFL</Link> · <Link href={gameHref}>{a.identity.matchup}</Link> · <Link href="/nfl/world-model/">World Model V2</Link>
      </p>
      <h1 className="font-display" style={{ fontSize: 30, margin: "6px 0 0", color: "var(--vault-text)" }}>{a.identity.matchup}</h1>
      <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "6px 0 0" }}>
        World Model V2 · experimental · {a.run.runs.toLocaleString("en-US")} simulated games
      </p>
      <WorldModelV2Report a={a} gameHref={gameHref} />
    </div>
  );
}
