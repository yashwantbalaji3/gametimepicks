/**
 * /dev/parlay-lab-fixture — DEVELOPMENT ONLY, UNLINKED, NOINDEX. FIXTURE — not real picks, not real prices.
 *
 * The Parlay Lab V2 tier board and Smart Betslip rendered through the REAL components and the REAL adapter
 * (lib/parlays/v2/recommend.mjs) over fixture cards (lib/parlays/v2/__fixtures__/lab-fixture-page.mjs), so the slip
 * can be exercised in a browser with a QUALIFIED card — which no real day has produced yet. Browser spec:
 * e2e/parlay-lab-v2.spec.ts (opt-in, GTP_PARLAY_E2E=1).
 *
 * GATED like every /dev/** route: content only when the build or dev server sets GTP_DEV_ROUTES=1
 * (lib/parlays/v2/dev-route.mjs). Otherwise notFound() runs before any fixture is built, so a default or Production
 * build renders only the data-free 404 shell. Nothing links here. Nothing is written: the slip is not persisted.
 *
 * URL hooks (this route only): `?now=<ISO>` fixes the reader clock; `?scenario=none` shows the no-qualified day.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { parlayFixtureRouteEnabled } from "@/lib/parlays/v2/dev-route.mjs";
import { buildFixtureModels, FIXTURE_ALLOWED_OPERATORS, FIXTURE_NOW, FIXTURE_PAGE_LABEL } from "@/lib/parlays/v2/__fixtures__/lab-fixture-page.mjs";
import type { ParlayLabV2Model } from "@/components/parlays/v2/TierBoard";
import ParlayLabFixtureClient, { type AddableLeg } from "./fixture-client";

export const metadata: Metadata = withRouteMetadata("/dev/parlay-lab-fixture/", {
  title: "Parlay Lab V2 · development fixture",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
});

export default function ParlayLabFixturePage() {
  if (!parlayFixtureRouteEnabled()) notFound();
  const { qualified, none, addable } = buildFixtureModels();
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 overflow-x-hidden flex flex-col gap-4" data-dev-route="parlay-lab-fixture">
      <h1 className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 800 }}>
        Parlay Lab V2 · development fixture
      </h1>
      <ParlayLabFixtureClient
        qualified={qualified as ParlayLabV2Model}
        none={none as ParlayLabV2Model}
        addable={addable as AddableLeg[]}
        allowedOperators={[...FIXTURE_ALLOWED_OPERATORS]}
        fixtureNow={FIXTURE_NOW}
        label={FIXTURE_PAGE_LABEL}
      />
    </div>
  );
}
