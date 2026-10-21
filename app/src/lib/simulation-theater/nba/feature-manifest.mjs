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
 * so enabling is two deliberate acts. No public page imports this module today (feature-manifest.test.mjs checks).
 */
export const NBA_THEATER_PUBLIC_ENABLED = false;

export const NBA_THEATER_PUBLIC_ENV = "GTP_NBA_THEATER_PUBLIC";

export const NBA_THEATER_PUBLIC_GATE = Object.freeze({
  blockedBy: "September 2026 NBA regular-season preregistration (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md)",
  requires: "a recorded release-owner / founder decision permitting public NBA Theater output, cited in the commit that flips NBA_THEATER_PUBLIC_ENABLED",
  decisionRecorded: false,
  route: "/dev/simulation-theater/nba/[eventId] only (GTP_DEV_ROUTES=1; pruned from production)",
});

/** The NBA Theater features, all private. */
export const NBA_THEATER_FEATURES = Object.freeze({
  theater: Object.freeze({ route: "dev", public: false }),
  boxScore: Object.freeze({ route: "dev", public: false, kind: "selected-run-sample" }),
});

/** True only when the governance constant is true AND the build sets GTP_NBA_THEATER_PUBLIC=1. Today: always false. */
export const nbaTheaterPublicEnabled = (env = typeof process !== "undefined" ? process.env : {}) =>
  NBA_THEATER_PUBLIC_ENABLED === true && env?.[NBA_THEATER_PUBLIC_ENV] === "1";
