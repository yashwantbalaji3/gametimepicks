/**
 * ASK THE SETTLER WHAT IT COULD DECIDE — the one IO path behind the pending-card guard (v1.8).
 *
 * Separated from `pending-sweep-state.mjs` so the classifier stays pure, and shared with the tests so a
 * test exercises THE SAME call path the guard does. A helper tested in isolation while the guard calls
 * something slightly different is a guard nobody has actually tested: the first draft of this reached for
 * `node_modules/.bin/tsx`, which does not exist here because `tsx` is not a declared dependency, so every
 * probe returned null and every date classified BROKEN_SWEEP. It failed closed, which is right, but for
 * the wrong reason — and only running the real path found it.
 *
 * DRY RUN ONLY. No `--apply` is ever passed. The settler prints what it could decide and writes nothing:
 * this module must never settle a card, write a receipt, or touch a settlement-owned artifact.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { parseDecidability } from "./pending-sweep-state.mjs";

/**
 * `tsx` is not a declared dependency, so it is not reliably in node_modules/.bin; the suite itself reaches
 * it through npx. Same resolution order the analytics mutation test uses. Plain node cannot run the
 * settler — a transitive import is TypeScript.
 */
export function tsxCommand(appRoot) {
  const local = path.join(appRoot, "node_modules", ".bin", "tsx");
  return fs.existsSync(local) ? { cmd: local, args: [] } : { cmd: "npx", args: ["tsx"] };
}

/**
 * The settler's own count of what it can decide for `date`, or null when it could not be asked.
 *
 * Null is NEVER "no lag" — the caller must treat it as an unestablished state and fail closed, because
 * assuming lag on an absent answer is exactly how a broken sweep would pass as "waiting on the source".
 *
 * Capped at 120s with SIGKILL: an uncapped child is how one non-exiting process took the whole quality
 * gate to its 25-minute ceiling with no diagnosis at all.
 *
 * @param {string} appRoot absolute path to `app/`
 * @param {string} date    YYYY-MM-DD
 * @returns {{ decided: number, total: number } | null}
 */
export function settlerDecidability(appRoot, date) {
  const { cmd, args } = tsxCommand(appRoot);
  const r = spawnSync(cmd, [
    ...args,
    path.join(appRoot, "scripts", "parlays", "settle-lab-cards.mjs"),
    "--app-root", appRoot, "--now", new Date().toISOString(), "--date", date,
  ], { cwd: appRoot, encoding: "utf8", timeout: 120_000, killSignal: "SIGKILL" });
  return parseDecidability(`${r.stdout ?? ""}${r.stderr ?? ""}`, date);
}
