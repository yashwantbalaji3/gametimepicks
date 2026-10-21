/**
 * NBA SIMULATION THEATER · FEATURE MANIFEST (Lane A-NBA, 2026-10-20). Pure; client-safe.
 *
 * ⛔ GOVERNANCE GATE. Public NBA model output is BLOCKED by the September preregistration
 * (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md: every NBA market stays SHADOW until its preregistered bar is met, and
 * the V1 family runs as CANDIDATE_SHADOW). NBA_THEATER_PUBLIC_ENABLED may be set to `true` ONLY in a reviewed commit that
 * cites a RECORDED release-owner / founder decision permitting public NBA Theater output (an approval file under
 * docs/launch/approvals/, as P242 did for the NFL Theater). Until then it is `false`, and nothing reads it to mount a
 * public route: the NBA Theater, its Projected Final Box Score included, exists only on the dev route
 * /dev/simulation-theater/nba/[eventId] (GTP_DEV_ROUTES=1), which the production prune deletes.
 *
 * Even with the constant `true`, nbaTheaterPublicEnabled() also needs the build to set GTP_NBA_THEATER_PUBLIC=1 exactly,
 * so enabling is two deliberate acts. One public CANDIDATE route reads it (Lane C 2026-10-21): /nba/simulation/[eventId]
 * through possession/public-route.mjs, inert while this constant is false (an OFF build emits a 404 placeholder that
 * the prune deletes). feature-manifest.test.mjs and possession/public-theater-route.test.mjs pin that shape.
 */
// FLIPPED 2026-10-21 by the release owner, citing docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md (founder: possession
// research engine allowed, public presentation conditional on gates G1–G12, all recorded there with SHAs). The second act —
// GTP_NBA_THEATER_PUBLIC=1 in the Production build environment — is still required; without it every build stays OFF.
export const NBA_THEATER_PUBLIC_ENABLED = true;

export const NBA_THEATER_PUBLIC_ENV = "GTP_NBA_THEATER_PUBLIC";

export const NBA_THEATER_PUBLIC_GATE = Object.freeze({
  blockedBy: "September 2026 NBA regular-season preregistration (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md)",
  requires: "a recorded release-owner / founder decision permitting public NBA Theater output, cited in the commit that flips NBA_THEATER_PUBLIC_ENABLED",
  decisionRecorded: true,
  approvalFile: "docs/launch/approvals/NBA_THEATER_PUBLIC_2026-10-21.md",
  route: "/nba/simulation/[eventId] (public, research possession simulation, role C) when GTP_NBA_THEATER_PUBLIC=1; the dev route stays dev-only",
});

/** The NBA Theater features, all private. */
export const NBA_THEATER_FEATURES = Object.freeze({
  theater: Object.freeze({ route: "dev", public: false }),
  boxScore: Object.freeze({ route: "dev", public: false, kind: "selected-run-sample" }),
});

/** True only when the governance constant is true AND the build sets GTP_NBA_THEATER_PUBLIC=1 exactly. */
export const nbaTheaterPublicEnabled = (env = typeof process !== "undefined" ? process.env : {}) =>
  NBA_THEATER_PUBLIC_ENABLED === true && env?.[NBA_THEATER_PUBLIC_ENV] === "1";
