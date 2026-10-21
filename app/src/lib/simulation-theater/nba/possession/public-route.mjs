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
export const MAX_PUBLIC_THEATER_PARAMS = 3;

/** Both acts: the governance constant AND the build flag. */
export function nbaPublicTheaterOn({ constantEnabled = NBA_THEATER_PUBLIC_ENABLED, env = typeof process !== "undefined" ? process.env : {} } = {}) {
  return constantEnabled === true && env?.[NBA_THEATER_PUBLIC_ENV] === "1";
}

/** generateStaticParams: `getIds` is called ONLY when the gate is on (an OFF build reads nothing). */
export function nbaPublicTheaterParams(getIds, opts = {}) {
  if (!nbaPublicTheaterOn(opts)) return [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
  const ids = getIds().slice(0, MAX_PUBLIC_THEATER_PARAMS).map(String);
  return ids.length ? ids.map((eventId) => ({ eventId })) : [{ eventId: NBA_PUBLIC_THEATER_PLACEHOLDER }];
}
