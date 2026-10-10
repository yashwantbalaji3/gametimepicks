/**
 * PUBLICATION EVIDENCE — which revision of a forecast the public site actually SERVED before an event started
 * (TRUTH-001, founder decision 4, 2026-10-09). PURE: no fs, no network, no clock.
 *
 * The founder's forecast-of-record rule (Option B): the official public forecast is the revision that was demonstrably
 * served before the real start. A generation time is not publication, and a git commit is not publication either: the
 * evidence is a Production deployment that was READY before the cutoff and whose build carried that revision.
 *
 * THE RULE, per game:
 *   cutoff        = the actual start when it is known; otherwise the EARLIEST scheduled start ever seen (a revised,
 *                   earlier start must not let a later revision count). No start → REFUSED (never invented).
 *   served at the cutoff = the forecast inside the build of the LAST Production deployment that became READY before
 *                   the cutoff (deployments that failed, were canceled or never reached READY serve nothing).
 *   forecast of record = the candidate revision whose content hash equals what that build served, generated before
 *                   the cutoff. Its publishedAt is the READY time of the EARLIEST deployment in the unbroken run of
 *                   deployments, ending at the serving one, that all served those same bytes.
 *
 * FAILS CLOSED (a status, never a guess):
 *   NO_START_TIME            no actual or scheduled start
 *   EVIDENCE_GAP             the deployment record does not cover the cutoff (captured before it, starts after it, or
 *                            holds no READY deployment between its start and the cutoff)
 *   BUILD_UNREADABLE         the serving deployment's build content for the game could not be read
 *   NOT_SERVED               the serving build had no forecast for the game (or an unavailable one)
 *   SERVED_UNMATCHED         the serving build's forecast matches no candidate revision
 *   SERVED_AFTER_GENERATION_CUTOFF the served bytes were generated at/after the cutoff
 *   AMBIGUOUS_NEAR_CUTOFF    a deployment's recorded READY time is within the evidence's uncertainty of the cutoff,
 *                            so which build served at the cutoff cannot be decided (the record's clock is not exact)
 *   PROBE_CONFLICT           a live probe of the production site between the serving READY time and the cutoff saw a
 *                            different build (rollback, alias change, or a deployment missing from the record)
 *
 * Inputs are plain data; the caller resolves the content each deployment's build served (`servedAt(sha)`), so this
 * module never touches git or the network.
 */

export const SERVED_SCHEMA = "gtp.publication-evidence.served-revision@1";

export const STATUS = Object.freeze({
  SERVED: "SERVED",
  NO_START_TIME: "NO_START_TIME",
  EVIDENCE_GAP: "EVIDENCE_GAP",
  BUILD_UNREADABLE: "BUILD_UNREADABLE",
  NOT_SERVED: "NOT_SERVED",
  SERVED_UNMATCHED: "SERVED_UNMATCHED",
  SERVED_AFTER_GENERATION_CUTOFF: "SERVED_AFTER_GENERATION_CUTOFF",
  AMBIGUOUS_NEAR_CUTOFF: "AMBIGUOUS_NEAR_CUTOFF",
  PROBE_CONFLICT: "PROBE_CONFLICT",
});

const ms = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};

/**
 * The cutoff for one event: actual start when known, else the earliest scheduled start ever observed.
 * @param {{ actualStartTime?: string|null, scheduledStarts?: Array<string|null> }} start
 * @returns {{ cutoff: string, basis: "ACTUAL_START"|"EARLIEST_SCHEDULED_START" } | null}
 */
export function eventCutoff(start) {
  const actual = ms(start?.actualStartTime);
  const scheduled = (start?.scheduledStarts ?? []).map(ms).filter((t) => t != null);
  const earliest = scheduled.length ? Math.min(...scheduled) : null;
  // An actual start later than a scheduled one is a delay: the game had not started, so the actual start is the cutoff.
  // An actual start EARLIER than every schedule seen cannot be later than itself — it is still the cutoff.
  if (actual != null) return { cutoff: new Date(actual).toISOString(), basis: "ACTUAL_START" };
  if (earliest != null) return { cutoff: new Date(earliest).toISOString(), basis: "EARLIEST_SCHEDULED_START" };
  return null;
}

/**
 * @param {object} a
 * @param {{ actualStartTime?: string|null, scheduledStarts?: Array<string|null> }} a.start
 * @param {Array<{ id: string, sha: string, readyAt: string|null, state: string }>} a.deployments
 *        Production deployments; only state === "READY" with a readyAt count
 * @param {{ from: string, to: string }} a.evidenceWindow  the interval the deployment record is complete for
 * @param {(sha: string) => ({ ok: true, game: object|null } | { ok: false })} a.servedAt
 *        what the build at `sha` served for this game: ok:false when the build content cannot be read
 * @param {Array<{ id: string, generatedAt: string|null, contentHash: string, modelVersion?: string|null, forecastVersion?: string|null, frozenAt?: string|null }>} a.candidates
 *        every revision of the game's forecast the producer wrote
 * @param {(game: object) => string|null} a.hashOf  content hash of a served game (same function that names candidates)
 * @param {Array<{ at: string, servedSha: string }>} [a.probes]  live probes of the production site's build id
 * @param {(ancestor: string, descendant: string) => boolean} [a.sameBuild]  whether a probe's sha is the serving build
 * @param {number} [a.readyUncertaintyMs]  how far the record's READY times can be from the truth. A deployment READY
 *        within this of the cutoff makes the result AMBIGUOUS_NEAR_CUTOFF (GitHub's record: see the capture script)
 */
export function servedForecastOfRecord({ start, deployments, evidenceWindow, servedAt, candidates, hashOf, probes = [], sameBuild = (x, y) => x === y, readyUncertaintyMs = 0 }) {
  const c = eventCutoff(start);
  if (!c) return { status: STATUS.NO_START_TIME, reason: "no actual or scheduled start time" };
  const cut = ms(c.cutoff);
  const base = { cutoff: c.cutoff, cutoffBasis: c.basis };
  const wFrom = ms(evidenceWindow?.from);
  const wTo = ms(evidenceWindow?.to);
  if (wFrom == null || wTo == null || wTo < cut) {
    return { ...base, status: STATUS.EVIDENCE_GAP, reason: "the deployment record was not captured through the cutoff" };
  }
  const ready = deployments
    .filter((d) => d.state === "READY" && ms(d.readyAt) != null)
    .sort((x, y) => ms(x.readyAt) - ms(y.readyAt) || String(x.id).localeCompare(String(y.id)));
  // The record is complete only inside its window: a deployment before `from` may have been followed by one the
  // record never saw. So the serving deployment must be inside the window, and the walk-back below stays inside it.
  const before = ready.filter((d) => ms(d.readyAt) < cut && ms(d.readyAt) >= wFrom);
  if (!before.length) {
    return wFrom > cut
      ? { ...base, status: STATUS.EVIDENCE_GAP, reason: "the deployment record starts after the cutoff" }
      : { ...base, status: STATUS.EVIDENCE_GAP, reason: "no Production deployment inside the evidence window was READY before the cutoff; one before the window may have been serving" };
  }
  const near = ready.find((d) => Math.abs(ms(d.readyAt) - cut) <= readyUncertaintyMs && ms(d.readyAt) >= wFrom);
  if (near) {
    return { ...base, status: STATUS.AMBIGUOUS_NEAR_CUTOFF, reason: `${near.id} was recorded READY at ${near.readyAt}, within ${readyUncertaintyMs / 1000}s of the cutoff`, deployment: pick(near) };
  }
  const serving = before[before.length - 1];
  // A live probe after the serving deployment became READY and before the cutoff must have seen that same build.
  const conflict = probes.find((p) => ms(p.at) != null && ms(p.at) >= ms(serving.readyAt) && ms(p.at) < cut && !sameBuild(p.servedSha, serving.sha));
  if (conflict) {
    return { ...base, status: STATUS.PROBE_CONFLICT, reason: `a probe at ${conflict.at} saw build ${String(conflict.servedSha).slice(0, 10)}, not the serving deployment ${serving.id}`, deployment: pick(serving) };
  }
  const served = servedAt(serving.sha);
  if (!served?.ok) return { ...base, status: STATUS.BUILD_UNREADABLE, reason: `could not read what ${serving.id} served`, deployment: pick(serving) };
  const unavailable = !served.game || served.game.status === "unavailable";
  if (unavailable) return { ...base, status: STATUS.NOT_SERVED, reason: "the serving build carried no forecast for this game", deployment: pick(serving) };
  const h = hashOf(served.game);
  const rev = candidates.find((r) => r.contentHash === h) ?? null;
  if (!rev) return { ...base, status: STATUS.SERVED_UNMATCHED, reason: "the served forecast matches no recorded revision", deployment: pick(serving), servedHash: h };
  if (!(ms(rev.generatedAt) != null && ms(rev.generatedAt) < cut)) {
    return { ...base, status: STATUS.SERVED_AFTER_GENERATION_CUTOFF, reason: "the served bytes were generated at or after the cutoff", deployment: pick(serving), servedHash: h };
  }
  // publishedAt: walk back over earlier READY deployments while they served the same bytes.
  let first = serving;
  for (let i = before.length - 2; i >= 0; i -= 1) {
    const s = servedAt(before[i].sha);
    if (!s?.ok || !s.game || s.game.status === "unavailable" || hashOf(s.game) !== h) break;
    first = before[i];
  }
  return {
    ...base,
    status: STATUS.SERVED,
    forecastOfRecord: {
      revisionId: rev.id,
      contentHash: h,
      generatedAt: rev.generatedAt,
      frozenAt: rev.frozenAt ?? null,
      publishedAt: first.readyAt,
      deploymentReadyAt: serving.readyAt,
      modelVersion: rev.modelVersion ?? null,
      forecastVersion: rev.forecastVersion ?? null,
    },
    deployment: pick(serving),
    firstServingDeployment: pick(first),
  };
}

const pick = (d) => ({ id: d.id, sha: d.sha, readyAt: d.readyAt });
