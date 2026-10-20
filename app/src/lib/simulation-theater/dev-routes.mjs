/**
 * DEVELOPMENT ROUTES GATE (founder D2, 2026-10-18: an unlinked development route only).
 *
 * /dev/** pages carry content ONLY when the build sets GTP_DEV_ROUTES=1. Without it:
 *   - generateStaticParams yields NO fixture page (devStaticParams below), and no receipt is even read;
 *   - the page itself 404s (guard in the route), as defense in depth;
 *   - scripts/prune-internal-routes.mjs deletes out/dev/ and its chunks, like /ops and /preview.
 *
 * WHY ONE INERT PLACEHOLDER INSTEAD OF []: Next 14.2.15 refuses an empty generateStaticParams under
 * `output: "export"` — it throws `Page "…" is missing "generateStaticParams()"` whenever the returned list is empty
 * (node_modules/next/dist/build/index.js, `hasGenerateStaticParams = !!prerenderRoutes.length`). Returning [] would
 * therefore BREAK the default and Production builds. So the disabled build returns one placeholder param whose page
 * renders the same data-free 404 shell an internal route renders, and the prune removes it from out/.
 */
export const DEV_ROUTES_ENV = "GTP_DEV_ROUTES";
export const DISABLED_PLACEHOLDER = "dev-routes-disabled";
export const MAX_DEV_PARAMS = 3;

export const devRoutesEnabled = (env = process.env) => env?.[DEV_ROUTES_ENV] === "1";

/**
 * generateStaticParams for a dev route.
 * @param {() => string[]} getIds  called ONLY when dev routes are enabled (so a default build reads no receipt)
 */
export function devStaticParams(getIds, env = process.env) {
  if (!devRoutesEnabled(env)) return [{ eventId: DISABLED_PLACEHOLDER }];
  const ids = getIds().slice(0, MAX_DEV_PARAMS).map(String);
  return ids.length ? ids.map((eventId) => ({ eventId })) : [{ eventId: DISABLED_PLACEHOLDER }];
}

/** The fixture params a build actually emits with content (the placeholder never carries any). */
export const contentParams = (params) => params.filter((p) => p.eventId !== DISABLED_PLACEHOLDER);
