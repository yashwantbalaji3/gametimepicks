/**
 * TRUTH-001 · PREGAME FORECAST RECOVERY — classify an MLB game whose public full-game forecast was erased after
 * first pitch (pre-f96e91fc94 reruns replaced it with `unavailable`), from IMMUTABLE git history only.
 *
 * Founder rules (2026-10-09): restore only records with verifiable ORIGINAL pregame evidence — timestamp, model
 * and decision version, content hash, values, event identity, publication evidence, as-of cutoff. Never regenerate
 * or use a newer model. A git commit time alone is NOT proof of public availability: a candidate is PUBLISHED only
 * with deployment evidence (a Production deployment that served the revision and was READY before first pitch);
 * otherwise it stays quarantined. Recovered forecasts never enter a public denominator by themselves.
 *
 * Pure: the caller supplies revisions (from `git log` + `git show`), deployments and the hash function.
 */

export const RECOVERY_SCHEMA = "gtp.mlb.pregame-forecast-recovery@1";

export const CLASS = Object.freeze({
  /** A pre-first-pitch public revision exists AND a Production deployment served it before first pitch. */
  PUBLISHED_VERIFIED: "PUBLISHED_VERIFIED",
  /** A pre-first-pitch commit on main exists, but no deployment evidence (yet) shows it was publicly served in time. */
  COMMITTED_UNVERIFIED: "COMMITTED_UNVERIFIED",
  /** The game never had a pregame forecast, or the last pre-pitch revision had already withdrawn it. */
  NOT_ACTUALLY_ERASED: "NOT_ACTUALLY_ERASED",
  /** Every forecast for the game was generated or committed at/after first pitch. */
  UNRECOVERABLE: "UNRECOVERABLE",
});

const unavailable = (g) => !g || g.status === "unavailable" || g.completeness?.level === "unavailable";
const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

/**
 * @param {object} args
 * @param {string} args.firstPitchUtc
 * @param {Array<{sha: string, commitTime: string, fileGeneratedAt: string|null, game: object|null, predictions: object|null}>} args.revisions
 *        every revision of the date's full-game file, OLDEST first, each with this game's entry and the
 *        predictions row from the SAME commit (null when absent)
 * @param {(game: object) => string} args.recomputeHash  stableHash({...game, artifactHash: undefined})
 * @param {Array<{id: string, commitSha: string, readyAt: string, containsCommit: (sha: string) => boolean}>} [args.deployments]
 * @param {number} [args.tightMinutes]  a commit closer than this to first pitch is flagged for review
 */
export function classifyErasedGame({ firstPitchUtc, revisions, recomputeHash, deployments = [], tightMinutes = 5 }) {
  const fp = ms(firstPitchUtc);
  if (fp == null) return { class: CLASS.UNRECOVERABLE, reason: "no first-pitch time" };
  const prePitch = revisions.filter((r) => ms(r.commitTime) != null && ms(r.commitTime) < fp);
  const withForecast = prePitch.filter((r) => !unavailable(r.game) && ms(r.fileGeneratedAt) != null && ms(r.fileGeneratedAt) < fp);
  if (withForecast.length === 0) {
    const anyForecast = revisions.some((r) => !unavailable(r.game));
    return anyForecast
      ? { class: CLASS.UNRECOVERABLE, reason: "every forecast for this game was generated or committed at/after first pitch" }
      : { class: CLASS.NOT_ACTUALLY_ERASED, reason: "no revision ever carried a forecast for this game" };
  }
  const last = prePitch[prePitch.length - 1];
  if (unavailable(last.game)) {
    return { class: CLASS.NOT_ACTUALLY_ERASED, reason: `the last revision committed before first pitch (${last.sha.slice(0, 10)}) had already withdrawn the forecast` };
  }
  // The founder's forecast of record is the LAST pregame forecast verifiably SERVED before first pitch — which may be
  // an earlier revision when the newest pre-pitch commit was never deployed in time. Walk back from the newest.
  const describe = (rec) => {
    const minutesBefore = (fp - ms(rec.commitTime)) / 60000;
    return {
      commit: rec.sha, committedAt: rec.commitTime, fileGeneratedAt: rec.fileGeneratedAt,
      artifactHash: rec.game.artifactHash, hashVerified: true,
      predictionsSameCommitSameHash: rec.predictions != null && rec.predictions.artifactHash === rec.game.artifactHash,
      minutesBeforeFirstPitch: Number(minutesBefore.toFixed(2)), tight: minutesBefore < tightMinutes,
    };
  };
  const newest = withForecast[withForecast.length - 1];
  for (let i = withForecast.length - 1; i >= 0; i -= 1) {
    const rec = withForecast[i];
    if (recomputeHash(rec.game) !== rec.game.artifactHash) {
      return { class: CLASS.UNRECOVERABLE, reason: `stored artifactHash does not recompute at ${rec.sha.slice(0, 10)}` };
    }
    const served = deployments
      .filter((d) => ms(d.readyAt) != null && ms(d.readyAt) < fp && d.containsCommit(rec.sha))
      .sort((a, b) => ms(a.readyAt) - ms(b.readyAt))[0] ?? null;
    if (served) {
      return {
        class: CLASS.PUBLISHED_VERIFIED,
        reason: rec === newest
          ? "served by a Production deployment ready before first pitch"
          : "the newest pre-pitch commit was not served before first pitch; this earlier revision was",
        recovered: describe(rec),
        newerUnservedCommit: rec === newest ? null : describe(newest),
        deployment: { id: served.id, commitSha: served.commitSha, readyAt: served.readyAt },
      };
    }
  }
  return {
    class: CLASS.COMMITTED_UNVERIFIED,
    reason: "committed to main before first pitch, but no Production deployment served any pregame revision of it before first pitch",
    recovered: describe(newest),
    newerUnservedCommit: null,
    deployment: null,
  };
}
