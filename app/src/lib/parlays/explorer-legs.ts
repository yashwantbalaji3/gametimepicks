/**
 * The eligible-leg payload contract, shared by the server projection and the client explorer.
 *
 * Program 229 · Release 0. This lives in its own module with NO Node imports because both sides need
 * it: `ui-loader.ts` (server, reads the filesystem) projects the legs, and `parlays-explorer.tsx`
 * (client) renders them. Importing the loader from the client pulled `node:fs` into the browser
 * bundle and webpack refused the build — correctly. A contract two runtimes share cannot live in a
 * module only one of them can load.
 *
 * WHY THE CONTRACT EXISTS. `/build/custom` serialized all 610 eligible legs in full — 549 KB, 65% of
 * the page's client payload — and put the page 97 KB over its budget. The explorer renders at most
 * `EXPLORER_LEG_RENDER_CAP` legs per sport and otherwise resolves a leg only when a card references
 * it, so 481 of those 610 were shipped complete in order to be counted and nothing else.
 *
 * NO RECORD IS LOST. Every leg still travels. Counts, the "+N more" figure and every card lookup are
 * unchanged; a leg nobody displays travels as its identity rather than its full display object.
 */

/**
 * How many eligible legs the marketplace renders per sport.
 *
 * Shared so the projection and the component that slices cannot drift. If this rises, the projection
 * keeps that many full objects automatically — the two numbers are the same number.
 */
export const EXPLORER_LEG_RENDER_CAP = 60;

/**
 * A leg carried for COUNTING only.
 *
 * Marked explicitly rather than inferred from missing fields, so a renderer can refuse one outright
 * instead of drawing a row of blanks if it is ever handed one.
 */
export interface OmittedLegDisplay {
  legId: string;
  sport: string;
  detailOmitted: true;
}

/**
 * True when this row carries identity only and must not be rendered.
 *
 * Typed against `unknown` rather than a shape with an optional flag: a full display object has no
 * property in common with `{ detailOmitted?: boolean }`, so the narrower signature refused every
 * real leg at the call site.
 */
export function isDetailOmitted(l: unknown): l is OmittedLegDisplay {
  return typeof l === "object" && l !== null && (l as OmittedLegDisplay).detailOmitted === true;
}
