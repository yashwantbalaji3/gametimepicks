/**
 * /preview/ncaaf — INTERNAL preview of the NCAAF V1 research lane (NCAAF-008, local only).
 *
 * Unlisted and founder-facing. `guardInternalRoute()` makes it 404 in the production export and
 * `scripts/prune-internal-routes.mjs` deletes `out/preview/` outright. It exists to show what an NCAAF hub
 * looks like inside the SHARED sport-hub shell (same title, event cards, switcher and section order as the
 * NFL/NBA hubs). It is not a proposal to publish: NCAAF is absent from the capability registry and every
 * number here is a private SHADOW forecast from a model that failed its calibration bar.
 */
import HubHeader, { HubTitle } from "@/components/sport-hub/hub-header";
import SportSwitcher from "@/components/sports/sport-switcher";
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { ncaafPreviewHub } from "@/lib/sports/ncaaf/preview-hub";

export const metadata = withRouteMetadata("/preview/ncaaf/", {
  title: "Internal Preview · College Football",
  robots: { index: false, follow: false },
});

const MUTE = "var(--vault-text-mute)";
const TEXT = "var(--vault-text)";

export default function NcaafPreviewPage() {
  guardInternalRoute();
  const model = ncaafPreviewHub(new Date().toISOString());
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      {/* The shared switcher, unchanged: NCAAF has no pill until the shared sport catalog adds one (founder gate). */}
      <SportSwitcher current="ncaaf" />
      <HubTitle model={model} />
      <p className="m-0 max-w-2xl text-[13.5px] leading-relaxed" style={{ color: MUTE }}>
        <span className="font-semibold" style={{ color: TEXT }}>Internal preview: shadow forecasts, not published.</span>{" "}
        Each game&rsquo;s win chance was frozen before kickoff by a scores-only rating model. It is in research:
        it beat a home-field-only baseline on two unseen seasons but missed its calibration bar, so nothing here
        is a GameTimePicks forecast or pick.
      </p>
      <section id="ncaaf-games" className="scroll-mt-24" aria-label="College football games">
        <HubHeader model={model} />
      </section>
      <section id="ncaaf-model-status" className="scroll-mt-24 flex flex-col gap-2" aria-labelledby="ncaaf-model-status-h">
        <h2 id="ncaaf-model-status-h" className="m-0 font-display text-[18px] font-bold" style={{ color: TEXT }}>Model status</h2>
        <ul className="m-0 pl-5 text-[13.5px] leading-relaxed" style={{ color: MUTE }}>
          <li>Game winner: <strong style={{ color: TEXT }}>research</strong>. Elo from final scores only; failed its calibration bar on 2024–25.</li>
          <li>Scores, margin and total: <strong style={{ color: TEXT }}>research</strong>. Totals match real games well; close-game margins (3 and 7) are under-produced, so no spread is priced.</li>
          <li>Players: <strong style={{ color: TEXT }}>not modelled</strong>. No source records who was available before kickoff.</li>
          <li>Inputs: final scores only, with no rosters, injuries, weather or odds. Lines on game pages are shown as captured, for comparison only.</li>
        </ul>
      </section>
    </div>
  );
}
