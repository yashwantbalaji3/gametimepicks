/**
 * /dev/simulation-theater/nba/[eventId] — DEVELOPMENT ONLY, UNLINKED, NOINDEX. The NBA Simulation Theater prototype.
 *
 * Plays one representative sample of one nba-sim-v1 game at quarter-checkpoint level. The data is the COMMITTED PRIVATE
 * v1 RECEIPT for the slate (lib/simulation-theater/nba/loader.mjs NBA_THEATER_SOURCE), each game's receipt stamp verified
 * (receiptIntegrity) before use. The default run is the OFFICIAL REPRESENTATIVE SIMULATION (the stored sample closest to
 * the receipt's official expectations); the others are labelled hypothetical what-ifs. A slate game the committed receipt
 * does not hold yet renders "No official forecast receipt for this game yet" — never a fixture in its place.
 *
 * Same gate as the NFL dev route (lib/simulation-theater/dev-routes.mjs): pages exist in the static export ONLY when the
 * build sets GTP_DEV_ROUTES=1 (≤ 3 events). Otherwise generateStaticParams yields only the inert placeholder (and reads
 * no data), the page 404s, and scripts/prune-internal-routes.mjs deletes out/dev/ (this route included). Nothing links
 * here. Nothing is written.
 *
 * Dev-only URL hook: `?run=<runIndex>` or `?label=<label>`, and `?t=<seconds>` (paused there; deterministic).
 */
import type { Metadata } from "next";
import path from "node:path";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import NbaTheaterSection from "@/components/simulation-theater/nba/NbaTheaterSection";
import type { NbaLoad } from "@/components/simulation-theater/nba/nba-types";
import { FIXTURE_BANNER } from "@/lib/simulation-theater/nba/adapter-nba-sim-v1.mjs";
import { DISABLED_PLACEHOLDER, devRoutesEnabled, devStaticParams } from "@/lib/simulation-theater/dev-routes.mjs";
import { loadNbaTheater, nbaRouteEvents } from "@/lib/simulation-theater/nba/loader.mjs";

const REPO_ROOT = path.resolve(process.cwd(), "..");

export function generateStaticParams() {
  return devStaticParams(() => nbaRouteEvents(REPO_ROOT));
}

export const dynamicParams = false;

const DEV_METADATA: Metadata = {
  title: "NBA Simulation Theater · development prototype",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export function generateMetadata({ params }: { params: { eventId: string } }): Metadata {
  return withRouteMetadata(`/dev/simulation-theater/nba/${params.eventId}/`, DEV_METADATA);
}

export default function NbaSimulationTheaterDevPage({ params }: { params: { eventId: string } }) {
  if (!devRoutesEnabled() || params.eventId === DISABLED_PLACEHOLDER || !nbaRouteEvents(REPO_ROOT).includes(params.eventId)) notFound();
  const load = loadNbaTheater(REPO_ROOT, params.eventId) as NbaLoad;
  return (
    <div className="vault-page-shell" style={{ padding: "16px 16px 48px" }}>
      {/* the fixture banner text is passed explicitly: the section refuses to render a fixture without it */}
      <NbaTheaterSection load={load} fixtureBanner={load.manifest?.fixture ? FIXTURE_BANNER : null} devHooks />
    </div>
  );
}
