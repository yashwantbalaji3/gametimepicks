import type { MetadataRoute } from "next";

/**
 * robots.txt (P208 · Release H). The site never shipped one; crawlers guessed.
 * Internal routes (/ops, /launch, /preview) are pruned from the export entirely, so the public
 * surface IS the allowed surface — but they are disallowed here too, defensively, so a cached or
 * misdeployed copy never invites indexing of operator surfaces.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/ops/", "/launch/", "/preview/"] }],
    sitemap: "https://gametimepicks.yashwantbalaji.com/sitemap.xml",
  };
}
