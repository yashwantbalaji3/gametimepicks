import type { MetadataRoute } from "next";
import { ROUTE_TABLE } from "@/lib/audits/route-inventory.mjs";

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
  return Object.entries(ROUTE_TABLE as Record<string, { classification: string }>)
    .filter(([, v]) => v.classification === "public")
    .map(([route]) => ({
      url: `${BASE}${route === "/" ? "" : route}/`.replace(/\/\/$/, "/"),
      changeFrequency: route === "/" || route === "/today" ? ("daily" as const) : ("weekly" as const),
    }));
}
