/**
 * /dev/challenge-lanes-fixture — DEVELOPMENT ONLY, UNLINKED, NOINDEX. FIXTURE — not real lane records.
 *
 * The four BBM V2 challenge lanes rendered through the REAL components and the REAL acceptance check and view model
 * (lib/products/challenge-lanes/lane.mjs), over the engine's Nov 2 → Nov 3 replay projections re-tagged `fixture: true`,
 * plus SYNTHETIC states the replay cannot reach while P1 is open (ACTIVE on step 2 after a won step 1; LOST awaiting a
 * restart). The site's loader refuses all of them.
 *
 * GATED like every /dev/** route: content only when the build or dev server sets GTP_DEV_ROUTES=1. Otherwise
 * notFound() runs before any fixture is read.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { parlayFixtureRouteEnabled } from "@/lib/parlays/v2/dev-route.mjs";
import LanePair from "@/components/challenge-lanes/lane-pair";
import type { LaneView } from "@/components/challenge-lanes/lane-card";
import { laneView, acceptLaneProjection } from "@/lib/products/challenge-lanes/lane.mjs";
import { readTeamColours } from "@/lib/products/challenge-lanes/load.mjs";
import { syntheticActiveStep2, syntheticLostAwaitingRestart } from "@/lib/products/challenge-lanes/__fixtures__/states.mjs";
import bbA from "@/lib/products/challenge-lanes/__fixtures__/bb-a.fixture.json";
import bbB from "@/lib/products/challenge-lanes/__fixtures__/bb-b.fixture.json";
import msA from "@/lib/products/challenge-lanes/__fixtures__/ms-a.fixture.json";
import msB from "@/lib/products/challenge-lanes/__fixtures__/ms-b.fixture.json";

export const metadata: Metadata = withRouteMetadata("/dev/challenge-lanes-fixture/", {
  title: "Challenge lanes · development fixture",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
});

const view = (doc: unknown): LaneView => {
  const v = acceptLaneProjection(doc, { allowFixture: true });
  if (!v.ok) throw new Error(`fixture lane does not verify: ${v.reason}`);
  return laneView(doc, { teams: readTeamColours() }) as LaneView;
};

export default function ChallengeLanesFixturePage() {
  if (!parlayFixtureRouteEnabled()) notFound();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 overflow-x-hidden flex flex-col gap-4" data-dev-route="challenge-lanes-fixture">
      <p className="m-0 font-mono" style={{ color: "var(--vault-warn, var(--vault-pending))", fontSize: 12 }}>
        DEVELOPMENT FIXTURE · not real lane records · the engine&rsquo;s 2026-11-02 → 11-03 replay · the last two pairs are synthetic
      </p>
      <div id="fixture-bank-builder"><LanePair product="bank-builder" lanes={[view(bbA), view(bbB)]} /></div>
      <div id="fixture-moonshot"><LanePair product="moonshot" lanes={[view(msA), view(msB)]} /></div>
      <div id="fixture-synthetic-bank-builder"><LanePair product="bank-builder" lanes={[view(syntheticActiveStep2(bbA, bbB)), view(syntheticLostAwaitingRestart(bbB, bbA))]} /></div>
      <div id="fixture-synthetic-moonshot"><LanePair product="moonshot" lanes={[view(syntheticActiveStep2(msA, msB)), view(syntheticLostAwaitingRestart(msB, msA))]} /></div>
    </div>
  );
}
