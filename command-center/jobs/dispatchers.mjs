/**
 * JOB DISPATCHERS — how the hosted app hands a recorded job to a runner, and how Pause/Stop cancels one.
 *
 *   local    runs the job in this process right after the response (dev server and tests). Cancel is a no-op:
 *            the in-process worker sees Pause through the ledger (engineering runs poll it) and stops itself.
 *   github   POST /repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches with inputs { job_id } and
 *            return_run_details, so the response names the workflow run and Stop can cancel it even while it is
 *            still queued. Cancel: POST …/actions/runs/{id}/cancel; Emergency stop: …/force-cancel. The token is
 *            a fine-grained PAT scoped to the private ops repo only with "Actions: read and write" — it cannot read
 *            code or secrets, push, or touch any other repository.
 *
 * Every call returns a result instead of throwing; the app records dispatch failures in the ledger.
 */

export function localDispatcher({ runWorker }) {
  return {
    runner: "local",
    async dispatch(job) {
      setImmediate(() => runWorker(job.jobId).catch((err) => console.error(`local job ${job.jobId} failed:`, err)));
      return { ok: true, runId: null };
    },
    async cancel() {
      return { ok: true, note: "in-process worker stops on Pause by itself" };
    },
  };
}

/**
 * @param {{ token: string, owner: string, repo: string, workflow: string, ref?: string, fetch?: typeof fetch,
 *           apiBase?: string }} o
 */
export function githubDispatcher({ token, owner, repo, workflow, ref = "main", fetch: f = globalThis.fetch, apiBase = "https://api.github.com" }) {
  if (!token || !owner || !repo || !workflow) throw new Error("github dispatcher needs token, owner, repo and workflow");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "gtp-command-center",
  };
  const base = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions`;

  return {
    runner: "github-actions",
    async dispatch(job) {
      let res;
      try {
        res = await f(`${base}/workflows/${encodeURIComponent(workflow)}/dispatches`, {
          method: "POST", headers,
          body: JSON.stringify({ ref, inputs: { job_id: job.jobId }, return_run_details: true }),
        });
      } catch (err) {
        return { ok: false, detail: `dispatch request failed: ${String(err.message ?? err).slice(0, 160)}` };
      }
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, runId: body.workflow_run_id != null ? String(body.workflow_run_id) : null };
      }
      if (res.status === 204) return { ok: true, runId: null };
      return { ok: false, detail: `GitHub answered ${res.status} to the dispatch` };
    },
    async cancel(job, { force = false } = {}) {
      if (!job.runId) return { ok: false, detail: "no run id recorded; the worker will see Pause in the ledger before it starts work" };
      let res;
      try {
        res = await f(`${base}/runs/${encodeURIComponent(job.runId)}/${force ? "force-cancel" : "cancel"}`, { method: "POST", headers });
      } catch (err) {
        return { ok: false, detail: `cancel request failed: ${String(err.message ?? err).slice(0, 160)}` };
      }
      // 409: the run already finished — nothing left to cancel
      if (res.status === 202 || res.status === 409) return { ok: true, alreadyDone: res.status === 409 };
      return { ok: false, detail: `GitHub answered ${res.status} to the cancel` };
    },
  };
}
