import type { MetadataRoute } from "next";
import { ROUTE_TABLE } from "@/lib/audits/route-inventory.mjs";
import { researchIndex } from "@/lib/research-pages/projection-store";

/**
 * sitemap.xml (P208 · Release H) — DERIVED from the route inventory, the same table the route
 * guards reconcile against source and export. Public classification only: redirects would send
 * crawlers through hops, internal routes are pruned from the export, and the archive route is a
 * deliberate non-destination. Dynamic event pages are reachable from their listed hubs; listing
 * every dated report here would churn the file daily for no crawl benefit.
 */
export const dynamic = "force-static";

const BASE = "https://gametimepicks.yashwantbalaji.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = Object.entries(ROUTE_TABLE as Record<string, { classification: string; indexable?: boolean }>)
    /* v1.1.3: `indexable: false` routes (the personal family — /saved, /following, /my) are noindex, so
       listing them here told crawlers "index this" and "don't index this" at once. /saved had carried
       that contradiction since P310; /following had no robots directive at all. */
    .filter(([, v]) => v.classification === "public" && v.indexable !== false)
    /* v1.3 fix: a dynamic FAMILY is a route pattern, not a URL. Before this filter the sitemap listed ten literal
       template paths such as /nfl/game/[eventId]/ — every one a 404 for a crawler. */
    .filter(([route, v]) => !(v as { family?: boolean }).family && !route.includes("["))
    .map(([route]) => ({
      url: `${BASE}${route === "/" ? "" : route}/`.replace(/\/\/$/, "/"),
      changeFrequency: route === "/" || route === "/today" ? ("daily" as const) : ("weekly" as const),
    }));
  /* v1.3 Team + Player Research: ONLY research pages the projection marks indexable (meaningful factual content).
     Thin, partial-by-construction and upcoming-only pages are noindex and never listed here. */
  const research = researchIndex()
    .filter((e) => e.indexable)
    .map((e) => ({ url: `${BASE}${e.path}`, changeFrequency: "weekly" as const }));
  return [...routes, ...research];
}
