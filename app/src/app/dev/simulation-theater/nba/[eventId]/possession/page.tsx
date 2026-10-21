/**
 * /dev/simulation-theater/nba/[eventId]/possession — DEVELOPMENT ONLY, UNLINKED, NOINDEX. The possession-level playback
 * of the NBA Simulation Theater (research engine, labelled), beside the official projection panel.
 *
 * Same gate as its parent route (lib/simulation-theater/dev-routes.mjs): content only when the build sets
 * GTP_DEV_ROUTES=1; otherwise the parent yields only the inert placeholder, this page 404s, and the prune deletes
 * out/dev/. Data: the private possession artifact, every stored run re-validated by possession-loader.mjs at build
 * time. The quarter-checkpoint (v1) mode stays at the parent route, linked both ways.
 * Dev-only URL hook: `?run=<default|upset|high|low|overtime>` and `?t=<seconds>` (paused there; deterministic).
 */
import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import NbaPossessionSection from "@/components/simulation-theater/nba/possession/NbaPossessionSection";
import type { PbLoad } from "@/components/simulation-theater/nba/possession/possession-types";
import { DISABLED_PLACEHOLDER, devRoutesEnabled } from "@/lib/simulation-theater/dev-routes.mjs";
import { loadNbaPossessionTheater, possessionRouteEvents } from "@/lib/simulation-theater/nba/possession/possession-loader.mjs";

const REPO_ROOT = path.resolve(process.cwd(), "..");

const DEV_METADATA: Metadata = {
  title: "NBA Simulation Theater · possession playback · development prototype",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  return withRouteMetadata(`/dev/simulation-theater/nba/${params.eventId}/possession/`, DEV_METADATA);
}

export default function NbaPossessionTheaterDevPage({ params }: { params: { eventId: string } }) {
  if (!devRoutesEnabled() || params.eventId === DISABLED_PLACEHOLDER || !possessionRouteEvents(REPO_ROOT).includes(params.eventId)) notFound();
  const load = loadNbaPossessionTheater(REPO_ROOT, params.eventId) as PbLoad;
  return (
    <div className="vault-page-shell" style={{ padding: "16px 16px 48px" }}>
      <NbaPossessionSection load={load} devHooks switchHref={`/dev/simulation-theater/nba/${params.eventId}/`} switchLabel="Quarter-checkpoint mode (v1 supporting simulation)" />
    </div>
  );
}
