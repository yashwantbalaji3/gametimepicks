import type { MetadataRoute } from "next";

import { OS_CHROME_GROUND } from "@/lib/brand-chrome";

/**
 * WEB APP MANIFEST (P251 · F13).
 *
 * Without this, "Add to Home Screen" produced a screenshot thumbnail and opened the site in
 * browser chrome — the one install path a product with no accounts actually has. The colours are
 * the app's own ground and accent, so a launched window matches the site it launches.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameTime Picks — simulations, picks and settled results",
    short_name: "GameTime Picks",
    description:
      "Pre-event simulations for MLB, NFL, the Premier League and UFC, with every forecast frozen before kickoff and graded against the official result.",
    start_url: "/today/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: OS_CHROME_GROUND,
    theme_color: OS_CHROME_GROUND,
    categories: ["sports", "utilities"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
