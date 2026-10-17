/**
 * MLB GRADER · forecast-of-record selection by PUBLICATION EVIDENCE (TRUTH-001, Option B). PROPOSAL — opt-in only.
 *
 * Founder policy (Option B, 2026-10-09): the official public forecast is the revision demonstrably SERVED by a READY
 * Production deployment before the real start. Generation time is not publication; a commit is not publication.
 *
 * The grader's default rule (selectForecastOfRecord: the NEWEST revision GENERATED before the scheduled first pitch)
 * picked a revision the public never saw for 22 verified games and graded 4 forecasts that were never public
 * (data/internal/ops/forecast-of-record-shadow/classification.json). This selector is the switch: it asks the pure
 * resolver (publication-evidence/served-revision.mjs) which revision the serving build carried at the start and
 * returns THAT revision, or a refusal with the resolver's status. A refusal is never a loss and never a guess: the
 * game stays ungraded with its reason until evidence that decides it exists.
 *
 * One extra fail-closed rule, pending the forecast-ledger@1 timing amendment (#1049): a served revision generated
 * after the SCHEDULED start but before the actual one (the 824424 shape) is HELD, because the ledger's eventStart is
 * the scheduled start and is immutable. `allowGeneratedAfterScheduledStart` lifts it only once that amendment is
 * approved.
 *
 * PURE: no fs, no git, no network, no clock. The caller supplies what each deployment's build served.
 */
import { STATUS, servedForecastOfRecord } from "../../publication-evidence/served-revision.mjs";

export const FORECAST_OF_RECORD_RULE = Object.freeze({
  NEWEST_GENERATED: "NEWEST_GENERATED_BEFORE_FIRST_PITCH",
  SERVED: "SERVED_BEFORE_START",
});

export const SELECTOR_REFUSAL = Object.freeze({
  ...STATUS,
  HELD_GENERATED_AFTER_SCHEDULED_START: "HELD_GENERATED_AFTER_SCHEDULED_START",
  SERVED_REVISION_NOT_LOADED: "SERVED_REVISION_NOT_LOADED",
});

const ms = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};

const rowOf = (rev, gamePk) => rev?.byGamePk?.get(gamePk) ?? rev?.byGamePk?.get(String(gamePk)) ?? rev?.byGamePk?.get(Number(gamePk)) ?? null;

/**
 * Candidate revisions of one game, by content hash: the EARLIEST revision carrying each hash (a frozen copy carried
 * forward byte for byte is the same forecast, first published when it was first generated).
 */
export function candidatesForGame(revisions, gamePk) {
  const byHash = new Map();
  const sorted = [...(revisions ?? [])].sort((a, b) => (ms(a.generatedAt) ?? Infinity) - (ms(b.generatedAt) ?? Infinity));
  for (const rev of sorted) {
    const row = rowOf(rev, gamePk);
    if (!row || row.status === "unavailable" || !row.artifactHash) continue;
    if (!byHash.has(row.artifactHash)) {
      byHash.set(row.artifactHash, { id: rev.source, generatedAt: rev.generatedAt, contentHash: row.artifactHash, forecastVersion: row.decisionEngineVersion ?? null });
    }
  }
  return [...byHash.values()];
}

/**
 * Build the per-game selector the grader passes to gradeDate({ selectRevision }).
 *
 * @param {object} a
 * @param {Array<{id: string, sha: string, readyAt: string|null, state: string, createdAt?: string|null}>} a.deployments
 * @param {{from: string, to: string}} a.evidenceWindow     the interval the deployment record is complete for
 * @param {(sha: string, gamePk: number) => ({ok: true, game: object|null} | {ok: false})} a.servedGameAt
 * @param {Map<number, {from: string, to: string}>} [a.actualStartByGamePk]  verified first-pitch interval per game
 * @param {{earlyMs?: number, lateMs?: number}} [a.recordClock]
 * @param {{states?: string[], lagMs?: number}} [a.untrustedStates]
 * @param {Array<{at: string, servedSha: string}>} [a.probes]
 * @param {boolean} [a.allowGeneratedAfterScheduledStart=false]
 * @returns {(gamePk: number, scheduledFirstPitch: string|null, revisions: Array) =>
 *   ({ revision: object, evidence: object } | { refused: { status: string, reason: string }, evidence: object|null })}
 */
export function makeServedRevisionSelector({ deployments, evidenceWindow, servedGameAt, actualStartByGamePk = new Map(), recordClock = null, untrustedStates = null, probes = [], allowGeneratedAfterScheduledStart = false }) {
  return (gamePk, scheduledFirstPitch, revisions) => {
    const actual = actualStartByGamePk.get(gamePk) ?? actualStartByGamePk.get(Number(gamePk)) ?? null;
    const res = servedForecastOfRecord({
      start: {
        scheduledStarts: scheduledFirstPitch ? [scheduledFirstPitch] : [],
        actualStartTime: actual?.from ?? null,
        actualStartPrecisionMs: actual?.from && actual?.to ? Math.max(0, ms(actual.to) - ms(actual.from)) : 0,
      },
      deployments,
      evidenceWindow,
      servedAt: (sha) => servedGameAt(sha, gamePk),
      candidates: candidatesForGame(revisions, gamePk),
      hashOf: (g) => g?.artifactHash ?? null,
      probes,
      ...(recordClock ? { recordClock } : {}),
      ...(untrustedStates ? { untrustedStates } : {}),
    });
    const evidence = {
      rule: FORECAST_OF_RECORD_RULE.SERVED,
      status: res.status,
      cutoff: res.cutoff ?? null,
      cutoffBasis: res.cutoffBasis ?? null,
      deployment: res.deployment ?? null,
      publishedAt: res.forecastOfRecord?.publishedAt ?? null,
      contentHash: res.forecastOfRecord?.contentHash ?? null,
    };
    if (res.status !== STATUS.SERVED) return { refused: { status: res.status, reason: res.reason ?? res.status }, evidence };

    const id = res.forecastOfRecord.revisionId;
    const revision = (revisions ?? []).find((r) => r.source === id) ?? null;
    if (!revision || !rowOf(revision, gamePk)) {
      return { refused: { status: SELECTOR_REFUSAL.SERVED_REVISION_NOT_LOADED, reason: `the served revision ${id} is not among the revisions loaded for grading` }, evidence };
    }
    const sched = ms(scheduledFirstPitch);
    if (!allowGeneratedAfterScheduledStart && sched != null && !(ms(revision.generatedAt) < sched)) {
      return {
        refused: {
          status: SELECTOR_REFUSAL.HELD_GENERATED_AFTER_SCHEDULED_START,
          reason: `served revision ${id} was generated ${revision.generatedAt}, after the scheduled start ${scheduledFirstPitch} (before the actual start): held until the ledger timing amendment is approved`,
        },
        evidence,
      };
    }
    return { revision, evidence };
  };
}
