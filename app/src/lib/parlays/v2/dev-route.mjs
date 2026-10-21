/**
 * DEV ROUTE GATE for /dev/parlay-lab-fixture — the same rule as the Simulation Theater dev routes
 * (lib/simulation-theater/dev-routes.mjs on the theater branch; deliberately NOT imported or copied as a file, so the
 * two lanes merge independently): a /dev/** page carries content ONLY when the build or dev server sets
 * GTP_DEV_ROUTES=1. Without it the page calls notFound() before reading anything, so a default or Production build
 * renders only the data-free 404 shell.
 *
 * The fixture route is a single STATIC page (no generateStaticParams), so the Next 14.2.15 empty-params constraint
 * the theater helper works around does not apply here.
 *
 * Pruning: scripts/prune-internal-routes.mjs removes out/dev/ only once the theater branch's DEV_ROUTES sweep is
 * merged; on this branch alone /dev is not in INTERNAL_ROUTES, so the default export can still contain the 404 shell
 * at out/dev/parlay-lab-fixture/ (no fixture data — the gate runs first). See docs/PARLAY_LAB_V2.md.
 */
export const DEV_ROUTES_ENV = "GTP_DEV_ROUTES";

export const parlayFixtureRouteEnabled = (env = process.env) => env?.[DEV_ROUTES_ENV] === "1";
