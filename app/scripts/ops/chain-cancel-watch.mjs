#!/usr/bin/env node
/**
 * MORNING-CHAIN CANCEL WATCH RUNNER (P258) — gathers run history with `gh`, prints the decision.
 * Judgement lives in src/lib/ops/chain-cancel-watch.mjs (guarded). Exit 0 always; the workflow
 * reads `state=` from GITHUB_OUTPUT and decides whether to alert.
 *
 * Usage: node app/scripts/ops/chain-cancel-watch.mjs [--now <iso>]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chainCancelWatch, etDateOf, MORNING_CHAIN } from "../../src/lib/ops/chain-cancel-watch.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const i = process.argv.indexOf("--now");
const nowIso = i >= 0 ? process.argv[i + 1] : new Date().toISOString();

/** null (not []) when gh cannot be reached — the watch reports UNKNOWN, never OK. */
function runs(workflow) {
  try {
    const out = execFileSync("gh", ["run", "list", "--workflow", `${workflow}.yml`, "--limit", "40", "--json", "createdAt,conclusion,status"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const result = chainCancelWatch({ etDate: etDateOf(nowIso), runsByWorkflow: Object.fromEntries(MORNING_CHAIN.map((w) => [w, runs(w)])) });
for (const line of result.lines) console.log(line);
console.log(`CHAIN_CANCEL_WATCH state=${result.state}`);
if (process.env.GITHUB_OUTPUT) {
  const reason = result.stranded.map((s) => `${s.workflow} cancelled at ${s.cancelledAt}, no later success`).join("; ") || result.state;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${result.state}\nreason=${reason}\n`);
}
