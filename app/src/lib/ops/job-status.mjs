/**
 * WHAT A LOCAL JOB'S TERMINAL STATUS IS — Program 235 · Release B.
 *
 * Program 163 built `scripts/ops/watch-gate.sh` for REMOTE runs and wrote the rules down. Program
 * 234 then leaked a watcher anyway, and not by breaking those rules — by being outside them. The
 * thing it watched was a LOCAL `npm run gate`, for which no helper existed, so it hand-rolled:
 *
 *     until grep -q "GATE_EXIT=" /tmp/gate2.log; do sleep 20; done
 *
 * Three separate failures in one line. The marker was echoed to the command's own stdout and never
 * reached that file, so the predicate was unfulfillable. The underlying job had already finished, so
 * nothing was being waited for. And the harness's foreground timeout stopped applying the moment the
 * loop was backgrounded, so it ran unbounded for two hours.
 *
 * The rule this module encodes: A JOB'S COMPLETION IS A RECEIPT IT WRITES, NOT A STRING IN ITS LOG.
 * The wrapper that runs the command is the only thing that can know the command's real exit code,
 * so it is the only thing that may declare the job finished. A log is diagnostic detail; a missing
 * or truncated log must not be able to hide a terminal status, and a log containing the word
 * "success" must not be able to invent one.
 *
 * Pure module — no clock, no filesystem, no child processes. The wrapper supplies the facts and
 * this decides what they mean, so every state below is testable in microseconds rather than by
 * waiting out a real timeout.
 */

/** Terminal statuses. Deliberately the same vocabulary the remote watcher exits with. */
export const JOB_STATUS = Object.freeze({
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
  /** The wrapper could not determine what happened. NEVER treated as success. */
  UNKNOWN: "UNKNOWN",
});

/** The exit code the wrapper itself returns for each status, so a caller can branch without parsing. */
export const STATUS_EXIT = Object.freeze({
  SUCCESS: 0, FAILURE: 2, CANCELLED: 3, TIMEOUT: 4, UNKNOWN: 7,
});

/** `timeout(1)` reports a killed command as 124. */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * Classify one finished local job.
 *
 * @param {{ exitCode: number|null, signal?: string|null, deadlineSecs?: number|null,
 *           startedMs?: number|null, endedMs?: number|null }} facts
 * @returns {{ status: string, reason: string, elapsedSecs: number|null }}
 */
export function classifyJob(facts = {}) {
  const { exitCode, signal = null, deadlineSecs = null, startedMs = null, endedMs = null } = facts;
  const elapsedSecs = Number.isFinite(startedMs) && Number.isFinite(endedMs)
    ? Math.max(0, Math.round((endedMs - startedMs) / 1000))
    : null;

  /*
   * A LOST CHILD IS UNKNOWN, NOT SUCCESS. `spawnSync` returns a null status when the process could
   * not be run or its result could not be collected. Defaulting that to 0 is how a job that never
   * executed reports as passing.
   */
  if (exitCode === null || exitCode === undefined) {
    return {
      status: JOB_STATUS.UNKNOWN,
      reason: signal
        ? `the process ended on ${signal} with no exit code — its result could not be collected`
        : "no exit code was collected — the process may never have started",
      elapsedSecs,
    };
  }

  /* An explicit interrupt is its own outcome: the operator stopped it, and that is not a failure
     of the thing being tested. */
  if (signal === "SIGINT" || signal === "SIGTERM") {
    return { status: JOB_STATUS.CANCELLED, reason: `interrupted by ${signal}`, elapsedSecs };
  }

  if (exitCode === TIMEOUT_EXIT_CODE) {
    return {
      status: JOB_STATUS.TIMEOUT,
      reason: deadlineSecs != null
        ? `no terminal result within its ${deadlineSecs}s deadline — killed, not left running`
        : "killed by its deadline",
      elapsedSecs,
    };
  }

  if (exitCode === 0) return { status: JOB_STATUS.SUCCESS, reason: "exited 0", elapsedSecs };
  return { status: JOB_STATUS.FAILURE, reason: `exited ${exitCode}`, elapsedSecs };
}

/**
 * Read a receipt a wrapper wrote and say whether the job is finished.
 *
 * The ONLY completion signal. A caller polls for this rather than grepping a log, which is the
 * specific mistake being designed out: a receipt cannot say "done" unless the wrapper that ran the
 * command wrote it after collecting an exit code.
 *
 * @param {object|null} receipt parsed receipt, or null when the file is absent/unreadable
 * @returns {{ finished: boolean, status: string, reason: string }}
 */
export function readReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") {
    return { finished: false, status: JOB_STATUS.UNKNOWN, reason: "no receipt yet — the job has not reported" };
  }
  const status = String(receipt.status ?? "");
  if (!Object.values(JOB_STATUS).includes(status)) {
    /* A malformed receipt is NOT a finished job. Treating an unparseable status as terminal is how
       a corrupted file ends a wait with a made-up answer. */
    return { finished: false, status: JOB_STATUS.UNKNOWN, reason: `receipt carries an unknown status ${JSON.stringify(receipt.status)}` };
  }
  return { finished: true, status, reason: String(receipt.reason ?? "") };
}

/**
 * Should a bounded poller keep waiting? Uses an INJECTED clock so a caller can prove the bound
 * without living through it, and so no test depends on wall time.
 */
export function shouldKeepWaiting({ startedMs, nowMs, deadlineSecs }) {
  if (!Number.isFinite(startedMs) || !Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(deadlineSecs) || deadlineSecs <= 0) return false;
  return (nowMs - startedMs) / 1000 < deadlineSecs;
}
