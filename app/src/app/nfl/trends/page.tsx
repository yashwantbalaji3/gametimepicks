/**
 * /nfl/trends — NFL QB trends on the shared Trends board (trends-shared, 2026-11-11). GATED OFF by default.
 *
 * Ships only when the build sets GTP_NFL_TRENDS_PUBLIC=1 (next.config.mjs defines it as "1" only then, else "0", so the
 * branch below is a compile-time constant). OFF: the view and its adapter are never bundled, the page is a 404, and
 * scripts/prune-internal-routes.mjs deletes out/nfl/trends/. Statically generated at build time from committed files: the
 * simulation receipts of record (MODEL PROJECTION), the player-events box scores, eligibility@1 inputs and the official
 * forecast of record (R5). No sportsbook price is read; a line only through the display gate (none qualifies today).
 */
import { notFound } from "next/navigation";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/nfl/trends/", {
  title: "NFL quarterback trends · GameTime Picks",
  description: "Each projected starting quarterback's last 5 and 10 games against this week's MODEL PROJECTION — a model threshold, not a sportsbook line. History, not a probability. Not betting advice.",
  robots: { index: false, follow: false },
});

export default async function NflTrendsPage() {
  if (process.env.GTP_NFL_TRENDS_PUBLIC === "1") {
    const { loadNflTrends } = await import("@/lib/sports/nfl/trends");
    const { default: NflTrendsSection } = await import("@/components/nfl/trends/nfl-trends-section");
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden">
        <NflTrendsSection trends={await loadNflTrends()} />
      </div>
    );
  }
  notFound();
}
