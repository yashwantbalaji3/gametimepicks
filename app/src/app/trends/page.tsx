/**
 * /trends — NBA player trends (trends slice, 2026-11-09). GATED OFF by default.
 *
 * Ships only when the build sets GTP_NBA_TRENDS_PUBLIC=1 (next.config.mjs defines it as "1" only then, else "0", so the
 * branch below is a compile-time constant). OFF: the view and its loader are never bundled, the page is a 404, and
 * scripts/prune-internal-routes.mjs deletes out/trends/. This replaces the retired /trends → /mlb/board alias.
 * Statically generated from committed files at build time: the official lane (the MODEL PROJECTION reference) and the
 * graders' box scores. No sportsbook line, price or book is read.
 */
import { notFound } from "next/navigation";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/trends/", {
  title: "NBA player trends · GameTime Picks",
  description: "Each NBA player's last 5, 10 and 20 games against tonight's official MODEL PROJECTION median. History, not a probability. Not betting advice.",
  robots: { index: false, follow: false },
});

export default async function TrendsPage() {
  if (process.env.GTP_NBA_TRENDS_PUBLIC === "1") {
    const { loadCurrentLane, loadExperimentalSnapshot } = await import("@/components/nba/experimental-lane");
    const { currentEtDate } = await import("@/lib/freshness");
    const { loadNbaTrends } = await import("@/lib/sports/nba/trends");
    const { default: TrendsSection } = await import("@/components/nba/trends/trends-section");
    const today = currentEtDate();
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden">
        <TrendsSection trends={loadNbaTrends(loadCurrentLane(today) ?? loadExperimentalSnapshot(), today)} />
      </div>
    );
  }
  notFound();
}
