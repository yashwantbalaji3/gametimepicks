/**
 * SPORT-SCOPED PATHS FOR THE LEARNING LOOP.
 *
 * The nightly loop that turns settled results back into calibration was MLB-only, and not by
 * configuration — `model-learning-audit.mjs` and `update-selection-learning.mjs` contain no sport
 * concept at all and read `public/data/mlb/...` literals. So a UFC or EPL result could never reach
 * the loop that is supposed to make its model better, however many of them settled.
 *
 * This resolves the loop's inputs per sport. Two rules it will not bend:
 *
 *   1. MLB RESOLVES TO EXACTLY THE OLD LITERALS. The refactor must be a no-op for the one sport that
 *      currently works; a learning loop that quietly changes what it reads is worse than one that
 *      only reads MLB. The guard asserts the strings, not the behaviour.
 *   2. AN UNKNOWN SPORT IS REFUSED, NEVER DEFAULTED. Falling back to MLB would let a UFC run report
 *      success while auditing baseball — a green run measuring the wrong sport is the failure mode
 *      this repo keeps finding, and it is worse than an error.
 */
import path from "node:path";
import fs from "node:fs";

/**
 * Per-sport layout of the three inputs the loop reads. Sports whose settlement chain does not yet
 * emit a leans ledger declare `ledger: null` — ABSENT is a state to report, not a path to invent.
 */
const LAYOUT = Object.freeze({
  mlb: { calDir: "public/data/mlb/results/calibration", boards: "public/data/mlb/boards", ledger: "public/data/mlb/results/settled_leans.jsonl" },
  ufc: { calDir: "public/data/ufc/results/calibration", boards: "public/data/ufc/schedule", ledger: "public/data/ufc/results/settled_leans.jsonl" },
  nfl: { calDir: "public/data/nfl/results/calibration", boards: "public/data/nfl/boards", ledger: "public/data/nfl/results/settled_leans.jsonl" },
  epl: { calDir: "public/data/epl/results/calibration", boards: "public/data/epl/boards", ledger: "public/data/epl/results/settled_leans.jsonl" },
  nba: { calDir: "public/data/nba/results/calibration", boards: "public/data/nba/boards", ledger: "public/data/nba/results/settled_leans.jsonl" },
});

/** Sports the loop knows how to locate. Membership is not a claim that data exists. */
export const LEARNING_SPORTS = Object.freeze(Object.keys(LAYOUT));

/**
 * Absolute input paths for one sport, plus what is actually present on disk.
 *
 * `ready` means every input EXISTS — it is deliberately separate from "this sport is known", so a
 * caller can tell "we cannot locate this sport" from "this sport has produced nothing yet". Those
 * are different facts and conflating them is how an empty run reads as a healthy one.
 *
 * @param {string} sport
 * @param {string} appRoot absolute path to the app/ directory
 */
export function sportLearningPaths(sport, appRoot) {
  const key = String(sport ?? "").toLowerCase();
  const l = LAYOUT[key];
  if (!l) {
    throw new Error(`learning-paths: unknown sport "${sport}" — known: ${LEARNING_SPORTS.join(", ")}. Refused rather than defaulted, so a run cannot audit a sport it was not asked for.`);
  }
  const calDir = path.join(appRoot, l.calDir);
  const boards = path.join(appRoot, l.boards);
  const ledger = l.ledger == null ? null : path.join(appRoot, l.ledger);
  const missing = [];
  if (!fs.existsSync(calDir)) missing.push(l.calDir);
  if (!fs.existsSync(boards)) missing.push(l.boards);
  if (ledger == null || !fs.existsSync(ledger)) missing.push(l.ledger ?? `${key} ledger (not declared)`);
  return { sport: key, calDir, boards, ledger, ready: missing.length === 0, missing };
}
