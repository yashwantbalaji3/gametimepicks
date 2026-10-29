import type { MetadataRoute } from "next";
import { ROUTE_TABLE } from "@/lib/audits/route-inventory.mjs";
import { PLAYER_COMPARE_SPORTS, TEAM_COMPARE_SPORTS, comparePath } from "@/lib/compare/contract.mjs";
import { matchupEntries } from "@/lib/compare/compare-store";
import { researchIndex } from "@/lib/research-pages/projection-store";
import { COMPETITIONS } from "@/lib/sports/catalog";
import { durablePages } from "@/lib/seo/sitemap-durable-pages";

/**
 * sitemap.xml (P208 · Release H) — DERIVED from the route inventory, the same table the route
 * guards reconcile against source and export. Public classification only: redirects would send
 * crawlers through hops, internal routes are pruned from the export, and the archive route is a
 * deliberate non-destination. Live event pages are reachable from their listed hubs; listing
 * every dated report here would churn the file daily for no crawl benefit.
 *
 * Batch 1 · #10: SETTLED game pages are durable (the URL outlives its game), so they ARE listed — from the same id
 * sources their generateStaticParams use (lib/seo/sitemap-durable-pages.ts), each with its event date as <lastmod>.
 * No other entry carries <lastmod>: a static route has no deterministic data date, and build time is not one.
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
  /* v1.4 Compare: the indexable tool SHELLS only (never a pair query — every query state shares its shell's canonical;
     the EPL team shell is a noindex blocked state) and the Matchup Explorer pages the registry marks indexable. */
  const compare = [
    ...TEAM_COMPARE_SPORTS.map((s) => comparePath("team", s)),
    ...PLAYER_COMPARE_SPORTS.map((s) => comparePath("player", s)),
  ].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly" as const }));
  const matchups = (["NFL", "MLB"] as const)
    .flatMap((s) => matchupEntries(s))
    .filter((e) => e.indexable)
    .map((e) => ({ url: `${BASE}${e.path}`, changeFrequency: "weekly" as const }));
  /* UX-001 phase 2: every sport hub in the catalog. A competition served by a FAMILY route (Ligue 1 at /soccer/[league])
     is skipped by the family filter above, so it was linked from every menu and absent here. Added once, by URL. */
  const listed = new Set(routes.map((r) => r.url));
  const hubs = COMPETITIONS.map((c) => `${BASE}${c.href}/`).filter((u) => !listed.has(u))
    .map((url) => ({ url, changeFrequency: "weekly" as const }));
  const durable = durablePages()
    .map((p) => ({ url: `${BASE}${p.path}`, ...(p.lastModified ? { lastModified: p.lastModified } : {}), changeFrequency: "monthly" as const }));
  return [...routes, ...hubs, ...research, ...compare, ...matchups, ...durable];
}
