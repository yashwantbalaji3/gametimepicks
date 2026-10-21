/**
 * /nba/simulation/[eventId] — NBA Simulation Theater, PUBLIC CANDIDATE. OFF.
 *
 * Renders the possession-level Theater (research engine, labelled "not the official forecast") beside the OFFICIAL
 * PROJECTION PANEL only when BOTH deliberate acts are done (lib/simulation-theater/nba/possession/public-route.mjs):
 * NBA_THEATER_PUBLIC_ENABLED === true in a reviewed commit citing a recorded founder / release-owner decision (today
 * false — NBA public model output stays blocked by the September preregistration), AND the build sets
 * GTP_NBA_THEATER_PUBLIC=1. next.config.mjs defines `process.env.GTP_NBA_THEATER_PUBLIC` as "1" only when the build
 * sets exactly "1", else "0" (the GTP_NFL_THEATER_PUBLIC pattern), so the branches below are compile-time constants:
 * OFF, the loader, the payload and the island are never part of the build, generateStaticParams yields one inert
 * placeholder that 404s, and scripts/prune-internal-routes.mjs deletes out/nba/simulation/ and its chunks.
 * public-theater-route.test.mjs checks the source; export-boundary.mjs scans out/ (flag-ON allowlist included).
 * Statically generated from committed files at build time; the browser never reads data/internal/**.
 */
import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { NBA_PUBLIC_THEATER_PLACEHOLDER, nbaPublicTheaterOn, nbaPublicTheaterParams } from "@/lib/simulation-theater/nba/possession/public-route.mjs";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const buildFlagOn = () => process.env.GTP_NBA_THEATER_PUBLIC === "1";

export async function generateStaticParams() {
  if (buildFlagOn()) {
    const { possessionRouteEvents } = await import("@/lib/simulation-theater/nba/possession/possession-loader.mjs");
    return nbaPublicTheaterParams(() => possessionRouteEvents(REPO_ROOT));
  }
  return [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
}

export const dynamicParams = false;

const METADATA: Metadata = {
  title: "NBA simulated game · research simulation · GameTime Picks",
  description: "One simulated NBA game, possession by possession, from a research simulation engine — shown beside the official projection, which it never changes. Educational and paper-only.",
  // candidate: kept out of search until the release owner publishes it
  robots: { index: false, follow: false },
};

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  return withRouteMetadata(`/nba/simulation/${params.eventId}/`, METADATA);
}

export default async function NbaSimulationTheaterPage({ params }: { params: { eventId: string } }) {
  if (buildFlagOn() && nbaPublicTheaterOn() && params.eventId !== NBA_PUBLIC_THEATER_PLACEHOLDER) {
    const { loadNbaPossessionTheater } = await import("@/lib/simulation-theater/nba/possession/possession-loader.mjs");
    const { default: NbaPossessionSection } = await import("@/components/simulation-theater/nba/possession/NbaPossessionSection");
    const load = loadNbaPossessionTheater(REPO_ROOT, params.eventId);
    if (!load.ok) notFound();
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
        <NbaPossessionSection load={load} />
      </div>
    );
  }
  notFound();
}
