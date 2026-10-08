/**
 * /nfl/world-model/[eventId] → /nfl/game/[eventId]/#simulation (founder directive 2026-10-08: one NFL forecast
 * experience). The World Model V2 page launched in #1024 is folded into the game page — simulated outcomes, player
 * projections and sampled games now render there from the same artifact. Links already shared keep working.
 * Client redirect: under `output: "export"` a server redirect emits an error shell (same stub as the other aliases).
 */
import path from "node:path";

import ClientRedirect from "@/components/client-redirect";
import { readWorldModelArtifacts } from "@/lib/sports/nfl/world-model-v2/read.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

const PUBLIC = path.join(process.cwd(), "public");

export function generateStaticParams() {
  return readWorldModelArtifacts(PUBLIC).map((a: any) => ({ eventId: a.identity.providerEventId }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { eventId: string } }) {
  return withRouteMetadata(`/nfl/world-model/${params.eventId}/`, {
    title: "NFL game forecast · GameTime Picks",
    robots: { index: false, follow: true },
    alternates: { canonical: `/nfl/game/${params.eventId}` },
  });
}

export default function WorldModelGameRedirect({ params }: { params: { eventId: string } }) {
  return <ClientRedirect to={`/nfl/game/${params.eventId}/#simulation`} label="the game forecast" />;
}
