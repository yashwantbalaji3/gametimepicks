/**
 * WORKER — executes one recorded job against the shared ledger, then uploads what it produced.
 *
 * Used in-process by the local dispatcher (dev server, tests) and by worker/run-job.mjs on GitHub Actions.
 * Progress is flushed every second so the founder's phone shows it live, and the session refreshes so a Pause
 * written by the web app reaches the running engineering step (which then stops Claude Code).
 */
import { createSqlStore } from "../ledger/sql-store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { uploadOutputs } from "../ledger/object-store.mjs";

/**
 * @param {{ db: object, clock: () => string, jobId: string, runId?: string|null, runnerId: string, outDir: string,
 *           objects: object, env?: object, engineering?: object, slateDate?: string, flushMs?: number }} o
 */
export async function runWorkerJob({ db, clock, jobId, runId = null, runnerId, outDir, objects, env = {}, engineering = {}, slateDate, flushMs = 1000 }) {
  const sql = createSqlStore({ db, clock });
  const session = await sql.open();
  const o = createOrchestrator({
    store: session, clock, env, outDir, slateDate, execution: "jobs", runnerId,
    engineering: { ...engineering, patchStore: objects },
  });
  // Progress flushes are chained; a failed one is logged and the chain carries on (the store keeps the rows for
  // the next attempt unless a claim was lost, which ends the job at the final flush).
  let flushing = Promise.resolve();
  const flush = () => (flushing = flushing.then(() => session.flush()).catch((err) => console.error(`worker flush failed: ${err.code ?? ""} ${err.message}`)));
  const seen = session.list().length;
  const tick = setInterval(flush, flushMs);
  let result;
  try {
    result = await o.runJob(jobId, { runId, commitStart: () => session.flush() });
    await o.whenIdle();
  } finally {
    clearInterval(tick);
    await flushing.catch(() => {});
    await session.flush();
  }
  const uploaded = await uploadOutputs(objects, outDir);
  const kept = session.list().slice(seen).find((e) => e.kind === "deliverable" && e.data.kind === "kept")?.data ?? null;
  // Jobs a worker step requested (none today: a job runs its whole step) would need a dispatcher; report them.
  return { ...result, uploaded, kept: kept && { branch: kept.branch, commit: kept.commit }, outbox: o.takeOutbox() };
}
