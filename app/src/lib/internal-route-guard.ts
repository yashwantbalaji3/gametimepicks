import { notFound } from "next/navigation";

/**
 * Internal-only route guard — keeps internal surfaces (/ops, /preview/*) OUT of the public
 * static export. The site is `output: "export"`, so every page.tsx is emitted and world-readable
 * by default; `noindex` only asks crawlers not to list it — it does NOT make the URL private.
 *
 * Calling this at the top of an internal page makes the route return 404 in the public build
 * (no HTML is emitted for it). To view these routes locally, build/run with
 * `NEXT_PUBLIC_INTERNAL_ROUTES=1`. The source is preserved either way.
 */
export function guardInternalRoute(): void {
  // Usable in local dev; 404 (no data) in the production export unless explicitly exposed.
  const exposed = process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1";
  if (process.env.NODE_ENV === "production" && !exposed) {
    notFound();
  }
}
