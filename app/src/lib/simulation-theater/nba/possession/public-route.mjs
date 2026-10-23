/**
 * NBA SIMULATION THEATER · PUBLIC ROUTE CANDIDATE GATE (/nba/simulation/[eventId]). Pure; no fs.
 *
 * The route exists in the source tree as a CANDIDATE. It renders the possession Theater ONLY when BOTH deliberate acts
 * are done (feature-manifest.mjs): NBA_THEATER_PUBLIC_ENABLED === true (a reviewed commit citing a recorded founder /
 * release-owner decision — today false) AND the build sets GTP_NBA_THEATER_PUBLIC=1 exactly (next.config.mjs defines it
 * as a compile-time "1" / "0", the NFL pattern). Otherwise:
 *   - generateStaticParams yields ONE inert placeholder (Next 14 refuses an empty list under output: "export"; see
 *     dev-routes.mjs) and reads no data;
 *   - the page 404s (it never imports the loader or the island: both sit behind the compile-time branch);
 *   - scripts/prune-internal-routes.mjs deletes out/nba/simulation/ and its chunks.
 * `constantEnabled` exists for tests only (a flag-ON build is simulated by the pure functions; the committed constant
 * stays false).
 */
import { NBA_THEATER_PUBLIC_ENABLED, NBA_THEATER_PUBLIC_ENV } from "../feature-manifest.mjs";

export const NBA_PUBLIC_THEATER_ROUTE = "nba/simulation";
export const NBA_PUBLIC_THEATER_PLACEHOLDER = "nba-theater-disabled";
export const MAX_PUBLIC_THEATER_PARAMS = 15; // the slate size (NBA: ≤ 15 games a night; release owner 2026-10-21)

/** Both acts: the governance constant AND the build flag. */
export function nbaPublicTheaterOn({ constantEnabled = NBA_THEATER_PUBLIC_ENABLED, env = typeof process !== "undefined" ? process.env : {} } = {}) {
  return constantEnabled === true && env?.[NBA_THEATER_PUBLIC_ENV] === "1";
}

/**
 * ENTRY POINTS (release owner 2026-10-21): the event ids the public route ACTUALLY builds — exactly what
 * generateStaticParams publishes, without the inert placeholder. Every link to the Theater (the /nba lane cards) is
 * rendered from this list, so a link exists iff its page does: flag OFF or a game without valid runs → no link.
 */
export function publicTheaterRouteIds(getIds, opts = {}) {
  return nbaPublicTheaterParams(getIds, opts).map((p) => p.eventId).filter((id) => id !== NBA_PUBLIC_THEATER_PLACEHOLDER);
}
export const publicTheaterHref = (eventId) => `/${NBA_PUBLIC_THEATER_ROUTE}/${eventId}/`;
/** Founder directive 2026-10-23 public readiness: the link names a Game Simulation — never "watch the game", never the forecast. */
export const THEATER_LINK_TEXT = "Open the Game Simulation of this game →";

/** generateStaticParams: `getIds` is called ONLY when the gate is on (an OFF build reads nothing). */
export function nbaPublicTheaterParams(getIds, opts = {}) {
  if (!nbaPublicTheaterOn(opts)) return [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
  const ids = getIds().slice(0, MAX_PUBLIC_THEATER_PARAMS).map(String);
  return ids.length ? ids.map((eventId) => ({ eventId })) : [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
}
