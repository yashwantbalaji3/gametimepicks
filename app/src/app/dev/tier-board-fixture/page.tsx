/**
 * /dev/tier-board-fixture — DEVELOPMENT ONLY, UNLINKED, NOINDEX. FIXTURE — not real picks, not today's cards.
 *
 * The redesigned Bank Builder / Moonshot hero and featured parlay rendered through the REAL components and the REAL
 * adapter (lib/products/tier-board/view.mjs) over the engine's 2026-11-02 replay sample, tagged `fixture: true`
 * (lib/products/tier-board/__fixtures__). Exists so the leg → player page journey can be exercised in a browser on a
 * day with no real card. Also shows the blocked and insufficient states.
 *
 * GATED like every /dev/** route: content only when the build or dev server sets GTP_DEV_ROUTES=1. Otherwise
 * notFound() runs before the fixture is read, so a default or Production build renders only the data-free 404 shell.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { parlayFixtureRouteEnabled } from "@/lib/parlays/v2/dev-route.mjs";
import ProductHero from "@/components/tier-board/product-hero";
import TierBoardSection, { type TierBoardView } from "@/components/tier-board/tier-board-section";
import ProductDisclosure from "@/components/tier-board/product-disclosure";
import ParlayTierBoard, { type ParlayTiersView } from "@/components/tier-board/parlay-tier-board";
import { tierBoardFromSuggestedCards, parlayTiersFromSuggestedCards } from "@/lib/products/tier-board/view.mjs";
import fixture from "@/lib/products/tier-board/__fixtures__/suggested-cards-2026-11-02.fixture.json";

export const metadata: Metadata = withRouteMetadata("/dev/tier-board-fixture/", {
  title: "Tier board · development fixture",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
});

export default function TierBoardFixturePage() {
  if (!parlayFixtureRouteEnabled()) notFound();
  const bb = tierBoardFromSuggestedCards(fixture, "bank-builder", { allowFixture: true }) as TierBoardView;
  const ms = tierBoardFromSuggestedCards(fixture, "moonshot", { allowFixture: true }) as TierBoardView;
  const blocked: TierBoardView = { ...bb, state: "blocked", featured: null, reasons: [{ scope: "nba", text: "NBA input blocked: today's official forecast was not frozen before the first tip" }] };
  const insufficient: TierBoardView = { ...ms, state: "insufficient", featured: null, reasons: [{ scope: "cross", text: "Insufficient eligible legs: a mixed card needs legs from two sports; today only NBA has a leg with a published probability" }] };
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 overflow-x-hidden flex flex-col gap-8" data-dev-route="tier-board-fixture">
      <p className="m-0 font-mono" style={{ color: "var(--vault-warn)", fontSize: 12 }}>
        DEVELOPMENT FIXTURE · engine replay for 2026-11-02 · not real picks, not today&rsquo;s cards
      </p>
      <div id="fixture-bank-builder">
        <ProductHero product="bank-builder" state={bb.featured?.state ?? bb.state} statusLabel="Fixture" statusNote="2026-11-02 replay" />
        <TierBoardSection board={bb} productName="Bank Builder" />
      </div>
      <div id="fixture-moonshot">
        <ProductHero product="moonshot" state={ms.featured?.state ?? ms.state} statusLabel="Fixture" statusNote="2026-11-02 replay" />
        <TierBoardSection board={ms} productName="Moonshot" />
      </div>
      <div id="fixture-parlay-lab">
        <ParlayTierBoard board={parlayTiersFromSuggestedCards(fixture, { allowFixture: true }) as ParlayTiersView} />
      </div>
      <div id="fixture-blocked"><TierBoardSection board={blocked} productName="Bank Builder" /></div>
      <div id="fixture-insufficient"><TierBoardSection board={insufficient} productName="Moonshot" /></div>
      <ProductDisclosure productName="Bank Builder" />
    </div>
  );
}
