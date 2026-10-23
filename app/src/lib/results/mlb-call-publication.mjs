/**
 * MLB GAME CALLS · PUBLICATION STATUS AT PREDICTION TIME (independent audit 2026-10-23, F05). Pure.
 *
 * THE DEFECT. /results counted every graded MLB winner, run-line and total call as a public forecast. But the
 * live-record gate (lib/ops/live-record-gate.mjs) pauses a call family on the site while its live record is below a
 * coin flip — the total since 2026-09-14, the winner call for a day on 2026-09-18 — and the grader keeps grading the
 * paused calls underneath. Those calls were never shown as picks, yet they sat in the "Public forecasts" record.
 *
 * THE RULE. A call's publication status is what the Production build live AT FIRST PITCH showed — the founder's
 * forecast-of-record standard (Option B: what was served before the real start). Decided from evidence:
 *   PUBLIC      shown on the site: every build that could have been live at first pitch had the call live.
 *   PAUSED      held back on the site: every such build had the call paused by the gate.
 *   NOT_SERVED  the game's forecast was never on the site before first pitch (Production deployment evidence,
 *               data/internal/ops/forecast-of-record-shadow/classification.json · verifiedNeverPublic).
 *   UNKNOWN     the evidence cannot decide — never guessed, never dropped:
 *                 BEFORE_CALL_SURFACE   the live build may predate the call surface (it reached main 2026-07-24 18:18Z)
 *                 PAUSE_CHANGED         the builds that could have been live disagree (a pause began or ended)
 *                 AFTER_RECORDED_HISTORY  after the committed history below, and the current scorecard cannot vouch
 *                                       that nothing changed since
 *                 NO_TIMESTAMPS         the row has no first pitch
 *
 * "Could have been live": when the deployment evidence names the build that served the game (classification.json
 * `deployment.readyAt`), that build, made up to DEPLOY_LATENCY before it was READY. Otherwise any build made in the
 * SERVED_BUILD_LOOKBACK before first pitch. Each build read the newest scorecard committed before it was made; the
 * gate pauses family F when the build has F's gate code, its scorecard marks F BREACHED, and that scorecard is at most
 * 72 h old (pausedFamiliesFrom). Every possibility is checked; they must agree.
 *
 * Nothing is regraded, deleted or moved between dates: this only says which record a graded row belongs to.
 * The history is derived from git by scripts/results/derive-mlb-call-publication-history.mjs, and
 * mlb-call-publication.test.mjs proves this copy equals that derivation whenever the clone has the history.
 */

/** Graded-ledger market → live-record gate family. */
export const MLB_CALL_FAMILY = Object.freeze({
  moneyline: "mlb_moneyline", total: "mlb_total", run_line: "mlb_run_line", run_line_posted: "mlb_run_line_posted",
});
export const PUBLICATION_STATUSES = Object.freeze(["PUBLIC", "PAUSED", "NOT_SERVED", "UNKNOWN"]);

/** live-record-gate.mjs `pausedFamiliesFrom` maxAgeHours: an older scorecard pauses nothing. */
const SCORECARD_MAX_AGE_MS = 72 * 3600e3;
/** health-changes.mjs CHANGE_WINDOW_DAYS: how far back a scorecard's own `changes` reach. */
const CHANGE_WINDOW_MS = 14 * 86_400_000;
/* Sized from the committed GitHub Production deployment record (data/internal/ops/production-deployments/
   github-2026-07-20_2026-10-10T00-21-19Z.json, 3,835 READY): the longest gap between READY deployments was 9.3 h and
   commit → READY took 2.5–12.7 min (1-in-40 sample). Both margins are well beyond what was observed. */
/** With no deployment evidence, the build live at first pitch was made at most this long before it. */
const SERVED_BUILD_LOOKBACK_MS = 24 * 3600e3;
/** A named served deployment's build began at most this long before it was READY. */
const DEPLOY_LATENCY_MS = 30 * 60e3;

/* Derived 2026-10-23 from origin/main at d2a7af7da2 (scripts/results/derive-mlb-call-publication-history.mjs). */
export const MLB_CALL_PUBLICATION_HISTORY = Object.freeze({
  surfaceLive: { commit: "ae7f5849b6", at: "2026-07-24T18:18:55Z" },
  gateLive: {
    mlb_total: { commit: "fa60baf1e3", at: "2026-09-14T15:47:20Z" },
    mlb_moneyline: { commit: "39650f3e56", at: "2026-09-15T02:56:21Z" },
    mlb_run_line: { commit: "39650f3e56", at: "2026-09-15T02:56:21Z" },
    mlb_run_line_posted: { commit: "80a6a3fe9c", at: "2026-10-10T01:14:54Z" },
  },
  observations: [
    { at: "2026-09-14T15:23:00Z", commit: "df9d74a6b8", generatedAt: "2026-09-14T15:15:55Z", breached: ["mlb_total"] },
    { at: "2026-09-14T16:01:40Z", commit: "2a36dd9261", generatedAt: "2026-09-14T16:01:26Z", breached: ["mlb_total"] },
    { at: "2026-09-15T10:06:26Z", commit: "b4852c30b0", generatedAt: "2026-09-15T10:06:15Z", breached: ["mlb_total"] },
    { at: "2026-09-15T14:30:06Z", commit: "1ddd8b6379", generatedAt: "2026-09-15T14:29:48Z", breached: ["mlb_total"] },
    { at: "2026-09-16T09:59:28Z", commit: "b521d41678", generatedAt: "2026-09-16T09:59:14Z", breached: ["mlb_total"] },
    { at: "2026-09-17T10:01:32Z", commit: "c3f437c9d7", generatedAt: "2026-09-17T10:01:20Z", breached: ["mlb_total"] },
    { at: "2026-09-18T09:47:40Z", commit: "357e45435e", generatedAt: "2026-09-18T09:47:27Z", breached: ["mlb_moneyline", "mlb_total"] },
    { at: "2026-09-18T13:51:01Z", commit: "4e990963f8", generatedAt: "2026-09-18T13:50:46Z", breached: ["mlb_moneyline", "mlb_total"] },
    { at: "2026-09-19T09:32:25Z", commit: "f380574a0c", generatedAt: "2026-09-19T09:32:13Z", breached: ["mlb_total"] },
    { at: "2026-09-20T09:50:36Z", commit: "358a127db5", generatedAt: "2026-09-20T09:50:25Z", breached: ["mlb_total"] },
    { at: "2026-09-20T13:04:15Z", commit: "9b59b2999a", generatedAt: "2026-09-20T13:04:02Z", breached: ["mlb_total"] },
    { at: "2026-09-21T10:45:00Z", commit: "2ae38e8109", generatedAt: "2026-09-21T10:44:47Z", breached: ["mlb_total"] },
    { at: "2026-09-21T16:02:35Z", commit: "f6cd974b04", generatedAt: "2026-09-21T16:02:22Z", breached: ["mlb_total"] },
    { at: "2026-09-22T09:58:16Z", commit: "28ff2c3b4b", generatedAt: "2026-09-22T09:58:06Z", breached: ["mlb_total"] },
    { at: "2026-09-22T14:12:35Z", commit: "42a1e55ec2", generatedAt: "2026-09-22T14:12:22Z", breached: ["mlb_total"] },
    { at: "2026-09-23T10:01:07Z", commit: "1ad1bf603f", generatedAt: "2026-09-23T10:00:54Z", breached: ["mlb_total"] },
    { at: "2026-09-23T14:28:08Z", commit: "c55b7400f1", generatedAt: "2026-09-23T14:27:50Z", breached: ["mlb_total"] },
    { at: "2026-09-24T14:35:10Z", commit: "0f3a4bcefd", generatedAt: "2026-09-24T14:34:54Z", breached: ["mlb_total"] },
    { at: "2026-09-25T10:14:04Z", commit: "68e11bfe15", generatedAt: "2026-09-25T10:13:51Z", breached: ["mlb_total"] },
    { at: "2026-09-26T09:54:58Z", commit: "b822cfbd7c", generatedAt: "2026-09-26T09:54:45Z", breached: ["mlb_total"] },
    { at: "2026-09-27T10:34:58Z", commit: "c34a3b83dd", generatedAt: "2026-09-27T10:34:49Z", breached: ["mlb_total"] },
    { at: "2026-09-28T11:43:34Z", commit: "90261d1891", generatedAt: "2026-09-28T11:43:24Z", breached: ["mlb_total"] },
    { at: "2026-09-29T11:23:56Z", commit: "e8869068e3", generatedAt: "2026-09-29T11:23:48Z", breached: ["mlb_total"] },
    { at: "2026-09-30T11:12:49Z", commit: "64c164ae61", generatedAt: "2026-09-30T11:12:35Z", breached: ["mlb_total"] },
    { at: "2026-10-01T11:38:57Z", commit: "75f50fddc2", generatedAt: "2026-10-01T11:38:45Z", breached: ["mlb_total"] },
    { at: "2026-10-02T11:08:56Z", commit: "1f8d0996a0", generatedAt: "2026-10-02T11:08:39Z", breached: ["mlb_total"] },
    { at: "2026-10-02T14:45:42Z", commit: "ceb2caea84", generatedAt: "2026-10-02T14:45:24Z", breached: ["mlb_total"] },
    { at: "2026-10-03T10:26:43Z", commit: "ef7be32528", generatedAt: "2026-10-03T10:26:32Z", breached: ["mlb_total"] },
    { at: "2026-10-04T11:09:36Z", commit: "ad379977de", generatedAt: "2026-10-04T11:09:19Z", breached: ["mlb_total"] },
    { at: "2026-10-04T13:57:33Z", commit: "7158d65bca", generatedAt: "2026-10-04T13:57:16Z", breached: ["mlb_total"] },
    { at: "2026-10-05T12:20:36Z", commit: "bbd2a1ed77", generatedAt: "2026-10-05T12:20:18Z", breached: ["mlb_total"] },
    { at: "2026-10-05T17:11:12Z", commit: "859aca2ef9", generatedAt: "2026-10-05T17:10:54Z", breached: ["mlb_total"] },
    { at: "2026-10-06T09:25:50Z", commit: "be05389331", generatedAt: "2026-10-06T09:25:31Z", breached: ["mlb_total"] },
    { at: "2026-10-06T16:18:57Z", commit: "2831356282", generatedAt: "2026-10-06T16:18:37Z", breached: ["mlb_total"] },
    { at: "2026-10-07T09:24:24Z", commit: "7bbe41a80a", generatedAt: "2026-10-07T09:24:12Z", breached: ["mlb_total"] },
    { at: "2026-10-08T09:24:27Z", commit: "9abeb29236", generatedAt: "2026-10-08T09:24:15Z", breached: ["mlb_total"] },
    { at: "2026-10-09T09:26:11Z", commit: "f9f74d24dd", generatedAt: "2026-10-09T09:25:54Z", breached: ["mlb_total"] },
    { at: "2026-10-10T09:25:50Z", commit: "78758d6f46", generatedAt: "2026-10-10T09:25:34Z", breached: ["mlb_total"] },
    { at: "2026-10-10T15:39:21Z", commit: "6a01cf3992", generatedAt: "2026-10-10T15:38:58Z", breached: ["mlb_total"] },
    { at: "2026-10-11T09:25:14Z", commit: "18af6080ab", generatedAt: "2026-10-11T09:24:58Z", breached: ["mlb_total"] },
    { at: "2026-10-11T14:59:18Z", commit: "24dce13bbf", generatedAt: "2026-10-11T14:58:58Z", breached: ["mlb_total"] },
    { at: "2026-10-11T16:02:28Z", commit: "f13efcb0f9", generatedAt: "2026-10-11T16:02:03Z", breached: ["mlb_total"] },
    { at: "2026-10-12T09:25:34Z", commit: "fe4d71d220", generatedAt: "2026-10-12T09:25:18Z", breached: ["mlb_total"] },
    { at: "2026-10-12T19:24:03Z", commit: "73f6a5d780", generatedAt: "2026-10-12T19:23:45Z", breached: ["mlb_total"] },
    { at: "2026-10-13T09:30:22Z", commit: "bf4142baea", generatedAt: "2026-10-13T09:30:07Z", breached: ["mlb_total"] },
    { at: "2026-10-13T12:47:17Z", commit: "f6561656f1", generatedAt: "2026-10-13T12:46:57Z", breached: ["mlb_total"] },
    { at: "2026-10-13T17:12:11Z", commit: "4551e3935c", generatedAt: "2026-10-13T17:11:57Z", breached: ["mlb_total"] },
    { at: "2026-10-14T09:30:14Z", commit: "d842566f89", generatedAt: "2026-10-14T09:29:57Z", breached: ["mlb_total"] },
    { at: "2026-10-14T12:30:56Z", commit: "2941461df5", generatedAt: "2026-10-14T12:30:37Z", breached: ["mlb_total"] },
    { at: "2026-10-15T09:24:56Z", commit: "bf2442d12d", generatedAt: "2026-10-15T09:24:44Z", breached: ["mlb_total"] },
    { at: "2026-10-16T09:25:23Z", commit: "de48cee2fd", generatedAt: "2026-10-16T09:25:09Z", breached: ["mlb_total"] },
    { at: "2026-10-16T14:17:04Z", commit: "371fc6d5d7", generatedAt: "2026-10-16T14:16:50Z", breached: ["mlb_total"] },
    { at: "2026-10-17T18:01:59Z", commit: "0331be422a", generatedAt: "2026-10-17T18:01:45Z", breached: ["mlb_total"] },
    { at: "2026-10-18T09:26:58Z", commit: "01ac320a62", generatedAt: "2026-10-18T09:26:06Z", breached: ["mlb_total"] },
    { at: "2026-10-18T12:41:54Z", commit: "e4f297bda9", generatedAt: "2026-10-18T12:41:01Z", breached: ["mlb_total"] },
    { at: "2026-10-18T13:37:55Z", commit: "ab363d26b0", generatedAt: "2026-10-18T13:37:03Z", breached: ["mlb_total"] },
    { at: "2026-10-19T09:28:17Z", commit: "af559a6a71", generatedAt: "2026-10-19T09:27:27Z", breached: ["mlb_total"] },
    { at: "2026-10-20T09:27:59Z", commit: "8bf3464265", generatedAt: "2026-10-20T09:27:08Z", breached: ["mlb_total"] },
    { at: "2026-10-20T14:35:40Z", commit: "19445a7070", generatedAt: "2026-10-20T14:34:45Z", breached: ["mlb_total"] },
    { at: "2026-10-21T09:25:33Z", commit: "8e5577e11d", generatedAt: "2026-10-21T09:24:57Z", breached: ["mlb_total"] },
  ],
  recordedThrough: { commit: "8e5577e11d", at: "2026-10-21T09:25:33Z", generatedAt: "2026-10-21T09:24:57Z" },
});

const ms = (iso) => Date.parse(String(iso ?? ""));

/** Families whose BREACHED state pauses `family` (the posted run line inherits every v1 restriction). */
const pausers = (family) => (family === "mlb_run_line_posted" ? ["mlb_run_line_posted", "mlb_run_line"] : [family]);

/** Is `family` paused in a build made at `t` that read scorecard `obs` (null = none)? */
function pausedIn(family, obs, t, history, { assumeFresh = false } = {}) {
  const gate = ms(history.gateLive[family]?.at);
  if (!Number.isFinite(gate) || t < gate || !obs) return false;
  if (!assumeFresh && t - ms(obs.generatedAt) > SCORECARD_MAX_AGE_MS) return false;
  return pausers(family).some((f) => obs.breached.includes(f));
}

/**
 * Can the current scorecard vouch that `family`'s gate state never changed after the committed history? Only when
 * its own `changes` window reaches back over the history's end, it records no transition for the family since, and
 * its state equals the history's last state. Then builds after the history read that same state (assumed refreshed
 * nightly, as the settle does).
 */
function vouchedAfterHistory(family, history, scorecard) {
  const end = history.recordedThrough;
  const last = history.observations.at(-1);
  const at = ms(scorecard?.generatedAt);
  if (!end || !last || !Number.isFinite(at) || at < ms(end.generatedAt)) return false;
  if (at - CHANGE_WINDOW_MS > ms(end.generatedAt)) return false;
  const ids = pausers(family);
  if ((scorecard.changes ?? []).some((c) => ids.includes(c?.id) && ms(c.at) > ms(end.generatedAt))) return false;
  const nowBreached = (scorecard.families ?? []).filter((f) => f?.state === "BREACHED").map((f) => f.id);
  return ids.every((id) => nowBreached.includes(id) === last.breached.includes(id));
}

/**
 * One graded MLB game-call row → { status, reason }.
 * @param {{ gamePk?: number|string, date?: string, market?: string, firstPitchUtc?: string }} row
 * @param {{ history?: typeof MLB_CALL_PUBLICATION_HISTORY, scorecard?: any, evidence?: ReturnType<typeof servedEvidence> }} [ctx]
 *   scorecard: the model-health scorecard this build reads; evidence: the deployment evidence per game
 */
export function mlbCallPublication(row, { history = MLB_CALL_PUBLICATION_HISTORY, scorecard = null, evidence = EMPTY_EVIDENCE } = {}) {
  const family = MLB_CALL_FAMILY[row?.market];
  if (!family) return { status: "UNKNOWN", reason: "UNKNOWN_MARKET" };
  const key = `${row.gamePk}|${row.date}`;
  if (evidence.neverServed.has(key)) return { status: "NOT_SERVED", reason: "NEVER_PUBLIC_BEFORE_START" };
  const start = ms(row?.firstPitchUtc);
  if (!Number.isFinite(start)) return { status: "UNKNOWN", reason: "NO_TIMESTAMPS" };
  const ready = ms(evidence.servedReadyAt.get(key));
  /* The window the live build was made in. */
  const [a, b] = Number.isFinite(ready) && ready <= start ? [ready - DEPLOY_LATENCY_MS, ready] : [start - SERVED_BUILD_LOOKBACK_MS, start];
  if (a < ms(history.surfaceLive.at)) return { status: "UNKNOWN", reason: "BEFORE_CALL_SURFACE" };

  const end = ms(history.recordedThrough?.at);
  if (b > end && !vouchedAfterHistory(family, history, scorecard)) return { status: "UNKNOWN", reason: "AFTER_RECORDED_HISTORY" };

  /* Every (scorecard, build time) pair a build made in [a, b] could have had. Within one scorecard's reign the gate's
     answer can only change at the gate's start or the scorecard's 72 h expiry, so those instants plus the reign's
     ends cover every value. */
  const obs = history.observations;
  const values = new Set();
  const reign = (o, from, to) => {
    const points = [from, to];
    const gate = ms(history.gateLive[family]?.at);
    if (gate > from && gate < to) points.push(gate);
    if (o) { const exp = ms(o.generatedAt) + SCORECARD_MAX_AGE_MS; if (exp > from && exp < to) points.push(exp, exp + 1); }
    for (const t of points) values.add(pausedIn(family, o, t, history, { assumeFresh: t > end }));
  };
  let current = null;
  for (const o of obs) if (ms(o.at) <= a) current = o;
  let from = a;
  for (const o of obs) {
    const t = ms(o.at);
    if (t <= a || t > b) continue;
    reign(current, from, t - 1);
    current = o;
    from = t;
  }
  reign(current, from, b);
  if (values.size !== 1) return { status: "UNKNOWN", reason: "PAUSE_CHANGED" };
  return values.has(true) ? { status: "PAUSED", reason: "PAUSED_BY_LIVE_RECORD_GATE" } : { status: "PUBLIC", reason: "SHOWN_BEFORE_START" };
}

const EMPTY_EVIDENCE = Object.freeze({ neverServed: new Set(), servedReadyAt: new Map() });

/**
 * The deployment evidence per game (`${gamePk}|${date}`) from the forecast-of-record classification: the games it
 * verified were never public before first pitch, and, for every game it found served, when that build was READY.
 */
export function servedEvidence(classification) {
  const neverServed = new Set((classification?.verifiedNeverPublic ?? []).map((g) => `${g.gamePk}|${g.date}`));
  const servedReadyAt = new Map();
  for (const g of classification?.games ?? []) {
    if (g?.status === "SERVED" && typeof g.deployment?.readyAt === "string") servedReadyAt.set(`${g.gamePk}|${g.date}`, g.deployment.readyAt);
  }
  return { neverServed, servedReadyAt };
}

/** Counts per status (and per UNKNOWN reason) — the reconciliation a page or test prints beside a record. */
export function publicationTally(rows, ctx) {
  const byStatus = Object.fromEntries(PUBLICATION_STATUSES.map((s) => [s, 0]));
  const byReason = {};
  for (const r of rows ?? []) {
    const { status, reason } = mlbCallPublication(r, ctx);
    byStatus[status] += 1;
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
  return { rows: (rows ?? []).length, byStatus, byReason };
}
