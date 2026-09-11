/**
 * Reliable morning start (P256). Invoked by the Vercel cron in vercel.json around 5 AM ET; starts
 * nightly-settle through GitHub's API when it has not already run today, which chains the rest of the
 * morning (projections → MLB production → daily products) exactly as a scheduled run does.
 *
 *   · Refuses (401) any caller that is not Vercel's cron (Authorization: Bearer $CRON_SECRET).
 *   · FAIL-CLOSED until the founder adds GTP_DISPATCH_TOKEN (a fine-grained GitHub token for this
 *     repository with "Actions: read and write"): it answers 503 and starts nothing.
 *   · GitHub's own schedules stay in place as the backup; this path never starts a second settlement
 *     on a day one has already succeeded (decideMorningTrigger).
 * The token is read from the environment and never logged or echoed.
 */
import { cronAuthorized } from "./_retention-core.mjs";
import { TRIGGER_REPO, TRIGGER_TOKEN_ENV, TRIGGER_WORKFLOW, decideMorningTrigger } from "./_morning-trigger-core.mjs";

const GH = "https://api.github.com";

export default async function handler(req, res) {
  if (!cronAuthorized(req.headers?.authorization, process.env.CRON_SECRET)) return res.status(401).json({ ok: false });
  const token = process.env[TRIGGER_TOKEN_ENV];
  if (!token) {
    console.log(JSON.stringify({ morningTrigger: "not-configured", need: TRIGGER_TOKEN_ENV }));
    return res.status(503).json({ ok: false, reason: `${TRIGGER_TOKEN_ENV} is not configured — nothing started` });
  }
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gtp-morning-trigger" };
  const now = new Date().toISOString();
  try {
    const r = await fetch(`${GH}/repos/${TRIGGER_REPO}/actions/workflows/${TRIGGER_WORKFLOW}/runs?per_page=20`, { headers });
    const runs = r.ok ? (await r.json()).workflow_runs ?? null : null;
    const decision = decideMorningTrigger(runs, now);
    if (!decision.dispatch) {
      console.log(JSON.stringify({ morningTrigger: "skipped", reason: decision.reason, listStatus: r.status }));
      return res.status(200).json({ ok: true, dispatched: false, reason: decision.reason });
    }
    const d = await fetch(`${GH}/repos/${TRIGGER_REPO}/actions/workflows/${TRIGGER_WORKFLOW}/dispatches`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main" }),
    });
    const ok = d.status === 204;
    console.log(JSON.stringify({ morningTrigger: ok ? "dispatched" : "dispatch-failed", status: d.status, reason: decision.reason }));
    return res.status(ok ? 200 : 502).json({ ok, dispatched: ok, reason: decision.reason });
  } catch (e) {
    console.log(JSON.stringify({ morningTrigger: "error", message: String(e?.message ?? e).slice(0, 200) }));
    return res.status(500).json({ ok: false });
  }
}
