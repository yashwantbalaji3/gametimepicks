/**
 * ONE SHARE CARD PER ROUTE (P251 · F1).
 *
 * Every one of 377 pages shipped the root layout's Open Graph block verbatim: the same title, the
 * same description, the same image, and `og:url` pointing at the homepage. Posting tonight's game
 * report to a group chat produced a preview reading "Simulation-Powered Sports Analytics" and
 * sent everyone who tapped it to the front page instead of the game. `rel="canonical"` was absent
 * on every route but two, for the same reason: the metadata object never knew where it lived.
 *
 * The page already writes a good, specific `title` and `description` — the words existed and just
 * never reached the social block. So this takes the page's OWN metadata and fills in what can be
 * derived from it plus one fact the object cannot know: its route.
 *
 * Anything the page sets explicitly wins. This only fills gaps.
 *
 *   export const metadata: Metadata = withRouteMetadata("/nfl/", {
 *     title: "NFL Hub · GameTimePicks",
 *     description: "…",
 *   });
 */
import type { Metadata } from "next";

/** The site-wide social card, used when a route has no image of its own. */
const DEFAULT_IMAGE = "/brand/gametime-picks-og.png";

function plainTitle(t: Metadata["title"]): string | undefined {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const o = t as { absolute?: string; default?: string };
    return o.absolute ?? o.default;
  }
  return undefined;
}

/**
 * @param route the page's own path, with a trailing slash — the export is trailing-slash routed
 *              and production 308s to it, so the canonical must match what a reader lands on.
 * @param meta  the page's existing metadata object, unchanged except for the gaps filled below.
 */
export function withRouteMetadata(route: string, meta: Metadata): Metadata {
  const path = route.endsWith("/") ? route : `${route}/`;
  const title = plainTitle(meta.title);
  const description = typeof meta.description === "string" ? meta.description : undefined;

  /*
   * A page title is written for a browser tab, so it usually carries the site name — "NFL Hub ·
   * GameTimePicks". A share card already shows the site name on its own line, so repeating it
   * inside the headline wastes the only line a reader reads. The suffix is trimmed for social
   * only; the tab keeps it.
   */
  const socialTitle = title?.replace(/\s*[·|—-]\s*GameTime\s?Picks.*$/i, "").trim() || title;

  return {
    ...meta,
    alternates: { canonical: path, ...(meta.alternates ?? {}) },
    openGraph: {
      type: "website",
      siteName: "GameTimePicks",
      locale: "en_US",
      url: path,
      ...(socialTitle ? { title: socialTitle } : {}),
      ...(description ? { description } : {}),
      images: [{ url: DEFAULT_IMAGE, width: 1200, height: 630, alt: socialTitle ?? "GameTimePicks" }],
      ...(meta.openGraph ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(socialTitle ? { title: socialTitle } : {}),
      ...(description ? { description } : {}),
      images: [DEFAULT_IMAGE],
      ...(meta.twitter ?? {}),
    },
  };
}
