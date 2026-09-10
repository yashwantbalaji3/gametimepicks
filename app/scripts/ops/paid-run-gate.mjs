#!/usr/bin/env node
/**
 * PAID-RUN GATE RUNNER — gathers the evidence, prints the decision.
 *
 * Judgement lives in src/lib/ops/paid-run-gate.mjs and is guarded there. This file does the clock,
 * the filesystem and `gh`, so the guards can drive every state without any of the three.
 *
 * Output line 1 is `RUN <STATE> <reason>` or `SKIP <STATE> <reason>` — callers read the first
 * token. Exit code is 0 either way: a SKIP is a correct outcome, not a failure, and a workflow
 * that went red every time the gate did its job would be turned off within a week.
 *
 * Usage:
 *   node app/scripts/ops/paid-run-gate.mjs --workflow morning-projections.yml [--forced] [--now <iso>]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { decidePaidRun, formatDecision } from "../../src/lib/ops/paid-run-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

/** Today in ET. The pipeline's day boundary is ET everywhere; UTC here would spend twice near midnight. */
function etDate(nowIso) {
  const d = nowIso ? new Date(nowIso) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Newest MLB board on disk, or null. */
function newestBoardDate() {
  const dir = path.join(REPO, "app/public/data/mlb/boards");
  try {
    const dates = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Successful runs of this workflow that STARTED on today's ET date, excluding this one.
 *
 * Returns null — not 0 — when gh cannot be reached. The gate fails closed on null, and reporting
 * "no runs today" for "I could not look" is how a check comes to authorise the thing it exists to
 * prevent.
 */
function successfulRunsToday(workflow, today, selfRunId) {
  try {
    const out = execFileSync(
      "gh",
      ["run", "list", "--workflow", workflow, "--limit", "40", "--json", "createdAt,conclusion,databaseId"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(out).filter((r) => {
      if (selfRunId && String(r.databaseId) === String(selfRunId)) return false;
      if (r.conclusion !== "success") return false;
      return etDate(r.createdAt) === today;
    }).length;
  } catch {
    return null;
  }
}

const nowIso = arg("now");
const workflow = arg("workflow", "morning-projections.yml");
const today = etDate(nowIso);
const decision = decidePaidRun({
  forced: flag("forced"),
  etDate: today,
  successfulRunsToday: successfulRunsToday(workflow, today, process.env.GITHUB_RUN_ID),
  newestBoardDate: newestBoardDate(),
});

console.log(formatDecision(decision));
console.log(
  `PAID_RUN_GATE state=${decision.state} run=${decision.run} workflow=${workflow} et_date=${today}`,
);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `run=${decision.run}\nstate=${decision.state}\nreason=${decision.reason}\n`,
  );
}
