/**
 * PIPELINE MONITOR CORE (founder P0, Track B #6, 2026-11-10) — the CI/deploy pipeline watched from GitHub itself,
 * not from a Mac or a Claude session. Every failure below happened and went unseen for hours:
 *
 *   PR_HEAD_NO_RUN       a PR head with no workflow run 5+ min after its push. #1302's head commit quoted the
 *                        skip-CI marker in its BODY; GitHub honoured it and no check ever ran, for 3.5 h.
 *   QUALITY_GATE_LONG    a quality-gate run in progress for more than 75 min (a full run takes ~25).
 *   RUN_ZOMBIE           any workflow run still queued / in progress after 12 h. Three from 2026-10-07
 *                        (37672956236, 37655527836, 37655501437) were still listed "queued" on 11-10.
 *   CRON_SLOT_MISSED     a scheduled data job missed its slot, or keeps failing. NOT a second schedule model:
 *                        this reads cron-watchdog's own report (app/public/data/ops/cron-slot-watchdog.json, from
 *                        lib/ops/cron-slots.mjs) — and alerts when that report itself goes stale, which is how
 *                        the watchdog being cancelled at its timeout from 11-08 would otherwise stay invisible.
 *   VERCEL_PROD_FAILED   a Vercel Production deployment ended failure/error. The coalescing gate's cancels
 *                        ("Canceled from the Vercel Dashboard") are the designed outcome, never an alert.
 *   MAIN_GATE_RED        main's newest completed quality-gate run is red (data commits skip CI, so a red main
 *                        stays invisible until the next PR inherits it — 11-09, #1295).
 *
 * Read-only by construction: the evaluator sees API data and returns conditions; nothing here can re-run,
 * cancel or merge. De-duplication: one alert per condition key (the key names the head / run / deployment /
 * slot), kept in the status file while the condition holds and dropped when it clears, so a recurrence alerts
 * again. Every stored detail is time-invariant (instants and thresholds, never "N min ago"), so the status file
 * changes only when a condition does. Pure and clock-injected.
 */

export const PIPELINE_STATUS_SCHEMA = "gtp.pipeline-status@1";
export const PIPELINE_STATUS_FILE = "data/internal/ops/pipeline-status.json";
export const PIPELINE_MONITOR_WORKFLOW = "pipeline-monitor";

/** Ops thresholds (PD brief 2026-11-10 for the first two; the rest are derived in their comments). */
export const THRESHOLDS = Object.freeze({
  /** PR head with no run this long after its push. */
  prNoRunMinutes: 5,
  /** quality-gate wall-clock ceiling. */
  qualityGateMaxMinutes: 75,
  /** Hosted jobs stop at 6 h; a run queued or running twice that long is not going to finish. */
  zombieHours: 12,
  /** cron-watchdog fires at 09:30 (weekends), 10:53 and 14:30 UTC: the longest healthy gap is 20.4 h, so 26 h
   *  means at least one slot fired without publishing the report (or did not fire). */
  cronReportMaxAgeHours: 26,
  /** Vercel deployments older than this are history, not news (one status read each, so it is also budget). */
  vercelLookbackHours: 12,
  /** PRs not updated for this long are not re-examined (rate budget, below); a head missing CI was already
   *  alerted inside the window. */
  prLookbackHours: 24,
});

/**
 * RATE BUDGET. The job token allows 1,000 REST requests/hour for the whole repository, shared with every other
 * workflow. One evaluation costs 1 (PR list) + 1 per PR updated in prLookbackHours (+3 more only for a PR with no
 * run) + 5 (active-run statuses) + 1 (main gate) + 1 + 1 per deployment in vercelLookbackHours. On 2026-11-10 that
 * was ~35 requests; wake-ups are a handful an hour (one evaluation at a time, intermediate events dropped).
 */
export const MAX_REQUESTS_PER_EVALUATION = 80;

/** Every spelling GitHub honours to skip push / pull_request workflows, in the subject OR the body. */
const SKIP_MARKERS = [/\[skip ci\]/i, /\[ci skip\]/i, /\[no ci\]/i, /\[skip actions\]/i, /\[actions skip\]/i];
const SKIP_TRAILER = /^skip-checks:\s*true\s*$/im;

/** The skip instruction a commit message carries, or null. */
export function skipCiMarker(message) {
  const m = String(message ?? "");
  for (const re of SKIP_MARKERS) { const hit = re.exec(m); if (hit) return hit[0]; }
  return SKIP_TRAILER.test(m) ? "skip-checks: true" : null;
}

/** git pathspec-style glob from a workflow `paths:` filter → RegExp ("**" spans directories, "*" does not). */
export function pathGlobRe(glob) {
  // Placeholders first: rewriting "**" to ".*" before the single-"*" pass would turn it into ".[^/]*" (one level).
  return new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*") + "$");
}

/** The `pull_request: paths:` list of a workflow file (null when the trigger has no path filter). */
export function pullRequestPaths(workflowYaml) {
  const block = /^  pull_request:\s*\n((?:    .*\n|\s*#.*\n|\s*\n)*)/m.exec(String(workflowYaml));
  if (!block) return null;
  const paths = /^    paths:\s*\n((?:      - .*\n|\s*#.*\n)*)/m.exec(block[1]);
  if (!paths) return null;
  return [...paths[1].matchAll(/^      - ["']?([^"'\n#]+?)["']?\s*$/gm)].map((m) => m[1]);
}

const shortSha = (s) => String(s ?? "").slice(0, 10);
const minutesBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 60_000;
const ACTIVE = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);
const RED = new Set(["failure", "timed_out", "startup_failure"]);
export const VERCEL_COALESCE_CANCEL = "Canceled from the Vercel Dashboard";

/**
 * @param {object} input  what gatherPipelineInputs() returns
 * @param {string} nowIso
 * @returns {Array<{ key: string, kind: string, detail: string }>}  sorted by key
 */
export function evaluatePipeline(input, nowIso) {
  const out = [];
  const add = (kind, key, detail) => out.push({ key: `${kind}:${key}`, kind, detail });

  // 1. PR heads with no workflow run — only PRs whose files the gate's own pull_request paths cover.
  const gateRes = (input.gatePullRequestPaths ?? []).map(pathGlobRe);
  for (const pr of input.pullRequests ?? []) {
    const ref = [pr.headCommittedAt, pr.updatedAt].filter((t) => Number.isFinite(Date.parse(t ?? ""))).sort().pop();
    if (!ref || minutesBetween(ref, nowIso) < THRESHOLDS.prNoRunMinutes) continue;
    const runs = (pr.runs ?? []).filter((r) => r.name !== PIPELINE_MONITOR_WORKFLOW);
    if (runs.length) continue;
    if (gateRes.length && !(pr.files ?? []).some((f) => gateRes.some((re) => re.test(f)))) continue;
    const marker = skipCiMarker(pr.headMessage);
    const why = marker ? `head commit message carries "${marker}"` : pr.mergeable === false ? "merge conflict (GitHub runs no pull_request workflow)" : "cause unknown";
    add("PR_HEAD_NO_RUN", `${pr.number}:${shortSha(pr.headSha)}`, `PR #${pr.number} head ${shortSha(pr.headSha)} (pushed ${ref}): no workflow run ${THRESHOLDS.prNoRunMinutes}+ min after push — ${why}`);
  }

  // 2. Long quality-gate runs and zombies of any workflow.
  for (const r of input.activeRuns ?? []) {
    if (!ACTIVE.has(r.status)) continue;
    const started = r.run_started_at ?? r.created_at;
    const ageMin = minutesBetween(started, nowIso);
    if (ageMin >= THRESHOLDS.zombieHours * 60) add("RUN_ZOMBIE", String(r.id), `${r.name} run ${r.id} still "${r.status}" since ${started} (over ${THRESHOLDS.zombieHours} h)`);
    else if (r.name === "quality-gate" && r.status === "in_progress" && ageMin > THRESHOLDS.qualityGateMaxMinutes) add("QUALITY_GATE_LONG", String(r.id), `quality-gate run ${r.id} (${r.head_branch}) in progress since ${started} (over ${THRESHOLDS.qualityGateMaxMinutes} min)`);
  }

  // 3. Scheduled data jobs — cron-watchdog's report, read, never recomputed.
  const rep = input.cronSlotReport;
  if (!rep || !Number.isFinite(Date.parse(rep.generatedAt ?? ""))) {
    add("CRON_SLOT_MISSED", "report-missing", "cron-watchdog's cron-slot report is missing or unreadable");
  } else {
    const ageH = minutesBetween(rep.generatedAt, nowIso) / 60;
    if (ageH > THRESHOLDS.cronReportMaxAgeHours) add("CRON_SLOT_MISSED", `report-stale:${rep.generatedAt}`, `cron-watchdog's cron-slot report is older than ${THRESHOLDS.cronReportMaxAgeHours} h (generated ${rep.generatedAt}) — the watchdog is not publishing`);
    for (const [sport, v] of Object.entries(rep.sports ?? {})) {
      for (const slot of v?.missed ?? []) add("CRON_SLOT_MISSED", `${v.workflow}:${slot}`, `${v.workflow} (${sport}) missed its ${slot} slot`);
      if ((v?.consecutiveFailures ?? 0) > 0 && v?.lastConclusion && v.lastConclusion !== "success") add("CRON_SLOT_MISSED", `${v.workflow}:failing:${v.lastRunId ?? v.lastConclusion}`, `${v.workflow} (${sport}): ${v.consecutiveFailures} consecutive failed run(s), last ${v.lastConclusion}`);
    }
  }

  // 4. Vercel Production deployments that failed (not the coalescing cancel).
  for (const d of input.vercelDeployments ?? []) {
    if (d.environment !== "Production" || minutesBetween(d.createdAt, nowIso) > THRESHOLDS.vercelLookbackHours * 60) continue;
    if (!["failure", "error"].includes(d.state) || d.description === VERCEL_COALESCE_CANCEL) continue;
    add("VERCEL_PROD_FAILED", String(d.id), `Vercel Production deployment ${d.id} for ${shortSha(d.sha)} ended ${d.state}: ${d.description ?? "no description"}`);
  }

  // 5. main's newest completed quality-gate run.
  const main = input.mainGateRun;
  if (main && main.status === "completed" && RED.has(main.conclusion)) add("MAIN_GATE_RED", shortSha(main.head_sha), `main quality-gate run ${main.id} on ${shortSha(main.head_sha)} is ${main.conclusion}`);

  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Fold this run's conditions into the previous status. A key already alerted is not alerted again while it
 * holds; a key that cleared is dropped (a recurrence alerts again). `since` is the first run that saw it, so an
 * unchanged pipeline writes a byte-identical file (no commit).
 */
export function foldStatus(prev, conditions, nowIso) {
  const before = new Map((prev?.conditions ?? []).map((c) => [c.key, c]));
  const next = conditions.map((c) => ({ ...c, since: before.get(c.key)?.since ?? nowIso }));
  const alerts = conditions.filter((c) => !before.has(c.key));
  const cleared = [...before.keys()].filter((k) => !conditions.some((c) => c.key === k));
  const counts = {};
  for (const c of next) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  return { status: { schema: PIPELINE_STATUS_SCHEMA, thresholds: THRESHOLDS, state: next.length ? "ATTENTION" : "OK", counts, conditions: next }, alerts, cleared };
}

/**
 * Read everything the evaluator needs. `api(path)` returns parsed JSON for a REST path (gh api in the workflow,
 * fixtures in tests); `files` gives the committed quality-gate workflow and cron-slot report. GET only.
 * A failed call throws: a half-read pipeline must not clear conditions it could not see.
 */
export function gatherPipelineInputs(api, { repo, nowIso, qualityGateYaml, cronSlotReport }) {
  const r = (p) => api(`repos/${repo}/${p}`);
  const pullRequests = [];
  for (const pr of r("pulls?state=open&per_page=100")) {
    const ageH = minutesBetween(pr.updated_at, nowIso) / 60;
    if (!(ageH <= THRESHOLDS.prLookbackHours)) continue;
    const runs = r(`actions/runs?head_sha=${pr.head.sha}&per_page=20`).workflow_runs ?? [];
    const row = { number: pr.number, headSha: pr.head.sha, updatedAt: pr.updated_at, runs: runs.map((x) => ({ id: x.id, name: x.name, event: x.event, status: x.status })) };
    if (!row.runs.some((x) => x.name !== PIPELINE_MONITOR_WORKFLOW)) {
      const c = r(`commits/${pr.head.sha}`);
      row.headMessage = c.commit?.message ?? "";
      row.headCommittedAt = c.commit?.committer?.date ?? null;
      row.files = r(`pulls/${pr.number}/files?per_page=100`).map((f) => f.filename);
      row.mergeable = r(`pulls/${pr.number}`).mergeable ?? null;
    }
    pullRequests.push(row);
  }
  const activeRuns = [];
  for (const st of ACTIVE) for (const x of r(`actions/runs?status=${st}&per_page=100`).workflow_runs ?? []) activeRuns.push({ id: x.id, name: x.name, status: x.status, event: x.event, head_branch: x.head_branch, created_at: x.created_at, run_started_at: x.run_started_at });
  const mainGateRun = (r("actions/workflows/quality-gate.yml/runs?branch=main&status=completed&per_page=1").workflow_runs ?? [])[0] ?? null;
  const vercelDeployments = [];
  for (const d of r("deployments?environment=Production&per_page=20")) {
    if (minutesBetween(d.created_at, nowIso) > THRESHOLDS.vercelLookbackHours * 60) continue;
    const st = r(`deployments/${d.id}/statuses?per_page=1`)[0];
    vercelDeployments.push({ id: d.id, sha: d.sha, environment: d.environment, createdAt: d.created_at, state: st?.state ?? "unknown", description: st?.description ?? null });
  }
  return {
    pullRequests, activeRuns, cronSlotReport, vercelDeployments,
    mainGateRun: mainGateRun && { id: mainGateRun.id, status: mainGateRun.status, conclusion: mainGateRun.conclusion, head_sha: mainGateRun.head_sha },
    gatePullRequestPaths: pullRequestPaths(qualityGateYaml) ?? [],
  };
}

export const serializeStatus = (status) => `${JSON.stringify(status, null, 1)}\n`;
