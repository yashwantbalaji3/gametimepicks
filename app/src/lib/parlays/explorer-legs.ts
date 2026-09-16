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
  /**
   * Carried even though this row is never rendered, because it is still COUNTED — and a count that
   * includes a game already under way overstates what the reader can act on. Without it the start
   * gate below would have to fail closed on every omitted row and silently zero the pool.
   */
  startTime: string | null;
}

/**
 * Has this leg's event started as of `nowIso`? THE ONE START RULE, shared by every surface.
 *
 * `eligible-leg.ts` resolves eligibility with it when the pool is generated; the explorer and the
 * builder re-apply it against the READER's clock, because a static export ages. Measured on
 * production 2026-09-16: the artifact generated 00:06:36Z still listed 40 legs whose games began at
 * 00:10:00Z, and at 00:23Z the explorer rendered them as actionable. Generation-time eligibility is
 * a claim about the moment of generation; only the reader's clock can say whether it still holds.
 *
 * FAIL CLOSED: an unknown or unparseable start counts as STARTED. A leg that cannot be proven
 * pre-event must not be offered — that is the failure this rule exists to prevent, not an edge case.
 */
export function legHasStarted(startTime: string | null | undefined, nowIso: string): boolean {
  if (!startTime) return true;
  const start = Date.parse(startTime);
  const now = Date.parse(nowIso);
  if (Number.isNaN(start) || Number.isNaN(now)) return true;
  return start <= now;
}

/** The legs still pre-event at `nowIso`, by the one rule above. Order is preserved. */
export function pregameOnly<T extends { startTime?: string | null }>(legs: readonly T[], nowIso: string): T[] {
  return legs.filter((l) => !legHasStarted(l.startTime, nowIso));
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
